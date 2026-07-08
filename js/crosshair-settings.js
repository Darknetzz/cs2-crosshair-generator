/**
 * CS2 crosshair cvar definitions — single source of truth for defaults, ranges, and UI metadata.
 */
const CROSSHAIR_PRESET_COLORS = {
  0: [255, 0, 0],
  1: [0, 255, 0],
  2: [255, 255, 0],
  3: [0, 0, 255],
  4: [0, 255, 255],
};

const CHANNEL_SWATCH_COLORS = {
  cl_crosshaircolor_r: '#ff4444',
  cl_crosshaircolor_g: '#44dd44',
  cl_crosshaircolor_b: '#4488ff',
};

function presetColorToCss(value) {
  const rgb = CROSSHAIR_PRESET_COLORS[value];
  return rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : null;
}

function getCrosshairSwatchColor(state) {
  if (state.cl_crosshaircolor === 5) {
    return `rgb(${state.cl_crosshaircolor_r}, ${state.cl_crosshaircolor_g}, ${state.cl_crosshaircolor_b})`;
  }
  return presetColorToCss(state.cl_crosshaircolor) ?? presetColorToCss(1);
}

const CROSSHAIR_GROUPS = [
  {
    id: 'shape',
    label: 'Shape & Style',
    settings: [
      'cl_crosshairstyle',
      'cl_crosshairsize',
      'cl_crosshairgap',
      'cl_crosshairthickness',
      'cl_crosshairdot',
      'cl_crosshair_t',
    ],
  },
  {
    id: 'color',
    label: 'Color & Opacity',
    settings: [
      'cl_crosshaircolor',
      'cl_crosshaircolor_r',
      'cl_crosshaircolor_g',
      'cl_crosshaircolor_b',
      'cl_crosshairusealpha',
      'cl_crosshairalpha',
    ],
  },
  {
    id: 'outline',
    label: 'Outline',
    headerToggle: 'cl_crosshair_drawoutline',
    settings: [
      'cl_crosshair_drawoutline',
      'cl_crosshair_outlinethickness',
    ],
  },
  {
    id: 'dynamic',
    label: 'Dynamic / Gameplay',
    settings: [
      'cl_crosshair_recoil',
      'cl_crosshairgap_useweaponvalue',
      'cl_fixedcrosshairgap',
      'cl_crosshair_dynamic_splitdist',
      'cl_crosshair_dynamic_splitalpha_innermod',
      'cl_crosshair_dynamic_splitalpha_outermod',
      'cl_crosshair_dynamic_maxdist_splitratio',
    ],
  },
  {
    id: 'sniper',
    label: 'Sniper & Misc',
    settings: [
      'cl_crosshair_sniper_width',
      'cl_sniper_show_inaccuracy',
      'cl_crosshair_friendly_warning',
    ],
  },
];

const CROSSHAIR_SETTINGS = {
  cl_crosshairstyle: {
    label: 'Style',
    description: 'Crosshair behavior. Styles 4 and 5 are static and popular for competitive play.',
    type: 'select',
    default: 0,
    options: [
      { value: 0, label: '0 — Default (dynamic)' },
      { value: 1, label: '1 — Static default' },
      { value: 2, label: '2 — Classic dynamic' },
      { value: 3, label: '3 — Classic dynamic (alt)' },
      { value: 4, label: '4 — Classic static' },
      { value: 5, label: '5 — Classic static (legacy)' },
    ],
  },
  cl_crosshairsize: {
    label: 'Size',
    description: 'Length of the crosshair lines.',
    type: 'range',
    default: 2.5,
    min: -20,
    max: 20,
    step: 0.5,
  },
  cl_crosshairgap: {
    label: 'Gap',
    description: 'Distance between center and the start of each line. Negative values tighten the crosshair.',
    type: 'range',
    default: 0,
    min: -10,
    max: 10,
    step: 0.5,
  },
  cl_crosshairthickness: {
    label: 'Thickness',
    description: 'Width of the crosshair lines.',
    type: 'range',
    default: 1,
    min: -2,
    max: 2,
    step: 0.5,
  },
  cl_crosshairdot: {
    label: 'Center dot',
    description: 'Show a dot in the center of the crosshair.',
    type: 'toggle',
    default: 0,
  },
  cl_crosshair_t: {
    label: 'T-shape',
    description: 'Remove the top line for a T-shaped crosshair.',
    type: 'toggle',
    default: 0,
  },
  cl_crosshaircolor: {
    label: 'Color preset',
    description: 'Preset color. Choose Custom (5) to use RGB sliders.',
    type: 'select',
    default: 1,
    options: [
      { value: 0, label: 'Red' },
      { value: 1, label: 'Green' },
      { value: 2, label: 'Yellow' },
      { value: 3, label: 'Blue' },
      { value: 4, label: 'Cyan' },
      { value: 5, label: 'Custom RGB' },
    ],
  },
  cl_crosshaircolor_r: {
    label: 'Red',
    description: 'Custom red channel (0–255). Active when color preset is Custom.',
    type: 'range',
    default: 50,
    min: 0,
    max: 255,
    step: 1,
    enabledWhen: { key: 'cl_crosshaircolor', value: 5 },
  },
  cl_crosshaircolor_g: {
    label: 'Green',
    description: 'Custom green channel (0–255). Active when color preset is Custom.',
    type: 'range',
    default: 250,
    min: 0,
    max: 255,
    step: 1,
    enabledWhen: { key: 'cl_crosshaircolor', value: 5 },
  },
  cl_crosshaircolor_b: {
    label: 'Blue',
    description: 'Custom blue channel (0–255). Active when color preset is Custom.',
    type: 'range',
    default: 50,
    min: 0,
    max: 255,
    step: 1,
    enabledWhen: { key: 'cl_crosshaircolor', value: 5 },
  },
  cl_crosshairusealpha: {
    label: 'Use alpha',
    description: 'Enable transparency for the crosshair.',
    type: 'toggle',
    default: 1,
  },
  cl_crosshairalpha: {
    label: 'Alpha',
    description: 'Crosshair opacity (0 = transparent, 255 = opaque).',
    type: 'range',
    default: 200,
    min: 0,
    max: 255,
    step: 1,
    enabledWhen: { key: 'cl_crosshairusealpha', value: 1 },
  },
  cl_crosshair_drawoutline: {
    label: 'Outline',
    description: 'Draw a dark outline around crosshair lines for better visibility.',
    type: 'toggle',
    default: 0,
  },
  cl_crosshair_outlinethickness: {
    label: 'Outline thickness',
    description: 'Width of the crosshair outline.',
    type: 'range',
    default: 1,
    min: 0.1,
    max: 3,
    step: 0.1,
    enabledWhen: { key: 'cl_crosshair_drawoutline', value: 1 },
  },
  cl_crosshair_recoil: {
    label: 'Follow recoil',
    description: 'Crosshair follows weapon recoil pattern while shooting.',
    type: 'toggle',
    default: 1,
  },
  cl_crosshairgap_useweaponvalue: {
    label: 'Weapon gap value',
    description: 'Use per-weapon gap values instead of a fixed gap.',
    type: 'toggle',
    default: 0,
  },
  cl_fixedcrosshairgap: {
    label: 'Fixed gap',
    description: 'Alternative fixed gap for classic crosshair styles.',
    type: 'range',
    default: 3,
    min: -10,
    max: 10,
    step: 0.5,
    enabledWhen: { key: 'cl_crosshairgap_useweaponvalue', value: 0 },
  },
  cl_crosshair_dynamic_splitdist: {
    label: 'Dynamic split distance',
    description: 'Distance at which the dynamic crosshair begins to split.',
    type: 'range',
    default: 7,
    min: 0,
    max: 20,
    step: 0.5,
    enabledWhen: { key: 'cl_crosshairgap_useweaponvalue', value: 1 },
  },
  cl_crosshair_dynamic_splitalpha_innermod: {
    label: 'Split alpha (inner)',
    description: 'Inner modifier for dynamic crosshair split alpha.',
    type: 'range',
    default: 1,
    min: 0,
    max: 1,
    step: 0.05,
    enabledWhen: { key: 'cl_crosshairgap_useweaponvalue', value: 1 },
  },
  cl_crosshair_dynamic_splitalpha_outermod: {
    label: 'Split alpha (outer)',
    description: 'Outer modifier for dynamic crosshair split alpha.',
    type: 'range',
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
    enabledWhen: { key: 'cl_crosshairgap_useweaponvalue', value: 1 },
  },
  cl_crosshair_dynamic_maxdist_splitratio: {
    label: 'Max split ratio',
    description: 'Maximum distance split ratio for dynamic crosshair.',
    type: 'range',
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
    enabledWhen: { key: 'cl_crosshairgap_useweaponvalue', value: 1 },
  },
  cl_crosshair_sniper_width: {
    label: 'Sniper width',
    description: 'Width of sniper scope crosshair lines.',
    type: 'range',
    default: 1,
    min: 1,
    max: 5,
    step: 1,
  },
  cl_sniper_show_inaccuracy: {
    label: 'Scoped inaccuracy',
    description: 'Show the dynamic inaccuracy indicator inside the sniper scope (added Oct 2025).',
    type: 'toggle',
    default: 0,
  },
  cl_crosshair_friendly_warning: {
    label: 'Friendly warning',
    description: 'Crosshair warning when aiming at a teammate.',
    type: 'select',
    default: 2,
    options: [
      { value: 0, label: 'Off' },
      { value: 1, label: 'On (crosshair only)' },
      { value: 2, label: 'On (crosshair + name)' },
    ],
  },
};

/** Ordered list of all cvar keys for command generation. */
const CROSSHAIR_CVAR_ORDER = CROSSHAIR_GROUPS.flatMap((g) => g.settings);

/** Build a fresh state object from defaults. */
function createDefaultCrosshairState() {
  const state = {};
  for (const key of CROSSHAIR_CVAR_ORDER) {
    state[key] = CROSSHAIR_SETTINGS[key].default;
  }
  return state;
}

/** Clamp and round a numeric value to the setting's step. */
function clampSettingValue(key, raw) {
  const meta = CROSSHAIR_SETTINGS[key];
  let val = Number(raw);
  if (Number.isNaN(val)) return meta.default;

  if (meta.type === 'toggle') {
    return val ? 1 : 0;
  }

  if (meta.type === 'select') {
    const allowed = meta.options.map((o) => o.value);
    return allowed.includes(val) ? val : meta.default;
  }

  val = Math.max(meta.min, Math.min(meta.max, val));
  if (meta.step) {
    const steps = Math.round(val / meta.step);
    val = steps * meta.step;
    val = Math.round(val * 1000) / 1000;
  }
  return val;
}

/** Build state from default values plus preset overrides. */
function applyPresetState(overrides) {
  const state = createDefaultCrosshairState();
  for (const [key, value] of Object.entries(overrides)) {
    if (key in CROSSHAIR_SETTINGS) {
      state[key] = clampSettingValue(key, value);
    }
  }
  return state;
}

/** Whether a setting row should be enabled given current state. */
function isSettingEnabled(key, state) {
  const meta = CROSSHAIR_SETTINGS[key];
  if (!meta.enabledWhen) return true;
  return state[meta.enabledWhen.key] === meta.enabledWhen.value;
}

/** Whether a setting matches its default value. */
function isSettingAtDefault(key, state) {
  const defaultVal = clampSettingValue(key, CROSSHAIR_SETTINGS[key].default);
  const currentVal = clampSettingValue(key, state[key]);
  return currentVal === defaultVal;
}
