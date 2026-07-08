/**
 * Preview zoom levels (display only — does not affect exported commands).
 */
const PreviewZoom = (() => {
  const DEFAULT = 1;
  const MIN = 0.5;
  const MAX = 3;
  const STEP = 0.25;

  function clamp(value) {
    let zoom = Number(value);
    if (Number.isNaN(zoom)) return DEFAULT;
    const steps = Math.round(zoom / STEP);
    zoom = steps * STEP;
    return Math.max(MIN, Math.min(MAX, zoom));
  }

  function canZoomIn(zoom) {
    return zoom < MAX;
  }

  function canZoomOut(zoom) {
    return zoom > MIN;
  }

  return { DEFAULT, MIN, MAX, STEP, clamp, canZoomIn, canZoomOut };
})();
