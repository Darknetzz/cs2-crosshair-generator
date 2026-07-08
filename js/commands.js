/**
 * Serialize crosshair state to CS2 console commands.
 */
const CrosshairCommands = (() => {
  function formatValue(key, value) {
    const meta = CROSSHAIR_SETTINGS[key];
    if (meta.type === 'toggle') {
      if (meta.consoleFormat === 'bool') return value ? 'true' : 'false';
      return value ? 1 : 0;
    }
    if (Number.isInteger(value)) return value;
    return String(value);
  }

  /**
   * Build semicolon-separated console command string.
   * @param {object} state
   * @returns {string}
   */
  function toCommandString(state) {
    return CROSSHAIR_CVAR_ORDER
      .map((key) => `${key} ${formatValue(key, state[key])}`)
      .join('; ');
  }

  /**
   * Build multi-line version for readability in textarea.
   * @param {object} state
   * @returns {string}
   */
  function toMultilineString(state) {
    return CROSSHAIR_CVAR_ORDER
      .map((key) => `${key} ${formatValue(key, state[key])}`)
      .join('\n');
  }

  /**
   * Parse state from URL-safe compact encoding.
   * @param {string} encoded
   * @returns {object|null}
   */
  function fromUrlParam(encoded) {
    try {
      const parsed = JSON.parse(decodeURIComponent(atob(encoded)));
      if (typeof parsed !== 'object' || parsed === null) return null;

      const state = createDefaultCrosshairState();
      for (const key of CROSSHAIR_CVAR_ORDER) {
        if (key in parsed) {
          state[key] = clampSettingValue(key, parsed[key]);
        }
      }
      return state;
    } catch {
      return null;
    }
  }

  /**
   * Encode state for URL sharing.
   * @param {object} state
   * @returns {string}
   */
  function toUrlParam(state) {
    const compact = {};
    for (const key of CROSSHAIR_CVAR_ORDER) {
      compact[key] = state[key];
    }
    return btoa(encodeURIComponent(JSON.stringify(compact)));
  }

  return { toCommandString, toMultilineString, fromUrlParam, toUrlParam };
})();
