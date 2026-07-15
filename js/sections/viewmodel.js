/**
 * CS2 viewmodel / weapon position cvars.
 * Ranges match current live client clamps (validated Jul 2026).
 */
const ViewmodelSection = createSettingsModule({
  id: 'viewmodel',
  label: 'Viewmodel',
  fileName: 'viewmodel',
  groups: [
    {
      id: 'position',
      label: 'Weapon Position',
      settings: [
        'viewmodel_fov',
        'viewmodel_offset_x',
        'viewmodel_offset_y',
        'viewmodel_offset_z',
        'viewmodel_presetpos',
      ],
    },
  ],
  settings: {
    viewmodel_fov: {
      label: 'Viewmodel FOV',
      description: 'Field of view for the weapon model only (not camera FOV). CS2 clamps this to 60–68.',
      type: 'range',
      default: 60,
      min: 60,
      max: 68,
      step: 1,
    },
    viewmodel_offset_x: {
      label: 'Offset X',
      description: 'Moves the weapon left (negative) or right (positive). Range −2 to 2.5.',
      type: 'range',
      default: 1,
      min: -2,
      max: 2.5,
      step: 0.1,
    },
    viewmodel_offset_y: {
      label: 'Offset Y',
      description: 'Moves the weapon closer (negative) or farther (positive).',
      type: 'range',
      default: 1,
      min: -2,
      max: 2,
      step: 0.1,
    },
    viewmodel_offset_z: {
      label: 'Offset Z',
      description: 'Moves the weapon down (negative) or up (positive).',
      type: 'range',
      default: -1,
      min: -2,
      max: 2,
      step: 0.1,
    },
    viewmodel_presetpos: {
      label: 'Preset position',
      description: 'Built-in viewmodel presets (Desktop / Classic). FOV and offsets are separate cvars.',
      type: 'select',
      default: 1,
      options: [
        { value: 1, label: '1 — Desktop' },
        { value: 2, label: '2 — Classic' },
      ],
    },
  },
});

// Legacy Couch (2) / Classic (3) → current Classic (2); clamp handles unknown selects as default.
(() => {
  const originalMerge = ViewmodelSection.mergeState;
  ViewmodelSection.mergeState = function mergeViewmodelState(target, source) {
    if (source && typeof source === 'object' && 'viewmodel_presetpos' in source) {
      const preset = Number(source.viewmodel_presetpos);
      if (preset === 3) {
        source = { ...source, viewmodel_presetpos: 2 };
      }
    }
    return originalMerge(target, source);
  };
})();
