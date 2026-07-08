/**
 * Canvas renderer for CS2 crosshair preview.
 * Based on the rectangle-based algorithm used by community crosshair tools.
 */
const CrosshairRenderer = (() => {
  const INTERNAL_SIZE = 64;
  const PREVIEW_SIZE = 512;
  const ANIMATION_CYCLE_MS = 1800;

  let animFrameId = null;
  let animCanvas = null;
  let getStateFn = null;
  let getBackgroundFn = null;

  function isDynamicStyle(style) {
    return style === 0 || style === 2 || style === 3;
  }

  function isAnimating() {
    return animFrameId !== null;
  }

  function getDynamicFactor(timestamp) {
    const phase = (timestamp % ANIMATION_CYCLE_MS) / ANIMATION_CYCLE_MS;
    return (1 - Math.cos(phase * Math.PI * 2)) / 2;
  }

  function resolveColor(state) {
    const useAlpha = state.cl_crosshairusealpha === 1;
    const alpha = useAlpha ? state.cl_crosshairalpha / 255 : 1;
    let rgb;

    if (state.cl_crosshaircolor === 5) {
      rgb = [
        state.cl_crosshaircolor_r,
        state.cl_crosshaircolor_g,
        state.cl_crosshaircolor_b,
      ];
    } else {
      rgb = CROSSHAIR_PRESET_COLORS[state.cl_crosshaircolor] || CROSSHAIR_PRESET_COLORS[1];
    }

    return { r: rgb[0], g: rgb[1], b: rgb[2], a: alpha };
  }

  function withAlpha(color, mod) {
    return { r: color.r, g: color.g, b: color.b, a: color.a * mod };
  }

  function computeDotBounds(thickness, centerX, centerY) {
    const t = Math.max(0.5, thickness * 2);
    const rb = Math.floor(t / 2);
    const lt = t - rb;
    return {
      x0: centerX - lt,
      y0: centerY - lt,
      x1: centerX + rb,
      y1: centerY + rb,
    };
  }

  function computeArms(dot, gap, size) {
    const topBase = dot.y0 - 4 - gap;
    const bottomBase = dot.y1 + 4 + gap;
    const leftBase = dot.x0 - 4 - gap;
    const rightBase = dot.x1 + 4 + gap;
    const armLen = size * 2;

    return [
      { x0: dot.x0, y0: topBase - armLen, x1: dot.x1, y1: topBase, side: 'top' },
      { x0: dot.x0, y0: bottomBase, x1: dot.x1, y1: bottomBase + armLen, side: 'bottom' },
      { x0: leftBase - armLen, y0: dot.y0, x1: leftBase, y1: dot.y1, side: 'left' },
      { x0: rightBase, y0: dot.y0, x1: rightBase + armLen, y1: dot.y1, side: 'right' },
    ];
  }

  function splitArm(arm, splitRatio, splitOffset) {
    const innerRatio = Math.max(0, Math.min(1, splitRatio));
    const armLen = arm.side === 'left' || arm.side === 'right'
      ? arm.x1 - arm.x0
      : arm.y1 - arm.y0;
    const innerLen = armLen * innerRatio;

    switch (arm.side) {
      case 'right':
        return {
          inner: { x0: arm.x0, y0: arm.y0, x1: arm.x0 + innerLen, y1: arm.y1 },
          outer: {
            x0: arm.x0 + innerLen + splitOffset,
            y0: arm.y0,
            x1: arm.x0 + armLen + splitOffset,
            y1: arm.y1,
          },
        };
      case 'left':
        return {
          inner: { x0: arm.x1 - innerLen, y0: arm.y0, x1: arm.x1, y1: arm.y1 },
          outer: {
            x0: arm.x0 - splitOffset,
            y0: arm.y0,
            x1: arm.x1 - innerLen - splitOffset,
            y1: arm.y1,
          },
        };
      case 'top':
        return {
          inner: { x0: arm.x0, y0: arm.y1 - innerLen, x1: arm.x1, y1: arm.y1 },
          outer: {
            x0: arm.x0,
            y0: arm.y0 - splitOffset,
            x1: arm.x1,
            y1: arm.y1 - innerLen - splitOffset,
          },
        };
      case 'bottom':
        return {
          inner: { x0: arm.x0, y0: arm.y0, x1: arm.x1, y1: arm.y0 + innerLen },
          outer: {
            x0: arm.x0,
            y0: arm.y0 + innerLen + splitOffset,
            x1: arm.x1,
            y1: arm.y1 + splitOffset,
          },
        };
      default:
        return { inner: arm, outer: null };
    }
  }

  function drawRect(ctx, rect, color, scale) {
    const w = (rect.x1 - rect.x0) * scale;
    const h = (rect.y1 - rect.y0) * scale;
    if (w <= 0 || h <= 0) return;

    ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    ctx.fillRect(rect.x0 * scale, rect.y0 * scale, w, h);
  }

  function drawOutline(ctx, rect, pad, scale) {
    drawRect(ctx, {
      x0: rect.x0 - pad,
      y0: rect.y0 - pad,
      x1: rect.x1 + pad,
      y1: rect.y1 + pad,
    }, { r: 0, g: 0, b: 0, a: 1 }, scale);
  }

  function drawPart(ctx, rect, color, drawOutlineEnabled, outlinePad, scale) {
    if (drawOutlineEnabled) drawOutline(ctx, rect, outlinePad, scale);
    drawRect(ctx, rect, color, scale);
  }

  function drawArm(ctx, arm, color, drawOutlineEnabled, outlinePad, scale, dynamic) {
    const { style, factor, splitDist, splitRatio, innerAlphaMod, outerAlphaMod } = dynamic;

    if (style !== 2 || factor <= 0) {
      drawPart(ctx, arm, color, drawOutlineEnabled, outlinePad, scale);
      return;
    }

    const splitOffset = splitDist * factor;
    const { inner, outer } = splitArm(arm, splitRatio, splitOffset);

    drawPart(
      ctx,
      inner,
      withAlpha(color, innerAlphaMod),
      drawOutlineEnabled,
      outlinePad,
      scale,
    );

    if (outer && splitRatio < 1) {
      drawPart(
        ctx,
        outer,
        withAlpha(color, outerAlphaMod),
        drawOutlineEnabled,
        outlinePad,
        scale,
      );
    }
  }

  const imageCache = new Map();

  function drawSolidBackground(ctx, width, height, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }

  function drawImageCover(ctx, width, height, img) {
    if (!img?.complete || !img.naturalWidth) return false;

    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const scale = Math.max(width / sw, height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
    return true;
  }

  function drawProceduralBackground(ctx, width, height, mode) {
    if (mode === 'light') {
      drawSolidBackground(ctx, width, height, '#c4b89a');
      return;
    }

    if (mode === 'black') {
      drawSolidBackground(ctx, width, height, '#000000');
      return;
    }

    if (mode === 'white') {
      drawSolidBackground(ctx, width, height, '#ffffff');
      return;
    }

    if (mode === 'checker') {
      const tile = 16;
      for (let y = 0; y < height; y += tile) {
        for (let x = 0; x < width; x += tile) {
          const even = ((x / tile) + (y / tile)) % 2 === 0;
          ctx.fillStyle = even ? '#3a3a3a' : '#2a2a2a';
          ctx.fillRect(x, y, tile, tile);
        }
      }
      return;
    }

    const grad = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, width * 0.6,
    );
    grad.addColorStop(0, '#4a4540');
    grad.addColorStop(1, '#2a2825');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  function drawBackground(ctx, width, height, mode) {
    const bg = Backgrounds.getById(mode);

    if (bg.type === 'image') {
      const img = imageCache.get(bg.id);
      if (!drawImageCover(ctx, width, height, img)) {
        drawProceduralBackground(ctx, width, height, Backgrounds.DEFAULT_ID);
      }
      return;
    }

    drawProceduralBackground(ctx, width, height, mode);
  }

  function preloadImages(onReady) {
    const items = Backgrounds.getImageItems().filter((item) => !imageCache.has(item.id));
    if (items.length === 0) {
      onReady?.();
      return;
    }

    let pending = items.length;
    const done = () => {
      pending -= 1;
      if (pending === 0) onReady?.();
    };

    for (const item of items) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = done;
      img.onerror = done;
      img.src = item.src;
      imageCache.set(item.id, img);
    }
  }

  function getEffectiveGap(state, dynamicFactor) {
    const gap = state.cl_crosshairgap;
    if (!isDynamicStyle(state.cl_crosshairstyle) || state.cl_crosshairstyle === 2) {
      return gap;
    }
    return gap + state.cl_crosshair_dynamic_splitdist * dynamicFactor;
  }

  function drawCrosshair(ctx, displaySize, state, background, dynamicFactor = 0) {
    const scale = 1;
    const offsetX = Math.floor((displaySize - INTERNAL_SIZE) / 2);
    const offsetY = Math.floor((displaySize - INTERNAL_SIZE) / 2);
    const centerX = Math.floor(INTERNAL_SIZE / 2);
    const centerY = Math.floor(INTERNAL_SIZE / 2);

    ctx.clearRect(0, 0, displaySize, displaySize);
    drawBackground(ctx, displaySize, displaySize, background);

    ctx.save();
    ctx.translate(offsetX, offsetY);

    const color = resolveColor(state);
    const thickness = state.cl_crosshairthickness;
    const gap = getEffectiveGap(state, dynamicFactor);
    const size = state.cl_crosshairsize;
    const showDot = state.cl_crosshairdot === 1;
    const tShape = state.cl_crosshair_t === 1;
    const drawOutlineEnabled = state.cl_crosshair_drawoutline === 1;
    const outlinePad = state.cl_crosshair_outlinethickness;
    const style = state.cl_crosshairstyle;

    const dynamic = {
      style,
      factor: dynamicFactor,
      splitDist: state.cl_crosshair_dynamic_splitdist,
      splitRatio: state.cl_crosshair_dynamic_maxdist_splitratio,
      innerAlphaMod: state.cl_crosshair_dynamic_splitalpha_innermod,
      outerAlphaMod: state.cl_crosshair_dynamic_splitalpha_outermod,
    };

    const dot = computeDotBounds(thickness, centerX, centerY);
    const arms = computeArms(dot, gap, size);

    if (showDot) {
      drawPart(ctx, dot, color, drawOutlineEnabled, outlinePad, scale);
    }

    if (size !== 0) {
      for (const arm of arms) {
        if (tShape && arm.side === 'top') continue;
        drawArm(ctx, arm, color, drawOutlineEnabled, outlinePad, scale, dynamic);
      }
    }

    ctx.restore();
  }

  /**
   * Render crosshair onto canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {object} state - crosshair cvar state
   * @param {string} background - background id from Backgrounds config
   * @param {number} [dynamicFactor=0] - 0 = resting, 1 = full movement spread
   */
  function render(canvas, state, background = 'dark', dynamicFactor = 0) {
    const ctx = canvas.getContext('2d');
    drawCrosshair(ctx, canvas.width, state, background, dynamicFactor);
  }

  function animationLoop(timestamp) {
    if (!animCanvas || !getStateFn || !getBackgroundFn) return;

    const state = getStateFn();
    if (!isDynamicStyle(state.cl_crosshairstyle)) {
      stopAnimation();
      return;
    }

    render(animCanvas, state, getBackgroundFn(), getDynamicFactor(timestamp));
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
    resolveColor,
    preloadImages,
    isDynamicStyle,
    isAnimating,
    startAnimation,
    stopAnimation,
    INTERNAL_SIZE,
    PREVIEW_SIZE,
  };
})();
