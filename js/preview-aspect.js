/**
 * Preview canvas aspect ratio options.
 */
const PreviewAspect = (() => {
  const OPTIONS = [
    { id: '16:9', label: '16:9', widthRatio: 16, heightRatio: 9 },
    { id: '4:3', label: '4:3', widthRatio: 4, heightRatio: 3 },
    { id: '1:1', label: '1:1', widthRatio: 1, heightRatio: 1 },
  ];

  const DEFAULT_ID = '16:9';
  const byId = new Map(OPTIONS.map((option) => [option.id, option]));

  function isValidId(id) {
    return byId.has(id);
  }

  function getById(id) {
    return byId.get(id) ?? byId.get(DEFAULT_ID);
  }

  /** Pixel dimensions with height fixed at baseSize (1080p reference). */
  function getDimensions(baseSize, id) {
    const { widthRatio, heightRatio } = getById(id);
    const height = baseSize;
    return { width: Math.round(baseSize * widthRatio / heightRatio), height };
  }

  return { OPTIONS, DEFAULT_ID, isValidId, getById, getDimensions };
})();
