/**
 * Preview mode (normal crosshair vs grenade lineup vs sniper scope).
 * Display only — does not affect exported commands.
 */
const PreviewMode = (() => {
  const MODES = {
    NORMAL: 'normal',
    LINEUP: 'lineup',
    SNIPER: 'sniper',
  };

  const DEFAULT_MODE = MODES.NORMAL;

  const GRENADE_ENABLE_KEYS = [
    'cl_grenadecrosshair_smoke',
    'cl_grenadecrosshair_flash',
    'cl_grenadecrosshair_explosive',
    'cl_grenadecrosshair_fire',
    'cl_grenadecrosshair_decoy',
  ];

  function isValidMode(mode) {
    return mode === MODES.NORMAL || mode === MODES.LINEUP || mode === MODES.SNIPER;
  }

  function isLineupEnabled(state) {
    return GRENADE_ENABLE_KEYS.some((key) => state[key] === 1);
  }

  return {
    MODES,
    DEFAULT_MODE,
    isValidMode,
    isLineupEnabled,
  };
})();
