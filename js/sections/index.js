/**
 * Registry of all config sections.
 */
const ConfigSections = (() => {
  const ALL = [
    CrosshairSection,
    ViewmodelSection,
    HudSection,
    RadarSection,
    FpsSection,
    BindSection,
  ];

  const BY_ID = Object.fromEntries(ALL.map((section) => [section.id, section]));
  const DEFAULT_ID = 'crosshair';

  function get(id) {
    return BY_ID[id] || null;
  }

  function createDefaultSectionsState() {
    const state = {};
    for (const section of ALL) {
      state[section.id] = section.createDefaultState();
    }
    return state;
  }

  function findSectionForCvar(key) {
    for (const section of ALL) {
      if (section.kind === 'binds') continue;
      if (key in section.SETTINGS) return section;
    }
    return null;
  }

  function isValidId(id) {
    return Boolean(BY_ID[id]);
  }

  function getActiveOrDefault(id) {
    return get(id) || get(DEFAULT_ID);
  }

  return {
    ALL,
    BY_ID,
    DEFAULT_ID,
    get,
    createDefaultSectionsState,
    findSectionForCvar,
    isValidId,
    getActiveOrDefault,
  };
})();
