/**
 * Useful CS2 binds catalog — aliases + key binds (not numeric cvars).
 */
const BindSection = (() => {
  const GROUPS = [
    { id: 'utility', label: 'Utility' },
    { id: 'fun', label: 'Fun' },
    { id: 'practice', label: 'Practice' },
  ];

  /** Shared alias recipes referenced by catalog entries. */
  const ALIAS_DEFS = {
    bomb: [
      'alias "+bomb" "slot3; slot5;"',
      'alias "-bomb" "drop; slot2; slot1;"',
    ],
    fakeflash: [
      'alias "+fakeflash" "use weapon_knife; slot2;"',
      'alias "-fakeflash" "drop; slot1;"',
    ],
    muteTeam: [
      'alias "mute-team" "clutchon"',
      'alias "clutchon" "voice_enable 0; alias mute-team clutchoff"',
      'alias "clutchoff" "voice_enable 1; alias mute-team clutchon"',
    ],
    spinbot: [
      'alias "+spinbot" "+right; m_yaw 99999"',
      'alias "-spinbot" "-right; m_yaw 0.022"',
    ],
    rethrow: [
      'alias "rethrow" "sv_rethrow_last_grenade"',
    ],
  };

  const SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const SLOT_COMMANDS = [
    'slot1; switchhands',
    'slot2; switchhands',
    'slot3; switchhands',
    'slot4; switchhands',
    'slot5; switchhands',
    'slot6; switchhands',
    'slot7; switchhands',
    'slot8; switchhands',
    'slot9; switchhands',
    'slot10; switchhands',
  ];

  const ENTRIES = [
    {
      id: 'dropBomb',
      group: 'utility',
      label: 'Drop bomb',
      description: 'Hold to pull bomb, release to drop it and switch back.',
      defaultKey: 'v',
      bindCommand: '+bomb',
      aliases: ['bomb'],
    },
    {
      id: 'fakeFlash',
      group: 'utility',
      label: 'Fake flash',
      description: 'Hold to pull flash, release to drop it (fake flash trick).',
      defaultKey: 'mouse5',
      bindCommand: '+fakeflash',
      aliases: ['fakeflash'],
    },
    {
      id: 'voiceToggle',
      group: 'utility',
      label: 'Voice toggle',
      description: 'Toggle voice chat on/off (voice_modenable_toggle).',
      defaultKey: 'o',
      bindCommand: 'voice_modenable_toggle',
    },
    {
      id: 'muteTeam',
      group: 'utility',
      label: 'Mute team (clutch)',
      description: 'Toggle teammate voice (voice_enable) for clutch moments.',
      defaultKey: 'p',
      bindCommand: 'mute-team',
      aliases: ['muteTeam'],
    },
    {
      id: 'scrollJump',
      group: 'utility',
      label: 'Scroll jump',
      description: 'Jump on mouse wheel down (scroll-jump / bhop assist).',
      defaultKey: 'mwheeldown',
      bindCommand: '+jump',
    },
    {
      id: 'switchHands',
      group: 'utility',
      label: 'Switch hands on slots',
      description: 'Rebind 1–0 so each weapon slot also runs switchhands.',
      defaultKey: '',
      kind: 'package',
      packageBinds: SLOT_KEYS.map((key, index) => ({
        key,
        command: SLOT_COMMANDS[index],
      })),
    },
    {
      id: 'spinbot',
      group: 'fun',
      label: 'Spinbot',
      description: 'Hold to spin wildly (m_yaw trick). Release to restore.',
      defaultKey: 'n',
      bindCommand: '+spinbot',
      aliases: ['spinbot'],
    },
    {
      id: 'shrug',
      group: 'fun',
      label: 'Shrug',
      description: 'Say ¯\\_(ツ)_/¯ in chat.',
      defaultKey: '.',
      bindCommand: 'say ¯\\_(ツ)_/¯',
    },
    {
      id: 'noclip',
      group: 'practice',
      label: 'Noclip',
      description: 'Toggle noclip. Requires sv_cheats on a local/practice server.',
      defaultKey: 'capslock',
      bindCommand: 'noclip',
      requiresCheats: true,
    },
    {
      id: 'rethrow',
      group: 'practice',
      label: 'Rethrow grenade',
      description: 'Rethrow the last grenade. Practice servers / sv_cheats.',
      defaultKey: 'c',
      bindCommand: 'rethrow',
      aliases: ['rethrow'],
      requiresCheats: true,
    },
    {
      id: 'clearProjectiles',
      group: 'practice',
      label: 'Clear projectiles',
      description: 'Kill smoke/molotov/flash/HE/decoy projectiles and stop sound. Needs cheats.',
      defaultKey: ',',
      bindCommand: 'ent_fire smokegrenade_projectile kill;ent_fire molotov_projectile kill;ent_fire flashbang_projectile kill;ent_fire hegrenade_projectile kill;ent_fire decoy_projectile kill;stopsound',
      requiresCheats: true,
    },
  ];

  const BY_ID = Object.fromEntries(ENTRIES.map((entry) => [entry.id, entry]));
  const CVAR_ORDER = ENTRIES.map((entry) => entry.id);

  /** Label map so section summary / helpers can look up by id like SETTINGS. */
  const SETTINGS = Object.fromEntries(
    ENTRIES.map((entry) => [entry.id, {
      label: entry.label,
      description: entry.description,
    }]),
  );

  function normalizeKey(raw) {
    return String(raw ?? '').trim().toLowerCase();
  }

  function isValidKey(key) {
    if (!key) return false;
    if (/\s/.test(key)) return false;
    return /^[\w.+,-]+$/i.test(key) || key === '.' || key === ',';
  }

  function createEntryDefault(entry) {
    return {
      enabled: false,
      key: entry.defaultKey || '',
    };
  }

  function createDefaultState() {
    const state = {};
    for (const entry of ENTRIES) {
      state[entry.id] = createEntryDefault(entry);
    }
    return state;
  }

  function clampEntry(entry, raw) {
    const defaults = createEntryDefault(entry);
    if (!raw || typeof raw !== 'object') return defaults;

    const enabled = Boolean(raw.enabled);
    let key = normalizeKey(raw.key);
    if (entry.kind === 'package') {
      key = '';
    } else if (raw.key === undefined || raw.key === null) {
      key = defaults.key;
    }

    return { enabled, key };
  }

  function clamp(id, raw) {
    const entry = BY_ID[id];
    if (!entry) return { enabled: false, key: '' };
    return clampEntry(entry, raw);
  }

  function isAtDefault(id, state) {
    const entry = BY_ID[id];
    if (!entry) return true;
    const current = clampEntry(entry, state?.[id]);
    const defaults = createEntryDefault(entry);
    return current.enabled === defaults.enabled
      && normalizeKey(current.key) === normalizeKey(defaults.key);
  }

  function isEnabled() {
    return true;
  }

  function countChanged(state) {
    return CVAR_ORDER.filter((id) => !isAtDefault(id, state)).length;
  }

  function mergeState(target, source) {
    if (!source || typeof source !== 'object') return target;
    for (const entry of ENTRIES) {
      if (entry.id in source) {
        target[entry.id] = clampEntry(entry, source[entry.id]);
      }
    }
    return target;
  }

  function formatBind(key, command) {
    return `bind "${key}" "${command}"`;
  }

  function entryBindLines(entry, entryState) {
    if (entry.kind === 'package' && Array.isArray(entry.packageBinds)) {
      return entry.packageBinds.map((item) => formatBind(item.key, item.command));
    }
    const key = normalizeKey(entryState?.key) || entry.defaultKey;
    if (!key || !entry.bindCommand) return [];
    return [formatBind(key, entry.bindCommand)];
  }

  function entryAliasLines(entry) {
    return (entry.aliases || []).flatMap((aliasId) => ALIAS_DEFS[aliasId] || []);
  }

  /** Preview / export body for one bind (aliases + bind lines). */
  function entryBodyLines(entry, entryState) {
    return [...entryAliasLines(entry), ...entryBindLines(entry, entryState)];
  }

  function entryPreviewLines(entry, entryState) {
    const body = entryBodyLines(entry, entryState);
    if (!body.length) return [];
    return [`// ${entry.label}`, ...body];
  }

  /**
   * Serialize enabled binds to cfg / console lines.
   * @param {object} state
   * @param {{ minimal?: boolean, annotate?: boolean }} [options]
   *   annotate (default true) — `// Label` before each bind and a blank line between blocks
   */
  function toCommandLines(state, options = {}) {
    const minimal = Boolean(options.minimal);
    const annotate = options.annotate !== false;
    const lines = [];
    const emittedAliases = new Set();

    for (const entry of ENTRIES) {
      const entryState = clampEntry(entry, state?.[entry.id]);
      if (!entryState.enabled) continue;
      if (minimal && isAtDefault(entry.id, state)) continue;

      if (entry.kind !== 'package') {
        const key = normalizeKey(entryState.key);
        if (!isValidKey(key)) continue;
      }

      const block = [];
      for (const aliasId of entry.aliases || []) {
        if (emittedAliases.has(aliasId)) continue;
        emittedAliases.add(aliasId);
        block.push(...(ALIAS_DEFS[aliasId] || []));
      }
      block.push(...entryBindLines(entry, entryState));
      if (!block.length) continue;

      if (annotate) {
        if (lines.length) lines.push('');
        lines.push(`// ${entry.label}`);
      }
      lines.push(...block);
    }

    return lines;
  }

  function collectDelta(state) {
    const delta = {};
    for (const entry of ENTRIES) {
      if (!isAtDefault(entry.id, state)) {
        delta[entry.id] = clampEntry(entry, state[entry.id]);
      }
    }
    return delta;
  }

  /**
   * Best-effort match of a bind command string to a catalog entry.
   */
  function findEntryForBindCommand(command) {
    const normalized = String(command).trim().replace(/^"|"$/g, '');
    for (const entry of ENTRIES) {
      if (entry.kind === 'package') continue;
      if (entry.bindCommand === normalized) return entry;
    }
    return null;
  }

  function findEntryForAliasName(name) {
    const cleaned = String(name).replace(/^["']|["']$/g, '');
    for (const entry of ENTRIES) {
      for (const aliasId of entry.aliases || []) {
        const defs = ALIAS_DEFS[aliasId] || [];
        for (const line of defs) {
          const match = line.match(/^alias\s+"([^"]+)"/);
          if (match && match[1] === cleaned) return entry;
        }
      }
    }
    return null;
  }

  return {
    id: 'binds',
    label: 'Binds',
    fileName: 'binds',
    kind: 'binds',
    GROUPS,
    ENTRIES,
    BY_ID,
    ALIAS_DEFS,
    SETTINGS,
    CVAR_ORDER,
    createDefaultState,
    clamp,
    isEnabled,
    isAtDefault,
    countChanged,
    mergeState,
    toCommandLines,
    collectDelta,
    normalizeKey,
    isValidKey,
    entryPreviewLines,
    findEntryForBindCommand,
    findEntryForAliasName,
  };
})();
