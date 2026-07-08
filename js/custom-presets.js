/**
 * User-saved crosshair presets (persisted in localStorage).
 */
const CustomPresets = (() => {
  const MAX_PRESETS = 20;
  const DEFAULT_LABEL_PREFIX = 'Preset ';
  const DEFAULT_LABEL_PATTERN = /^Preset (\d+)$/i;

  function createId() {
    return `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function sanitizeLabel(label) {
    const trimmed = String(label ?? '').trim();
    return trimmed.slice(0, 24) || 'Untitled';
  }

  function snapshotState(state) {
    const snap = {};
    for (const key of CROSSHAIR_CVAR_ORDER) {
      snap[key] = clampSettingValue(key, state[key]);
    }
    return snap;
  }

  function normalizePreset(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id || !raw.label || !raw.state) return null;

    const state = createDefaultCrosshairState();
    for (const key of CROSSHAIR_CVAR_ORDER) {
      if (key in raw.state) {
        state[key] = clampSettingValue(key, raw.state[key]);
      }
    }

    return {
      id: String(raw.id),
      label: sanitizeLabel(raw.label),
      state,
    };
  }

  function parseList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizePreset).filter(Boolean).slice(0, MAX_PRESETS);
  }

  function createPreset(label, state) {
    return {
      id: createId(),
      label: sanitizeLabel(label),
      state: snapshotState(state),
    };
  }

  function findByLabel(presets, label) {
    const normalized = sanitizeLabel(label).toLowerCase();
    return presets.find((preset) => preset.label.toLowerCase() === normalized) ?? null;
  }

  function upsertPreset(presets, label, state) {
    const existing = findByLabel(presets, label);
    if (existing) {
      return presets.map((preset) => (
        preset.id === existing.id
          ? { ...preset, label: sanitizeLabel(label), state: snapshotState(state) }
          : preset
      ));
    }

    if (presets.length >= MAX_PRESETS) return null;

    return [...presets, createPreset(label, state)];
  }

  function removePreset(presets, id) {
    return presets.filter((preset) => preset.id !== id);
  }

  function getNextDefaultLabel(presets) {
    let max = 0;
    for (const preset of presets) {
      const match = preset.label.match(DEFAULT_LABEL_PATTERN);
      if (match) max = Math.max(max, Number(match[1]));
    }
    return `${DEFAULT_LABEL_PREFIX}${max + 1}`;
  }

  return {
    MAX_PRESETS,
    parseList,
    createPreset,
    sanitizeLabel,
    upsertPreset,
    removePreset,
    findByLabel,
    getNextDefaultLabel,
  };
})();
