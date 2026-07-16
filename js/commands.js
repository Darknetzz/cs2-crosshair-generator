/**
 * Serialize multi-section config state to CS2 console / .cfg commands.
 */
const ConfigCommands = (() => {
  function formatValue(section, key, value) {
    const meta = section.SETTINGS[key];
    if (meta.type === 'toggle') {
      if (meta.consoleFormat === 'bool') return value ? 'true' : 'false';
      return value ? 1 : 0;
    }
    if (Number.isInteger(value)) return value;
    return String(value);
  }

  function parseCommandValue(section, key, raw) {
    const meta = section.SETTINGS[key];
    const trimmed = String(raw).trim();

    if (meta.type === 'toggle' && meta.consoleFormat === 'bool') {
      if (trimmed === 'true') return 1;
      if (trimmed === 'false') return 0;
    }

    return section.clamp(key, trimmed);
  }

  function keysForSection(section, state, minimal) {
    if (typeof section.toCommandLines === 'function') return [];
    return minimal
      ? section.CVAR_ORDER.filter((key) => !section.isAtDefault(key, state))
      : section.CVAR_ORDER;
  }

  function toSectionLines(section, state, options = {}) {
    if (typeof section.toCommandLines === 'function') {
      return section.toCommandLines(state, options);
    }
    const keys = keysForSection(section, state, Boolean(options.minimal));
    return keys.map((key) => `${key} ${formatValue(section, key, state[key])}`);
  }

  /**
   * Build semicolon-separated console command string.
   * @param {object} sectionsState
   * @param {object} [options]
   * @param {boolean} [options.minimal=false]
   * @param {string|null} [options.sectionId=null] - one section, or all when null
   */
  function toCommandString(sectionsState, options = {}) {
    const sections = options.sectionId
      ? [ConfigSections.get(options.sectionId)].filter(Boolean)
      : ConfigSections.ALL;

    return sections
      .flatMap((section) => toSectionLines(section, sectionsState[section.id] || {}, {
        ...options,
        // Semicolon paste must stay executable — skip // labels / blank lines.
        annotate: false,
      }))
      .join('; ');
  }

  /**
   * Build multi-line commands for the textarea.
   * @param {object} sectionsState
   * @param {object} [options]
   * @param {boolean} [options.minimal=false]
   * @param {boolean} [options.comments=true]
   * @param {string|null} [options.sectionId=null]
   */
  function toMultilineString(sectionsState, options = {}) {
    const withComments = options.comments !== false;
    const sections = options.sectionId
      ? [ConfigSections.get(options.sectionId)].filter(Boolean)
      : ConfigSections.ALL;

    const blocks = [];
    for (const section of sections) {
      const lines = toSectionLines(section, sectionsState[section.id] || {}, options);
      if (!lines.length) continue;

      if (withComments && !options.sectionId) {
        blocks.push(`// --- ${section.label} ---`, ...lines);
      } else {
        blocks.push(...lines);
      }
    }

    return blocks.join('\n');
  }

  /**
   * Parse console / cfg text into a partial multi-section patch (unknown lines skipped).
   * Only includes cvars / known binds that were present in the input so callers can merge without resetting others.
   * @param {string} text
   * @returns {{ sections: object, parsed: number, skipped: number }}
   */
  function fromCommandString(text) {
    const sections = {};
    let parsed = 0;
    let skipped = 0;

    function ensureSection(id) {
      if (!sections[id]) sections[id] = {};
      return sections[id];
    }

    function splitCommands(raw) {
      const parts = [];
      let current = '';
      let quote = null;

      for (let i = 0; i < raw.length; i += 1) {
        const ch = raw[i];
        if (quote) {
          current += ch;
          if (ch === quote) quote = null;
          continue;
        }
        if (ch === '"' || ch === "'") {
          quote = ch;
          current += ch;
          continue;
        }
        if (ch === ';' || ch === '\n') {
          const trimmed = current.trim();
          if (trimmed) parts.push(trimmed);
          current = '';
          continue;
        }
        current += ch;
      }

      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      return parts;
    }

    function parseBindLine(trimmed) {
      const match = trimmed.match(/^bind\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s+(?:"([^"]*)"|'([^']*)'|(.+))$/i);
      if (!match) return false;

      const key = BindSection.normalizeKey(match[1] || match[2] || match[3]);
      const command = String(match[4] ?? match[5] ?? match[6] ?? '').trim();
      if (!key || !command) return false;

      const entry = BindSection.findEntryForBindCommand(command);
      if (!entry) {
        if (/^slot\d+\s*;\s*switchhands$/i.test(command)) {
          const binds = ensureSection('binds');
          binds.switchHands = { enabled: true, key: '' };
          parsed += 1;
          return true;
        }
        return false;
      }

      const binds = ensureSection('binds');
      binds[entry.id] = { enabled: true, key };
      parsed += 1;
      return true;
    }

    function parseAliasLine(trimmed) {
      const match = trimmed.match(/^alias\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s+/i);
      if (!match) return false;

      const aliasName = match[1] || match[2] || match[3];
      const entry = BindSection.findEntryForAliasName(aliasName);
      if (!entry) return false;

      const binds = ensureSection('binds');
      if (!binds[entry.id]) {
        binds[entry.id] = {
          enabled: true,
          key: entry.defaultKey || '',
        };
      } else {
        binds[entry.id] = {
          ...binds[entry.id],
          enabled: true,
        };
      }
      parsed += 1;
      return true;
    }

    for (const segment of splitCommands(String(text))) {
      if (segment.startsWith('//') || segment.startsWith('#')) continue;

      if (/^bind\s+/i.test(segment)) {
        if (!parseBindLine(segment)) skipped += 1;
        continue;
      }

      if (/^alias\s+/i.test(segment)) {
        if (!parseAliasLine(segment)) skipped += 1;
        continue;
      }

      const match = segment.match(/^([A-Za-z_][\w]*)\s+(.+)$/);
      if (!match) {
        skipped += 1;
        continue;
      }

      const key = match[1];
      const section = ConfigSections.findSectionForCvar(key);
      if (!section) {
        skipped += 1;
        continue;
      }

      ensureSection(section.id)[key] = parseCommandValue(section, key, match[2]);
      parsed += 1;
    }

    return { sections, parsed, skipped };
  }

  function toSectionCfg(section, state, options = {}) {
    const header = [
      '// Generated by CS2 Config Generator',
      `// Section: ${section.label}`,
      '',
    ];
    const lines = toSectionLines(section, state, options);
    return `${[...header, ...lines].join('\n')}\n`;
  }

  /**
   * Combined cfg: either inlined commands or an autoexec that execs modular files.
   * @param {object} sectionsState
   * @param {object} [options]
   * @param {'inline'|'exec'} [options.mode='inline']
   * @param {boolean} [options.minimal=false]
   */
  function toCombinedCfg(sectionsState, options = {}) {
    const mode = options.mode === 'exec' ? 'exec' : 'inline';
    const header = ['// Generated by CS2 Config Generator', ''];

    if (mode === 'exec') {
      const execLines = ConfigSections.ALL.map((section) => `exec ${section.fileName}`);
      return `${[...header, ...execLines].join('\n')}\n`;
    }

    const body = [];
    for (const section of ConfigSections.ALL) {
      const lines = toSectionLines(section, sectionsState[section.id] || {}, options);
      if (!lines.length) continue;
      body.push(`// --- ${section.label} ---`, ...lines, '');
    }

    return `${[...header, ...body].join('\n').trimEnd()}\n`;
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadSectionCfg(section, state, options = {}) {
    downloadTextFile(`${section.fileName}.cfg`, toSectionCfg(section, state, options));
  }

  function downloadCombinedCfg(sectionsState, options = {}) {
    const filename = options.mode === 'exec' ? 'autoexec.cfg' : 'cs2-config.cfg';
    downloadTextFile(filename, toCombinedCfg(sectionsState, options));
  }

  /**
   * Download each section cfg, then optional exec autoexec. Staggers downloads for browsers.
   */
  function downloadAllModular(sectionsState, options = {}) {
    ConfigSections.ALL.forEach((section, index) => {
      setTimeout(() => {
        downloadSectionCfg(section, sectionsState[section.id] || {}, options);
      }, index * 150);
    });

    setTimeout(() => {
      downloadCombinedCfg(sectionsState, { ...options, mode: 'exec' });
    }, ConfigSections.ALL.length * 150);
  }

  function collectDelta(sectionsState) {
    const compact = {};
    for (const section of ConfigSections.ALL) {
      const state = sectionsState[section.id] || {};

      if (section.kind === 'binds' && typeof section.collectDelta === 'function') {
        const bindsDelta = section.collectDelta(state);
        if (Object.keys(bindsDelta).length) {
          compact._binds = bindsDelta;
        }
        continue;
      }

      for (const key of section.CVAR_ORDER) {
        if (!section.isAtDefault(key, state)) {
          compact[key] = state[key];
        }
      }
    }
    return compact;
  }

  /**
   * Parse state from URL-safe compact encoding (delta or full).
   * Supports legacy flat crosshair deltas and nested `{ sections: { ... } }`.
   * @param {string} encoded
   * @returns {{ sections: object, previewBackground?: string, previewMode?: string }|null}
   */
  function fromUrlParam(encoded) {
    try {
      const parsed = JSON.parse(decodeURIComponent(atob(encoded)));
      if (typeof parsed !== 'object' || parsed === null) return null;

      const sections = ConfigSections.createDefaultSectionsState();

      if (parsed.sections && typeof parsed.sections === 'object') {
        for (const section of ConfigSections.ALL) {
          section.mergeState(sections[section.id], parsed.sections[section.id]);
        }
      } else {
        for (const [key, value] of Object.entries(parsed)) {
          if (key.startsWith('_')) continue;
          const section = ConfigSections.findSectionForCvar(key);
          if (!section) continue;
          sections[section.id][key] = section.clamp(key, value);
        }

        if (parsed._binds && typeof parsed._binds === 'object') {
          BindSection.mergeState(sections.binds, parsed._binds);
        }
      }

      const result = { sections };

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
   * Encode multi-section state for URL sharing (flat delta for shorter + legacy-compatible links).
   * @param {object} sectionsState
   * @param {object} [options]
   * @param {boolean} [options.includePreview=false]
   * @param {string} [options.previewBackground]
   * @param {string} [options.previewMode]
   */
  function toUrlParam(sectionsState, options = {}) {
    const compact = collectDelta(sectionsState);

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

  // Backward-compatible façade for crosshair-only callers (presets tooling / older code).
  const CrosshairCommands = {
    toCommandString(state, options = {}) {
      return toCommandString({ crosshair: state }, { ...options, sectionId: 'crosshair' });
    },
    toMultilineString(state, options = {}) {
      return toMultilineString({ crosshair: state }, { ...options, sectionId: 'crosshair', comments: false });
    },
    fromCommandString(text) {
      const result = fromCommandString(text);
      const state = CrosshairSection.createDefaultState();
      CrosshairSection.mergeState(state, result.sections.crosshair || {});
      return {
        state,
        parsed: result.parsed,
        skipped: result.skipped,
      };
    },
    fromUrlParam(encoded) {
      const parsed = fromUrlParam(encoded);
      if (!parsed) return null;
      return {
        crosshair: parsed.sections.crosshair,
        previewBackground: parsed.previewBackground,
        previewMode: parsed.previewMode,
      };
    },
    toUrlParam(state, options = {}) {
      return toUrlParam({ crosshair: state }, options);
    },
  };

  return {
    toCommandString,
    toMultilineString,
    fromCommandString,
    toSectionCfg,
    toCombinedCfg,
    downloadTextFile,
    downloadSectionCfg,
    downloadCombinedCfg,
    downloadAllModular,
    fromUrlParam,
    toUrlParam,
    CrosshairCommands,
  };
})();

/** @deprecated Prefer ConfigCommands; kept for clarity with older script expectations. */
const CrosshairCommands = ConfigCommands.CrosshairCommands;
