/**
 * Schematic CS2 radar / minimap preview.
 * Maps radar cvars to a drawable HUD widget over shared preview backgrounds.
 * Scoreboard / alternate-zoom toggles are display-only.
 */
const RadarRenderer = (() => {
  const PREVIEW_SIZE = 640;
  const ASPECT = 16 / 9;

  /** World space for a stylized two-site layout. */
  const MAP_BOUNDS = { minX: -1, maxX: 1, minY: -1, maxY: 1 };

  const PLAYER = { x: 0.05, y: 0.2, yaw: -0.55 };
  const TEAMMATES = [
    { x: -0.25, y: 0.05, color: '#4aa3ff' },
    { x: 0.28, y: -0.15, color: '#5ce08a' },
    { x: -0.1, y: -0.35, color: '#f0c14a' },
  ];
  const ENEMY = { x: 0.35, y: 0.05 };
  const BOMB = { x: 0.3, y: -0.35 };

  let scoreboardOpen = false;
  let useAlternateZoom = false;

  let animFrameId = null;
  let animCanvas = null;
  let getStateFn = null;
  let getBackgroundFn = null;

  let mapCache = null;

  function setScoreboardOpen(value) {
    scoreboardOpen = Boolean(value);
  }

  function isScoreboardOpen() {
    return scoreboardOpen;
  }

  function setUseAlternateZoom(value) {
    useAlternateZoom = Boolean(value);
  }

  function isUsingAlternateZoom() {
    return useAlternateZoom;
  }

  function isSquare(state) {
    return Number(state.cl_radar_square_always) === 1
      || (scoreboardOpen && Number(state.cl_radar_square_with_scoreboard) === 1);
  }

  function baseZoom(state) {
    const key = useAlternateZoom ? 'cl_radar_scale_alternate' : 'cl_radar_scale';
    const raw = Number(state[key]);
    return Number.isFinite(raw) ? raw : 0.7;
  }

  function effectiveZoom(state, timestamp) {
    const zoom = baseZoom(state);
    if (Number(state.cl_radar_scale_dynamic) !== 1) return zoom;
    const t = (timestamp ?? performance.now()) / 1000;
    const pulse = 0.08 * Math.sin(t * 2.2);
    return Math.max(0.25, Math.min(1, zoom + pulse));
  }

  /** Lower cl_radar_scale => more of the map visible. */
  function visibleHalfExtent(zoom) {
    return 0.55 / Math.max(0.25, zoom);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function paintMapGeometry(ctx, size) {
    const s = size;
    ctx.clearRect(0, 0, s, s);
    ctx.fillStyle = 'rgba(120, 145, 110, 0.92)';
    ctx.strokeStyle = 'rgba(30, 40, 28, 0.85)';
    ctx.lineWidth = Math.max(1.5, s * 0.008);

    roundRectPath(ctx, s * 0.08, s * 0.1, s * 0.84, s * 0.8, s * 0.04);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(95, 118, 88, 0.95)';
    ctx.fillRect(s * 0.18, s * 0.42, s * 0.64, s * 0.14);
    ctx.fillRect(s * 0.42, s * 0.18, s * 0.16, s * 0.64);

    ctx.fillStyle = 'rgba(140, 160, 125, 0.95)';
    roundRectPath(ctx, s * 0.52, s * 0.14, s * 0.32, s * 0.28, s * 0.03);
    ctx.fill();
    ctx.stroke();

    roundRectPath(ctx, s * 0.14, s * 0.56, s * 0.3, s * 0.28, s * 0.03);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(110, 130, 100, 0.9)';
    roundRectPath(ctx, s * 0.58, s * 0.58, s * 0.26, s * 0.24, s * 0.025);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, s * 0.14, s * 0.14, s * 0.24, s * 0.22, s * 0.025);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(20, 28, 18, 0.55)';
    ctx.font = `700 ${Math.round(s * 0.09)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', s * 0.68, s * 0.28);
    ctx.fillText('B', s * 0.29, s * 0.7);
  }

  function getMapTexture(mapPx) {
    const size = Math.max(64, Math.min(512, Math.round(mapPx)));
    if (mapCache && mapCache.size === size) return mapCache.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) paintMapGeometry(ctx, size);
    mapCache = { size, canvas };
    return canvas;
  }

  function worldToMapPx(x, y, mapPx) {
    const { minX, maxX, minY, maxY } = MAP_BOUNDS;
    const u = (x - minX) / (maxX - minX);
    const v = (y - minY) / (maxY - minY);
    return { x: u * mapPx, y: (1 - v) * mapPx };
  }

  function drawPlayerArrow(ctx, size, yaw, rotateRadar) {
    const arrowLen = size * 0.55;
    ctx.save();
    if (!rotateRadar) ctx.rotate(yaw);
    ctx.fillStyle = '#f5f7fa';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = Math.max(1, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, -arrowLen);
    ctx.lineTo(arrowLen * 0.55, arrowLen * 0.55);
    ctx.lineTo(0, arrowLen * 0.2);
    ctx.lineTo(-arrowLen * 0.55, arrowLen * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawDot(ctx, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, size * 0.12);
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawBomb(ctx, size) {
    ctx.save();
    ctx.fillStyle = '#f2c94c';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = Math.max(1, size * 0.1);
    const r = size * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemy(ctx, size) {
    ctx.save();
    ctx.fillStyle = '#e85d5d';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, size * 0.12);
    const r = size * 0.42;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.9, r * 0.75);
    ctx.lineTo(-r * 0.9, r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function clipWidget(ctx, cx, cy, radius, square) {
    ctx.beginPath();
    if (square) {
      ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
    ctx.clip();
  }

  function drawWidgetChrome(ctx, cx, cy, radius, square) {
    ctx.save();
    ctx.strokeStyle = 'rgba(210, 220, 230, 0.55)';
    ctx.lineWidth = Math.max(2, radius * 0.035);
    ctx.beginPath();
    if (square) {
      ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function paintBlurredBackdrop(ctx, sourceCanvas, cx, cy, radius, square) {
    const pad = Math.ceil(radius * 2 + 24);
    const off = document.createElement('canvas');
    off.width = pad;
    off.height = pad;
    const octx = off.getContext('2d');
    if (!octx) return;

    const sx = Math.max(0, Math.floor(cx - radius - 8));
    const sy = Math.max(0, Math.floor(cy - radius - 8));
    const sw = Math.min(sourceCanvas.width - sx, Math.ceil(radius * 2 + 16));
    const sh = Math.min(sourceCanvas.height - sy, Math.ceil(radius * 2 + 16));
    if (sw <= 0 || sh <= 0) return;

    octx.filter = 'blur(6px)';
    octx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    ctx.save();
    clipWidget(ctx, cx, cy, radius, square);
    ctx.drawImage(off, 0, 0, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  }

  function render(canvas, state, background = 'dark', timestamp) {
    if (!canvas || !state) return;

    const width = canvas.width || PREVIEW_SIZE;
    const height = canvas.height || Math.round(PREVIEW_SIZE / ASPECT);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    CrosshairRenderer.paintBackground(ctx, width, height, background);

    const hudScale = Number(state.cl_hud_radar_scale) || 1;
    const radius = Math.min(width, height) * 0.28 * hudScale;
    const margin = Math.min(width, height) * 0.04;
    const cx = margin + radius;
    const cy = margin + radius;
    const square = isSquare(state);
    const rotateRadar = Number(state.cl_radar_rotate) === 1;
    const centered = Number(state.cl_radar_always_centered) === 1;
    const alpha = Math.max(0, Math.min(1, Number(state.cl_hud_radar_background_alpha) || 0));
    const additive = Number(state.cl_hud_radar_map_additive) === 1;
    const blurBg = Number(state.cl_hud_radar_blur_background) === 1;
    const iconScale = Number(state.cl_radar_icon_scale_min) || 0.6;
    const zoom = effectiveZoom(state, timestamp);
    const halfExtent = visibleHalfExtent(zoom);
    const pxPerWorld = radius / halfExtent;
    const worldW = MAP_BOUNDS.maxX - MAP_BOUNDS.minX;
    const mapPx = worldW * pxPerWorld;

    if (blurBg) {
      paintBlurredBackdrop(ctx, canvas, cx, cy, radius, square);
    }

    ctx.save();
    clipWidget(ctx, cx, cy, radius, square);
    ctx.fillStyle = `rgba(8, 12, 10, ${alpha})`;
    if (square) {
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    const playerMap = worldToMapPx(PLAYER.x, PLAYER.y, mapPx);
    let viewOffsetX = 0;
    let viewOffsetY = 0;
    if (!centered) {
      if (rotateRadar) {
        viewOffsetX = Math.sin(PLAYER.yaw) * radius * 0.35;
        viewOffsetY = -Math.cos(PLAYER.yaw) * radius * 0.35;
      } else {
        viewOffsetY = radius * 0.28;
      }
    }

    ctx.save();
    clipWidget(ctx, cx, cy, radius, square);
    ctx.translate(cx + viewOffsetX, cy + viewOffsetY);

    if (rotateRadar) {
      ctx.rotate(-PLAYER.yaw);
    }

    ctx.translate(-playerMap.x, -playerMap.y);

    if (additive) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.85;
    }

    const mapTexture = getMapTexture(mapPx);
    ctx.drawImage(mapTexture, 0, 0, mapPx, mapPx);

    if (additive) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    const iconBase = Math.max(10, radius * 0.2) * (0.65 + iconScale * 0.85);

    for (const mate of TEAMMATES) {
      const p = worldToMapPx(mate.x, mate.y, mapPx);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (rotateRadar) ctx.rotate(PLAYER.yaw);
      drawDot(ctx, iconBase * 0.85, mate.color);
      ctx.restore();
    }

    {
      const p = worldToMapPx(ENEMY.x, ENEMY.y, mapPx);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (rotateRadar) ctx.rotate(PLAYER.yaw);
      drawEnemy(ctx, iconBase);
      ctx.restore();
    }

    {
      const p = worldToMapPx(BOMB.x, BOMB.y, mapPx);
      ctx.save();
      ctx.translate(p.x, p.y);
      if (rotateRadar) ctx.rotate(PLAYER.yaw);
      drawBomb(ctx, iconBase * 0.95);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(playerMap.x, playerMap.y);
    if (rotateRadar) ctx.rotate(PLAYER.yaw);
    drawPlayerArrow(ctx, iconBase * 1.15, PLAYER.yaw, rotateRadar);
    ctx.restore();

    ctx.restore();

    drawWidgetChrome(ctx, cx, cy, radius, square);
  }

  function isAnimating() {
    return animFrameId !== null;
  }

  function animationLoop(timestamp) {
    if (!animCanvas || !getStateFn || !getBackgroundFn) return;
    const state = getStateFn();
    if (Number(state.cl_radar_scale_dynamic) !== 1) {
      stopAnimation();
      render(animCanvas, state, getBackgroundFn(), timestamp);
      return;
    }
    render(animCanvas, state, getBackgroundFn(), timestamp);
    animFrameId = requestAnimationFrame(animationLoop);
  }

  function startAnimation(canvas, getState, getBackground) {
    animCanvas = canvas;
    getStateFn = getState;
    getBackgroundFn = getBackground;
    if (isAnimating()) return;
    animFrameId = requestAnimationFrame(animationLoop);
  }

  function stopAnimation() {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    animCanvas = null;
    getStateFn = null;
    getBackgroundFn = null;
  }

  return {
    render,
    startAnimation,
    stopAnimation,
    isAnimating,
    setScoreboardOpen,
    isScoreboardOpen,
    setUseAlternateZoom,
    isUsingAlternateZoom,
    PREVIEW_SIZE,
    ASPECT,
  };
})();
