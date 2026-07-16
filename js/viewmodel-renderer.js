/**
 * CS2 viewmodel preview from real in-game screenshot plates.
 * Blends FOV / offset extremes and snaps to Desktop / Classic preset shots.
 */
const ViewmodelRenderer = (() => {
  /** Fallback CSS width when the wrap is hidden / unmeasured. */
  const PREVIEW_SIZE = 640;
  /** Matches capture plates (1920×804 ≈ 3440×1440 ultrawide). */
  const ASPECT = 1920 / 804;
  const BASE = 'assets/viewmodels';

  const FOV = { min: 60, max: 68 };
  const OFFSET_X = { min: -2, max: 2.5, def: 1 };
  const OFFSET_Y = { min: -2, max: 2, def: 1 };
  const OFFSET_Z = { min: -2, max: 2, def: -1 };

  const PRESET_LABELS = {
    1: 'Desktop',
    2: 'Classic',
  };

  const WEAPONS = {
    ak: {
      id: 'ak',
      label: 'AK',
      fovMin: `${BASE}/fov/fov-ak-min.webp`,
      fovMax: `${BASE}/fov/fov-ak-max.webp`,
      xMin: `${BASE}/x/x-ak-min.webp`,
      xMax: `${BASE}/x/x-ak-max.webp`,
      yMin: `${BASE}/y/y-ak-min.webp`,
      yMax: `${BASE}/y/y-ak-max.webp`,
      zMin: `${BASE}/z/z-ak-min.webp`,
      zMax: `${BASE}/z/z-ak-max.webp`,
      // Filenames follow capture numbers; UI labels follow live CS2 (1=Desktop, 2=Classic).
      preset1: `${BASE}/presets/viewmodel-ak-presetpos-1-classic.webp`,
      preset2: `${BASE}/presets/viewmodel-ak-presetpos-2-desktop.webp`,
    },
    glock: {
      id: 'glock',
      label: 'Glock',
      fovMin: `${BASE}/fov/fov-glock-min.webp`,
      fovMax: `${BASE}/fov/fov-glock-max.webp`,
      xMin: `${BASE}/x/x-glock-min.webp`,
      xMax: `${BASE}/x/x-glock-max.webp`,
      yMin: `${BASE}/y/y-glock-min.webp`,
      yMax: `${BASE}/y/y-glock-max.webp`,
      zMin: `${BASE}/z/z-glock-min.webp`,
      zMax: `${BASE}/z/z-glock-max.webp`,
      preset1: `${BASE}/presets/viewmodel-glock-presetpos-1-classic.webp`,
      preset2: `${BASE}/presets/viewmodel-glock-presetpos-2-desktop.webp`,
    },
  };

  const imageCache = new Map();
  const loading = new Set();
  let weaponId = 'ak';
  let scratchA = null;
  let scratchB = null;

  const hudEl = () => document.getElementById('viewmodel-hud');
  const loadingEl = () => document.getElementById('viewmodel-loading');

  function getPresetLabel(preset) {
    return PRESET_LABELS[preset] ?? `Preset ${preset}`;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function setLoading(visible, message) {
    const el = loadingEl();
    if (!el) return;
    el.hidden = !visible;
    if (message) el.textContent = message;
  }

  function updateHud(state) {
    const el = hudEl();
    if (!el || !state) return;
    const weapon = WEAPONS[weaponId]?.label ?? weaponId;
    el.textContent = [
      `${weapon}  ·  ${getPresetLabel(state.viewmodel_presetpos)}  ·  FOV ${state.viewmodel_fov}`,
      `X ${state.viewmodel_offset_x}   Y ${state.viewmodel_offset_y}   Z ${state.viewmodel_offset_z}`,
    ].join('\n');
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

  function sourceSize(source) {
    if (!source) return null;
    if (source.naturalWidth) {
      return { w: source.naturalWidth, h: source.naturalHeight };
    }
    if (source.width && source.height) {
      return { w: source.width, h: source.height };
    }
    return null;
  }

  function drawCover(ctx, source, width, height) {
    const size = sourceSize(source);
    if (!size) return false;
    const scale = Math.max(width / size.w, height / size.h);
    const dw = size.w * scale;
    const dh = size.h * scale;
    ctx.drawImage(source, (width - dw) / 2, (height - dh) / 2, dw, dh);
    return true;
  }

  function ensureScratch(slot, width, height) {
    let canvas = slot === 'b' ? scratchB : scratchA;
    if (!canvas) {
      canvas = document.createElement('canvas');
      if (slot === 'b') scratchB = canvas;
      else scratchA = canvas;
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }

  /** Crossfade imgA → imgB by t into ctx (cover-fit). */
  function paintCrossfade(ctx, imgA, imgB, t, width, height) {
    const amount = clamp01(t);
    if (!imgA && !imgB) return false;
    if (!imgB || amount <= 0.001) return drawCover(ctx, imgA, width, height);
    if (!imgA || amount >= 0.999) return drawCover(ctx, imgB, width, height);

    drawCover(ctx, imgA, width, height);
    ctx.save();
    ctx.globalAlpha = amount;
    drawCover(ctx, imgB, width, height);
    ctx.restore();
    return true;
  }

  function isNearDefaultOffsets(state) {
    return Number(state.viewmodel_fov) === FOV.min
      && Number(state.viewmodel_offset_x) === OFFSET_X.def
      && Number(state.viewmodel_offset_y) === OFFSET_Y.def
      && Number(state.viewmodel_offset_z) === OFFSET_Z.def;
  }

  function axisBlendTowardExtreme(value, def, min, max) {
    if (value < def) {
      const span = def - min;
      return { side: 'min', t: span > 0 ? clamp01((def - value) / span) : 0 };
    }
    if (value > def) {
      const span = max - def;
      return { side: 'max', t: span > 0 ? clamp01((value - def) / span) : 0 };
    }
    return { side: null, t: 0 };
  }

  async function resolvePlates(weapon) {
    const urls = [
      weapon.fovMin, weapon.fovMax,
      weapon.xMin, weapon.xMax,
      weapon.yMin, weapon.yMax,
      weapon.zMin, weapon.zMax,
      weapon.preset1, weapon.preset2,
    ];
    const imgs = await Promise.all(urls.map(loadImage));
    const [
      fovMin, fovMax, xMin, xMax, yMin, yMax, zMin, zMax, preset1, preset2,
    ] = imgs;
    return { fovMin, fovMax, xMin, xMax, yMin, yMax, zMin, zMax, preset1, preset2 };
  }

  function paintCustom(ctx, plates, state, width, height) {
    const fov = Number(state.viewmodel_fov);
    const fovT = (fov - FOV.min) / (FOV.max - FOV.min);

    const tmp = ensureScratch('a', width, height);
    const tctx = tmp.getContext('2d');
    tctx.clearRect(0, 0, width, height);

    if (!paintCrossfade(tctx, plates.fovMin, plates.fovMax, fovT, width, height)) {
      return false;
    }

    const axes = [
      {
        ...axisBlendTowardExtreme(Number(state.viewmodel_offset_x), OFFSET_X.def, OFFSET_X.min, OFFSET_X.max),
        minImg: plates.xMin,
        maxImg: plates.xMax,
      },
      {
        ...axisBlendTowardExtreme(Number(state.viewmodel_offset_y), OFFSET_Y.def, OFFSET_Y.min, OFFSET_Y.max),
        minImg: plates.yMin,
        maxImg: plates.yMax,
      },
      {
        ...axisBlendTowardExtreme(Number(state.viewmodel_offset_z), OFFSET_Z.def, OFFSET_Z.min, OFFSET_Z.max),
        minImg: plates.zMin,
        maxImg: plates.zMax,
      },
    ];

    // Strongest offset axis gets a layered crossfade so multi-axis won't muddy.
    let best = null;
    for (const axis of axes) {
      if (axis.t > 0.02 && (axis.side === 'min' ? axis.minImg : axis.maxImg)) {
        if (!best || axis.t > best.t) best = axis;
      }
    }

    if (best) {
      const extreme = best.side === 'min' ? best.minImg : best.maxImg;
      return paintCrossfade(ctx, tmp, extreme, best.t * 0.85, width, height);
    }

    ctx.drawImage(tmp, 0, 0);
    return true;
  }

  async function render(canvas, state, background = 'dark') {
    if (!canvas || !state) return;

    updateHud(state);
    setLoading(true, 'Loading screenshots…');

    const width = canvas.width || PREVIEW_SIZE;
    const height = canvas.height || Math.round(PREVIEW_SIZE / ASPECT);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    CrosshairRenderer.paintBackground(ctx, width, height, background);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const weapon = WEAPONS[weaponId] || WEAPONS.ak;
    const plates = await resolvePlates(weapon);

    const ready = Boolean(plates.fovMin || plates.fovMax || plates.preset1 || plates.preset2);
    if (!ready) {
      setLoading(true, 'Add CS2 screenshots to assets/viewmodels');
      return;
    }

    setLoading(false);

    const usePresetPlate = isNearDefaultOffsets(state);
    let painted = false;

    if (usePresetPlate) {
      const presetImg = Number(state.viewmodel_presetpos) === 2 ? plates.preset2 : plates.preset1;
      painted = drawCover(ctx, presetImg, width, height);
    }

    if (!painted) {
      painted = paintCustom(ctx, plates, state, width, height);
    }

    if (!painted) {
      const fallback = plates.fovMin || plates.fovMax || plates.preset1 || plates.preset2;
      drawCover(ctx, fallback, width, height);
    }
  }

  function setWeapon(id) {
    if (!WEAPONS[id]) return;
    weaponId = id;
  }

  function getWeapon() {
    return weaponId;
  }

  function getWeapons() {
    return Object.values(WEAPONS).map(({ id, label }) => ({ id, label }));
  }

  function preload(onReady) {
    const weapon = WEAPONS[weaponId] || WEAPONS.ak;
    resolvePlates(weapon).then(() => onReady?.());
  }

  return {
    render,
    preload,
    setWeapon,
    getWeapon,
    getWeapons,
    getPresetLabel,
    PREVIEW_SIZE,
    ASPECT,
  };
})();
