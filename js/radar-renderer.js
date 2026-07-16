/**
 * CS2 radar / minimap preview from in-game screenshot plates (Ancient).
 * Maps radar cvars to a HUD widget over shared preview backgrounds.
 * Scoreboard / alternate-zoom toggles are preview-only.
 */
const RadarRenderer = (() => {
  const PREVIEW_SIZE = 640;
  const ASPECT = 16 / 9;
  const BASE = 'assets/radar';

  const ASSETS = {
    mapOpaque: `${BASE}/radar-map-ancient-on-black.png`,
    mapAlpha: `${BASE}/radar-map-ancient.png`,
  };

  /** Normalized map coordinates (0–1, origin top-left) on the Ancient plate. */
  const PLAYER = { u: 0.13, v: 0.79, yaw: 0.42 };
  const TEAMMATES = [
    { u: 0.24, v: 0.58, color: '#4aa3ff', label: '3' },
    { u: 0.52, v: 0.34, color: '#5ce08a', label: '7' },
    { u: 0.68, v: 0.48, color: '#f0c14a', label: '5' },
  ];
  const ENEMY = { u: 0.78, v: 0.62 };
  const BOMB = { u: 0.46, v: 0.7 };

  const BORDER_COLOR = 'rgba(148, 188, 208, 0.82)';
  const ZONE_LABEL = 'CT Start';

  const imageCache = new Map();
  const loading = new Set();
  let assetsReady = false;
  let onAssetsReady = null;

  let scoreboardOpen = false;
  let useAlternateZoom = false;

  let animFrameId = null;
  let animCanvas = null;
  let animCanvasSecondary = null;
  let getStateFn = null;
  let getBackgroundFn = null;

  const loadingEl = () => document.getElementById('radar-loading');

  function setLoading(visible, message) {
    const el = loadingEl();
    if (!el) return;
    el.hidden = !visible;
    if (message) el.textContent = message;
  }

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

  /** Lower cl_radar_scale => more of the map visible. Plate matches default 0.7. */
  function visibleHalfExtent(zoom) {
    return 0.7 / Math.max(0.25, zoom);
  }

  function loadImage(url) {
    if (!url) return Promise.resolve(null);
    if (imageCache.has(url)) {
      const cached = imageCache.get(url);
      if (cached.complete && cached.naturalWidth) return Promise.resolve(cached);
    }

    return new Promise((resolve) => {
      if (loading.has(url)) {
        const poll = () => {
          const img = imageCache.get(url);
          if (img?.complete) resolve(img.naturalWidth ? img : null);
          else requestAnimationFrame(poll);
        };
        poll();
        return;
      }

      loading.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        loading.delete(url);
        resolve(img);
      };
      img.onerror = () => {
        loading.delete(url);
        imageCache.delete(url);
        resolve(null);
      };
      img.src = url;
      imageCache.set(url, img);
    });
  }

  async function ensureAssets() {
    if (assetsReady) return true;
    setLoading(true, 'Loading radar…');
    const [opaque, alpha] = await Promise.all([
      loadImage(ASSETS.mapOpaque),
      loadImage(ASSETS.mapAlpha),
    ]);
    assetsReady = Boolean(opaque || alpha);
    setLoading(!assetsReady, assetsReady ? '' : 'Radar assets failed to load');
    if (assetsReady && typeof onAssetsReady === 'function') {
      const cb = onAssetsReady;
      onAssetsReady = null;
      cb();
    }
    return assetsReady;
  }

  function whenReady(callback) {
    if (assetsReady) callback();
    else onAssetsReady = callback;
    ensureAssets();
  }

  function uvToPx(u, v, mapPx) {
    return { x: u * mapPx, y: v * mapPx };
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
    ctx.strokeStyle = BORDER_COLOR;
    ctx.lineWidth = Math.max(1.5, radius * 0.018);
    ctx.beginPath();
    if (square) {
      ctx.rect(cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawZoneLabel(ctx, cx, cy, radius) {
    ctx.save();
    ctx.fillStyle = 'rgba(210, 225, 235, 0.92)';
    ctx.font = `600 ${Math.max(11, radius * 0.14)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(ZONE_LABEL, cx, cy + radius + radius * 0.08);
    ctx.restore();
  }

  function drawVisionCone(ctx, radius, yaw, rotateRadar) {
    const spread = 0.62;
    const length = radius * 3.8;
    const angle = rotateRadar ? 0 : yaw;
    ctx.save();
    ctx.rotate(angle);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, length);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.12)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, length, -spread, spread);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawPlayerIcon(ctx, size, yaw, rotateRadar, label = 'B') {
    const r = size * 0.46;
    drawVisionCone(ctx, size, yaw, rotateRadar);

    ctx.save();
    ctx.fillStyle = '#4da8e8';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, size * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const pointerAngle = rotateRadar ? 0 : yaw;
    const px = Math.sin(pointerAngle) * r * 1.05;
    const py = -Math.cos(pointerAngle) * r * 1.05;
    ctx.fillStyle = '#f5f7fa';
    ctx.beginPath();
    ctx.moveTo(px, py - size * 0.22);
    ctx.lineTo(px + size * 0.16, py + size * 0.1);
    ctx.lineTo(px - size * 0.16, py + size * 0.1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0d1117';
    ctx.font = `700 ${Math.max(8, size * 0.52)}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, size * 0.04);
    ctx.restore();
  }

  function drawTeammate(ctx, size, color, label) {
    const r = size * 0.42;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, size * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    if (label) {
      ctx.fillStyle = '#0d1117';
      ctx.font = `700 ${Math.max(7, size * 0.48)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);
    }
    ctx.restore();
  }

  function drawBomb(ctx, size) {
    ctx.save();
    ctx.fillStyle = '#f2c94c';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = Math.max(1, size * 0.1);
    const r = size * 0.38;
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
    ctx.lineWidth = Math.max(1, size * 0.1);
    const r = size * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.9, r * 0.75);
    ctx.lineTo(-r * 0.9, r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function paintBlurredBackdrop(ctx, sourceCanvas, cx, cy, radius, square) {
    const off = document.createElement('canvas');
    const pad = Math.ceil(radius * 2 + 24);
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

  function withMapTransform(ctx, mapPx, playerPx, state, rotateRadar, drawFn) {
    const centered = Number(state.cl_radar_always_centered) === 1;

    let viewOffsetX = 0;
    let viewOffsetY = 0;
    if (!centered) {
      if (rotateRadar) {
        viewOffsetX = Math.sin(PLAYER.yaw) * mapPx * 0.08;
        viewOffsetY = -Math.cos(PLAYER.yaw) * mapPx * 0.08;
      } else {
        viewOffsetY = mapPx * 0.06;
      }
    }

    ctx.save();
    ctx.translate(-playerPx.x + mapPx * 0.5 + viewOffsetX, -playerPx.y + mapPx * 0.5 + viewOffsetY);

    if (rotateRadar) {
      ctx.translate(playerPx.x, playerPx.y);
      ctx.rotate(-PLAYER.yaw);
      ctx.translate(-playerPx.x, -playerPx.y);
    }

    drawFn();
    ctx.restore();
  }

  function drawMapLayer(ctx, mapImage, mapPx, state) {
    const additive = Number(state.cl_hud_radar_map_additive) === 1;

    if (additive) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.88;
    }

    ctx.drawImage(mapImage, 0, 0, mapPx, mapPx);

    if (additive) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  function drawIcons(ctx, mapPx, rotateRadar, iconBase) {
    for (const mate of TEAMMATES) {
      const p = uvToPx(mate.u, mate.v, mapPx);
      ctx.save();
      ctx.translate(p.x, p.y);
      drawTeammate(ctx, iconBase * 0.82, mate.color, mate.label);
      ctx.restore();
    }

    {
      const p = uvToPx(ENEMY.u, ENEMY.v, mapPx);
      ctx.save();
      ctx.translate(p.x, p.y);
      drawEnemy(ctx, iconBase);
      ctx.restore();
    }

    {
      const p = uvToPx(BOMB.u, BOMB.v, mapPx);
      ctx.save();
      ctx.translate(p.x, p.y);
      drawBomb(ctx, iconBase * 0.92);
      ctx.restore();
    }

    const playerPx = uvToPx(PLAYER.u, PLAYER.v, mapPx);
    ctx.save();
    ctx.translate(playerPx.x, playerPx.y);
    drawPlayerIcon(ctx, iconBase * 1.1, PLAYER.yaw, rotateRadar, 'B');
    ctx.restore();
  }

  async function render(canvas, state, background = 'dark', timestamp) {
    if (!canvas || !state) return;
    const ready = await ensureAssets();
    if (!ready) return;

    const mapOpaque = imageCache.get(ASSETS.mapOpaque);
    const mapAlpha = imageCache.get(ASSETS.mapAlpha);
    const mapImage = Number(state.cl_hud_radar_map_additive) === 1
      ? (mapAlpha || mapOpaque)
      : (mapOpaque || mapAlpha);
    if (!mapImage?.naturalWidth) return;

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
    const alpha = Math.max(0, Math.min(1, Number(state.cl_hud_radar_background_alpha) || 0));
    const blurBg = Number(state.cl_hud_radar_blur_background) === 1;
    const iconScale = Number(state.cl_radar_icon_scale_min) || 0.6;
    const zoom = effectiveZoom(state, timestamp);
    const halfExtent = visibleHalfExtent(zoom);
    const pxPerWorld = radius / halfExtent;
    const mapPx = pxPerWorld * 2;
    const playerPx = uvToPx(PLAYER.u, PLAYER.v, mapPx);
    const iconBase = Math.max(10, radius * 0.19) * (0.65 + iconScale * 0.85);

    if (blurBg) {
      paintBlurredBackdrop(ctx, canvas, cx, cy, radius, square);
    }

    ctx.save();
    clipWidget(ctx, cx, cy, radius, square);
    ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    if (square) {
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    clipWidget(ctx, cx, cy, radius, square);
    ctx.translate(cx, cy);
    withMapTransform(ctx, mapPx, playerPx, state, rotateRadar, () => {
      drawMapLayer(ctx, mapImage, mapPx, state);
      drawIcons(ctx, mapPx, rotateRadar, iconBase);
    });
    ctx.restore();

    drawWidgetChrome(ctx, cx, cy, radius, square);
    drawZoneLabel(ctx, cx, cy, radius);
  }

  function isAnimating() {
    return animFrameId !== null;
  }

  function animationLoop(timestamp) {
    if (!animCanvas || !getStateFn || !getBackgroundFn) return;
    const state = getStateFn();
    const background = getBackgroundFn();
    render(animCanvas, state, background, timestamp);
    if (animCanvasSecondary) render(animCanvasSecondary, state, background, timestamp);
    if (Number(state.cl_radar_scale_dynamic) !== 1) {
      stopAnimation();
      return;
    }
    animFrameId = requestAnimationFrame(animationLoop);
  }

  function startAnimation(canvas, getState, getBackground, secondaryCanvas = null) {
    animCanvas = canvas;
    animCanvasSecondary = secondaryCanvas || null;
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
    animCanvasSecondary = null;
    getStateFn = null;
    getBackgroundFn = null;
  }

  whenReady(() => {
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('cs2-radar-assets-ready'));
    }
  });

  return {
    render,
    startAnimation,
    stopAnimation,
    isAnimating,
    whenReady,
    setScoreboardOpen,
    isScoreboardOpen,
    setUseAlternateZoom,
    isUsingAlternateZoom,
    PREVIEW_SIZE,
    ASPECT,
  };
})();
