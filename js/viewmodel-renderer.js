/**
 * Canvas renderer for an approximate CS2 first-person viewmodel preview.
 * Maps viewmodel_fov / offset_x / offset_y / offset_z onto a stylized rifle silhouette.
 */
const ViewmodelRenderer = (() => {
  const PREVIEW_SIZE = 640;

  const FOV_MIN = 54;
  const FOV_MAX = 68;
  const OFFSET_X = { min: -2.5, max: 2.5 };
  const OFFSET_Y = { min: -2, max: 2 };
  const OFFSET_Z = { min: -2, max: 2 };

  const PRESET_LABELS = {
    1: 'Desktop',
    2: 'Couch',
    3: 'Classic',
  };

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function normalize(value, min, max) {
    if (max === min) return 0.5;
    return clamp01((value - min) / (max - min));
  }

  function getPresetLabel(preset) {
    return PRESET_LABELS[preset] ?? `Preset ${preset}`;
  }

  /**
   * Convert cvars into screen-space placement for a right-hand rifle silhouette.
   * Axes follow the in-app labels: X left/right, Y closer/farther, Z down/up.
   */
  function computeLayout(state, width, height) {
    const fov = Number(state.viewmodel_fov);
    const offsetX = Number(state.viewmodel_offset_x);
    const offsetY = Number(state.viewmodel_offset_y);
    const offsetZ = Number(state.viewmodel_offset_z);

    const fovT = normalize(fov, FOV_MIN, FOV_MAX);
    const yT = normalize(offsetY, OFFSET_Y.min, OFFSET_Y.max);

    // Higher FOV pulls the gun away from center (smaller, more cornered).
    const scale = lerp(1.22, 0.72, fovT) * lerp(1.12, 0.88, yT);

    const baseX = width * lerp(0.58, 0.72, fovT);
    const baseY = height * lerp(0.62, 0.78, fovT);

    const xTravel = width * 0.14;
    const zTravel = height * 0.12;
    const yTravel = height * 0.04;

    const xNorm = (offsetX - (OFFSET_X.min + OFFSET_X.max) / 2)
      / ((OFFSET_X.max - OFFSET_X.min) / 2);
    const zNorm = (offsetZ - (OFFSET_Z.min + OFFSET_Z.max) / 2)
      / ((OFFSET_Z.max - OFFSET_Z.min) / 2);
    const yNorm = (offsetY - (OFFSET_Y.min + OFFSET_Y.max) / 2)
      / ((OFFSET_Y.max - OFFSET_Y.min) / 2);

    return {
      x: baseX + xNorm * xTravel + yNorm * width * 0.03,
      y: baseY - zNorm * zTravel + yNorm * yTravel,
      scale,
      rotation: lerp(-0.42, -0.28, fovT) + xNorm * 0.04,
    };
  }

  function drawAimPoint(ctx, width, height) {
    const cx = width / 2;
    const cy = height / 2;
    const arm = Math.max(6, width * 0.012);
    const gap = Math.max(3, width * 0.006);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(1, width * 0.002);
    ctx.beginPath();
    ctx.moveTo(cx - arm - gap, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + arm + gap, cy);
    ctx.moveTo(cx, cy - arm - gap);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + arm + gap);
    ctx.stroke();
    ctx.restore();
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

  function fillPart(ctx, x, y, w, h, r, fill, stroke) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
  }

  function drawRifle(ctx, layout) {
    const unit = 120 * layout.scale;

    ctx.save();
    ctx.translate(layout.x, layout.y);
    ctx.rotate(layout.rotation);
    ctx.scale(layout.scale, layout.scale);

    // Soft ground contact / hand shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.beginPath();
    ctx.ellipse(18, 52, 70, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    const metal = '#3d4450';
    const metalDark = '#2a3038';
    const accent = '#f97316';
    const hand = '#c4a574';
    const handDark = '#9a7d52';
    const stroke = 'rgba(0, 0, 0, 0.45)';

    // Mag
    fillPart(ctx, -8, 8, 22, 38, 3, metalDark, stroke);

    // Receiver / body
    fillPart(ctx, -55, -10, 120, 28, 4, metal, stroke);

    // Handguard
    fillPart(ctx, -115, -8, 70, 22, 3, metalDark, stroke);

    // Barrel
    fillPart(ctx, -155, -3, 48, 10, 2, '#1f242b', stroke);

    // Front sight
    fillPart(ctx, -150, -14, 6, 14, 1, accent, null);

    // Rear sight / dust cover line
    fillPart(ctx, 20, -16, 28, 8, 2, metalDark, stroke);

    // Stock
    fillPart(ctx, 60, -6, 55, 18, 3, metalDark, stroke);
    fillPart(ctx, 100, -2, 18, 28, 2, metal, stroke);

    // Grip
    ctx.save();
    ctx.translate(28, 18);
    ctx.rotate(0.55);
    fillPart(ctx, -8, 0, 16, 34, 3, metalDark, stroke);
    ctx.restore();

    // Hands
    fillPart(ctx, 10, 14, 28, 20, 8, hand, stroke);
    fillPart(ctx, -70, 8, 26, 18, 8, handDark, stroke);

    // Muzzle flash cue (static)
    ctx.fillStyle = 'rgba(249, 115, 22, 0.15)';
    ctx.beginPath();
    ctx.ellipse(-160, 2, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawHudChrome(ctx, width, height, state) {
    const pad = Math.max(10, width * 0.02);
    const label = getPresetLabel(state.viewmodel_presetpos);

    ctx.save();
    ctx.font = `${Math.max(11, Math.round(width * 0.022))}px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textBaseline = 'top';
    ctx.fillText(`${label}  ·  FOV ${state.viewmodel_fov}`, pad, pad);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillText(
      `X ${state.viewmodel_offset_x}   Y ${state.viewmodel_offset_y}   Z ${state.viewmodel_offset_z}`,
      pad,
      pad + Math.max(16, width * 0.03),
    );
    ctx.restore();
  }

  function render(canvas, state, background = 'dark') {
    if (!canvas) return;

    const width = canvas.width || PREVIEW_SIZE;
    const height = canvas.height || PREVIEW_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    CrosshairRenderer.paintBackground(ctx, width, height, background);
    drawAimPoint(ctx, width, height);
    drawRifle(ctx, computeLayout(state, width, height));
    drawHudChrome(ctx, width, height, state);
  }

  return {
    render,
    computeLayout,
    getPresetLabel,
    PREVIEW_SIZE,
  };
})();
