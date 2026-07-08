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
   * @param {object} [options]
   * @param {boolean} [options.minimal=false] - only non-default cvars
   * @returns {string}
   */
  function toCommandString(state, options = {}) {
    const keys = options.minimal
      ? CROSSHAIR_CVAR_ORDER.filter((key) => !isSettingAtDefault(key, state))
      : CROSSHAIR_CVAR_ORDER;

    return keys
      .map((key) => `${key} ${formatValue(key, state[key])}`)
      .join('; ');
  }

  /**
   * Build multi-line version for readability in textarea.
   * @param {object} state
   * @param {object} [options]
   * @param {boolean} [options.minimal=false]
   * @returns {string}
   */
  function toMultilineString(state, options = {}) {
    const keys = options.minimal
      ? CROSSHAIR_CVAR_ORDER.filter((key) => !isSettingAtDefault(key, state))
      : CROSSHAIR_CVAR_ORDER;

    return keys
      .map((key) => `${key} ${formatValue(key, state[key])}`)
      .join('\n');
  }

  /**
   * Parse a console command string into crosshair state.
   * @param {string} text
   * @returns {{ state: object, parsed: number, skipped: number }}
   */
  function fromCommandString(text) {
    const state = createDefaultCrosshairState();
    const known = new Set(CROSSHAIR_CVAR_ORDER);
    let parsed = 0;
    let skipped = 0;

    for (const line of String(text).split(/[;\n]+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const match = trimmed.match(/^(cl_\S+)\s+(.+)$/);
      if (!match) {
        skipped += 1;
        continue;
      }

      const key = match[1];
      if (!known.has(key)) {
        skipped += 1;
        continue;
      }

      state[key] = parseCommandValue(key, match[2]);
      parsed += 1;
    }

    return { state, parsed, skipped };
  }

  function parseCommandValue(key, raw) {
    const meta = CROSSHAIR_SETTINGS[key];
    const trimmed = String(raw).trim();

    if (meta.type === 'toggle') {
      if (meta.consoleFormat === 'bool') {
        if (trimmed === 'true') return 1;
        if (trimmed === 'false') return 0;
      }
    }

    return clampSettingValue(key, trimmed);
  }

  /**
   * Parse state from URL-safe compact encoding (delta or full).
   * @param {string} encoded
   * @returns {{ crosshair: object, previewBackground?: string, previewMode?: string }|null}
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

      const result = { crosshair: state };

      if (typeof parsed._bg === 'string' && Backgrounds.isValidId(parsed._bg)) {
        result.previewBackground = parsed._bg;
      }

      if (typeof parsed._mode === 'string' && PreviewMode.isValidMode(parsed._mode)) {
        result.previewMode = parsed._mode;
      }

      return result;
    } catch {
      return null;
    }
  }

  /**
   * Encode state for URL sharing (delta encoding for shorter links).
   * @param {object} state
   * @param {object} [options]
   * @param {boolean} [options.includePreview=false]
   * @param {string} [options.previewBackground]
   * @param {string} [options.previewMode]
   * @returns {string}
   */
  function toUrlParam(state, options = {}) {
    const compact = {};
    for (const key of CROSSHAIR_CVAR_ORDER) {
      if (!isSettingAtDefault(key, state)) {
        compact[key] = state[key];
      }
    }

    if (options.includePreview) {
      if (options.previewBackground && options.previewBackground !== Backgrounds.DEFAULT_ID) {
        compact._bg = options.previewBackground;
      }
      if (options.previewMode && options.previewMode !== PreviewMode.DEFAULT_MODE) {
        compact._mode = options.previewMode;
      }
    }

    return btoa(encodeURIComponent(JSON.stringify(compact)));
  }

  return {
    toCommandString,
    toMultilineString,
    fromCommandString,
    fromUrlParam,
    toUrlParam,
  };
})();
