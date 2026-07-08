/**
 * Preview background definitions.
 * Map screenshots from https://github.com/ghostcap-gaming/cs2-map-images
 */
const Backgrounds = (() => {
  const GROUPS = [
    {
      id: 'solid',
      label: 'Solid',
      items: [
        { id: 'dark', label: 'Dark', type: 'procedural' },
        { id: 'light', label: 'Light', type: 'procedural' },
        { id: 'black', label: 'Black', type: 'procedural' },
        { id: 'white', label: 'White', type: 'procedural' },
        { id: 'checker', label: 'Checker', type: 'procedural' },
      ],
    },
    {
      id: 'maps',
      label: 'Maps',
      items: [
        { id: 'map-dust2', label: 'Dust II', type: 'image', src: 'assets/maps/dust2.webp' },
        { id: 'map-mirage', label: 'Mirage', type: 'image', src: 'assets/maps/mirage.webp' },
        { id: 'map-inferno', label: 'Inferno', type: 'image', src: 'assets/maps/inferno.webp' },
        { id: 'map-nuke', label: 'Nuke', type: 'image', src: 'assets/maps/nuke.webp' },
        { id: 'map-overpass', label: 'Overpass', type: 'image', src: 'assets/maps/overpass.webp' },
        { id: 'map-ancient', label: 'Ancient', type: 'image', src: 'assets/maps/ancient.webp' },
        { id: 'map-anubis', label: 'Anubis', type: 'image', src: 'assets/maps/anubis.webp' },
        { id: 'map-vertigo', label: 'Vertigo', type: 'image', src: 'assets/maps/vertigo.webp' },
      ],
    },
  ];

  const byId = new Map();
  for (const group of GROUPS) {
    for (const item of group.items) {
      byId.set(item.id, { ...item, groupId: group.id });
    }
  }

  const DEFAULT_ID = 'dark';

  function getById(id) {
    return byId.get(id) ?? byId.get(DEFAULT_ID);
  }

  function getImageItems() {
    return [...byId.values()].filter((item) => item.type === 'image');
  }

  function isValidId(id) {
    return byId.has(id);
  }

  return { GROUPS, DEFAULT_ID, getById, getImageItems, isValidId };
})();
