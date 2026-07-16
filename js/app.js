/**
 * Main application — multi-section UI, state management, persistence, and preview updates.
 */
(() => {
  const STORAGE_KEY = 'cs2-config-state';
  const LEGACY_STORAGE_KEY = 'cs2-crosshair-state';
  const URL_PARAM = 's';
  const PERSIST_DEBOUNCE_MS = 250;

  let sectionsState = ConfigSections.createDefaultSectionsState();
  let activeSectionId = ConfigSections.DEFAULT_ID;
  let exportScope = 'current';
  let previewBackground = 'dark';
  let previewZoom = PreviewZoom.DEFAULT;
  let previewMode = PreviewMode.DEFAULT_MODE;
  let customPresets = [];
  let colorTheme = 'system';
  let suppressPersist = false;
  let persistTimer = null;
  let deletedPresetUndo = null;
  let previewModalSection = null;
  let previewModalOpener = null;
  let keyPickerBindId = null;
  let keyPickerListening = false;

  const PREVIEW_MODAL_TITLES = {
    crosshair: 'Crosshair preview',
    viewmodel: 'Viewmodel preview',
    radar: 'Radar preview',
  };

  const sectionMounts = {};

  const els = {
    sectionTabs: document.getElementById('section-tabs'),
    settingsContainer: document.getElementById('settings-container'),
    visualPreview: document.getElementById('visual-preview'),
    crosshairPreview: document.getElementById('crosshair-preview'),
    viewmodelPreview: document.getElementById('viewmodel-preview'),
    radarPreview: document.getElementById('radar-preview'),
    crosshairToolbarExtras: document.getElementById('crosshair-toolbar-extras'),
    sectionSummary: document.getElementById('section-summary'),
    sectionSummaryTitle: document.getElementById('section-summary-title'),
    sectionSummaryMeta: document.getElementById('section-summary-meta'),
    sectionSummaryList: document.getElementById('section-summary-list'),
    sectionSummaryEmpty: document.getElementById('section-summary-empty'),
    previewCanvas: document.getElementById('preview-canvas'),
    viewmodelCanvas: document.getElementById('viewmodel-canvas'),
    radarCanvas: document.getElementById('radar-canvas'),
    previewModal: document.getElementById('preview-modal'),
    previewModalTitle: document.getElementById('preview-modal-title'),
    previewModalClose: document.getElementById('preview-modal-close'),
    previewModalCanvas: document.getElementById('preview-modal-canvas'),
    bindKeyPicker: document.getElementById('bind-key-picker'),
    bindKeyPickerTitle: document.getElementById('bind-key-picker-title'),
    bindKeyPickerSubtitle: document.getElementById('bind-key-picker-subtitle'),
    bindKeyPickerClose: document.getElementById('bind-key-picker-close'),
    bindKeyPickerListen: document.getElementById('bind-key-picker-listen'),
    bindKeyPickerHint: document.getElementById('bind-key-picker-hint'),
    bindKeyPickerGroups: document.getElementById('bind-key-picker-groups'),
    canvasWrap: document.getElementById('crosshair-canvas-wrap'),
    viewmodelCanvasWrap: document.getElementById('viewmodel-canvas-wrap'),
    radarCanvasWrap: document.getElementById('radar-canvas-wrap'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomLabel: document.getElementById('zoom-label'),
    commandOutput: document.getElementById('command-output'),
    commandOutputHighlight: document.getElementById('command-output-highlight'),
    copyBtn: document.getElementById('copy-btn'),
    copyMinimalBtn: document.getElementById('copy-minimal-btn'),
    applyImportBtn: document.getElementById('apply-import-btn'),
    downloadCfgBtn: document.getElementById('download-cfg-btn'),
    downloadAllBtn: document.getElementById('download-all-btn'),
    resetBtn: document.getElementById('reset-btn'),
    shareBtn: document.getElementById('share-btn'),
    toast: document.getElementById('toast'),
    colorSwatch: document.getElementById('color-swatch'),
    colorSwatchLabel: document.getElementById('color-swatch-label'),
    styleNote: document.getElementById('style-note'),
    lineupNote: document.getElementById('lineup-note'),
    sniperNote: document.getElementById('sniper-note'),
    previewModeRoot: document.querySelector('.preview-mode'),
    bgToggleRoot: document.getElementById('bg-toggle-root'),
    presetsGrid: document.getElementById('presets-grid'),
    customPresetsGrid: document.getElementById('custom-presets-grid'),
    customPresetsEmpty: document.getElementById('custom-presets-empty'),
    savePresetBtn: document.getElementById('save-preset-btn'),
    savePresetForm: document.getElementById('save-preset-form'),
    savePresetName: document.getElementById('save-preset-name'),
    savePresetCancel: document.getElementById('save-preset-cancel'),
    exportPresetsBtn: document.getElementById('export-presets-btn'),
    importPresetsBtn: document.getElementById('import-presets-btn'),
    importPresetsInput: document.getElementById('import-presets-input'),
    themeToggle: document.getElementById('theme-toggle'),
    settingsPanel: document.getElementById('settings-panel'),
  };

  function getViewmodelState() {
    return sectionsState.viewmodel;
  }

  function getRadarState() {
    return sectionsState.radar;
  }

  function hasVisualPreview() {
    return activeSectionId === 'crosshair'
      || activeSectionId === 'viewmodel'
      || activeSectionId === 'radar';
  }

  function getActiveSection() {
    return ConfigSections.getActiveOrDefault(activeSectionId);
  }

  function getCrosshairState() {
    return sectionsState.crosshair;
  }

  function exportSectionId() {
    return exportScope === 'current' ? activeSectionId : null;
  }

  function showToast(message, duration = 2000) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => els.toast.classList.remove('visible'), duration);
  }

  function setTogglePressed(container, selector, activeValue, attr = 'data-theme') {
    container?.querySelectorAll(selector).forEach((btn) => {
      const isActive = btn.getAttribute(attr) === activeValue;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function getPreviewRenderOptions() {
    return { mode: previewMode };
  }

  function updateStyleNote() {
    const isLineup = previewMode === PreviewMode.MODES.LINEUP;
    const isSniper = previewMode === PreviewMode.MODES.SNIPER;
    const isDynamic = !isLineup && !isSniper
      && CrosshairRenderer.isDynamicStyle(getCrosshairState().cl_crosshairstyle);
    els.styleNote.hidden = !isDynamic;
    els.lineupNote.hidden = !isLineup;
    els.sniperNote.hidden = !isSniper;
  }

  function formatColorLabel(color) {
    const hex = [color.r, color.g, color.b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    return `Crosshair color RGB ${color.r}, ${color.g}, ${color.b} (#${hex})`;
  }

  function updateColorSwatch() {
    const color = CrosshairRenderer.resolveColor(getCrosshairState());
    els.colorSwatch.style.background = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    if (els.colorSwatchLabel) {
      els.colorSwatchLabel.textContent = formatColorLabel(color);
    }
  }

  function getCanvasBaseSize(wrap, maxSize) {
    const width = wrap?.clientWidth || maxSize;
    return Math.min(width, maxSize);
  }

  /** CSS pixel size of an aspect-ratio wrap; falls back when hidden (0×0). */
  function getAspectWrapDisplaySize(wrap, aspect, fallbackWidth) {
    const width = Math.round(wrap?.clientWidth || 0);
    const height = Math.round(wrap?.clientHeight || 0);
    if (width >= 1 && height >= 1) {
      return { width, height };
    }
    const w = Math.max(1, Math.round(fallbackWidth));
    return {
      width: w,
      height: Math.max(1, Math.round(w / (aspect || (16 / 9)))),
    };
  }

  function getCrosshairDisplaySize() {
    return Math.max(
      1,
      Math.round(getCanvasBaseSize(els.canvasWrap, CrosshairRenderer.PREVIEW_SIZE) * previewZoom),
    );
  }

  function getViewmodelDisplaySize() {
    return getAspectWrapDisplaySize(
      els.viewmodelCanvasWrap,
      ViewmodelRenderer.ASPECT,
      ViewmodelRenderer.PREVIEW_SIZE,
    );
  }

  function getRadarDisplaySize() {
    return getAspectWrapDisplaySize(
      els.radarCanvasWrap,
      RadarRenderer.ASPECT,
      RadarRenderer.PREVIEW_SIZE,
    );
  }

  function fitAspectSize(aspect, maxW, maxH) {
    let width = maxW;
    let height = width / aspect;
    if (height > maxH) {
      height = maxH;
      width = height * aspect;
    }
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }

  function getModalDisplaySize(sectionId) {
    const maxW = Math.min(window.innerWidth * 0.92, 1600);
    const maxH = Math.min(window.innerHeight * 0.82, 1200);

    if (sectionId === 'crosshair') {
      return Math.max(1, Math.floor(Math.min(maxW, maxH)));
    }
    if (sectionId === 'viewmodel') {
      return fitAspectSize(ViewmodelRenderer.ASPECT || (16 / 9), maxW, maxH);
    }
    return fitAspectSize(RadarRenderer.ASPECT || (16 / 9), maxW, maxH);
  }

  function isPreviewModalOpen() {
    return Boolean(els.previewModal?.open && previewModalSection);
  }

  function getModalCanvasIf(sectionId) {
    if (!isPreviewModalOpen() || previewModalSection !== sectionId) return null;
    return els.previewModalCanvas;
  }

  function syncModalCanvasSize() {
    if (!els.previewModalCanvas || !previewModalSection) return false;
    const changed = syncCanvasSize(els.previewModalCanvas, getModalDisplaySize(previewModalSection));
    els.previewModalCanvas.style.imageRendering = previewModalSection === 'crosshair'
      ? 'pixelated'
      : 'auto';
    return changed;
  }

  /**
   * Sync canvas backing store to CSS size.
   * Aspect previews (width/height object) use devicePixelRatio for sharpness;
   * crosshair (numeric size) keeps 1 CSS px = 1 buffer px for true 1:1 / pixelated.
   * @param {{ fill?: boolean }} [options] fill: size via CSS 100% (aspect wraps); else explicit px.
   */
  function syncCanvasSize(canvas, size, options = {}) {
    if (!canvas) return false;

    const cssWidth = typeof size === 'number' ? size : size.width;
    const cssHeight = typeof size === 'number' ? size : size.height;
    const dpr = typeof size === 'number'
      ? 1
      : Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const width = Math.max(1, Math.round(cssWidth * dpr));
    const height = Math.max(1, Math.round(cssHeight * dpr));
    const changed = canvas.width !== width || canvas.height !== height;
    if (changed) {
      canvas.width = width;
      canvas.height = height;
    }

    if (options.fill) {
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    } else {
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
    }
    return changed;
  }

  function syncCanvasDimensions() {
    const crosshairChanged = syncCanvasSize(els.previewCanvas, getCrosshairDisplaySize());
    const viewmodelChanged = syncCanvasSize(els.viewmodelCanvas, getViewmodelDisplaySize(), { fill: true });
    const radarChanged = syncCanvasSize(els.radarCanvas, getRadarDisplaySize(), { fill: true });
    if (crosshairChanged || viewmodelChanged || radarChanged) {
      CrosshairRenderer.invalidateBgCache();
    }
  }

  function initViewmodelWeaponToggle() {
    const root = document.getElementById('viewmodel-weapon-toggle');
    root?.querySelectorAll('[data-weapon]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ViewmodelRenderer.setWeapon(btn.dataset.weapon);
        setTogglePressed(root, '[data-weapon]', btn.dataset.weapon, 'data-weapon');
        updateViewmodelPreview();
      });
    });
    setTogglePressed(root, '[data-weapon]', ViewmodelRenderer.getWeapon(), 'data-weapon');
  }

  function initRadarPreviewToggles() {
    const scoreboardRoot = document.getElementById('radar-scoreboard-toggle');
    scoreboardRoot?.querySelectorAll('[data-scoreboard]').forEach((btn) => {
      btn.addEventListener('click', () => {
        RadarRenderer.setScoreboardOpen(btn.dataset.scoreboard === 'on');
        setTogglePressed(
          scoreboardRoot,
          '[data-scoreboard]',
          btn.dataset.scoreboard,
          'data-scoreboard',
        );
        updateRadarPreview();
      });
    });
    setTogglePressed(
      scoreboardRoot,
      '[data-scoreboard]',
      RadarRenderer.isScoreboardOpen() ? 'on' : 'off',
      'data-scoreboard',
    );

    const zoomRoot = document.getElementById('radar-zoom-toggle');
    zoomRoot?.querySelectorAll('[data-radar-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        RadarRenderer.setUseAlternateZoom(btn.dataset.radarZoom === 'alternate');
        setTogglePressed(zoomRoot, '[data-radar-zoom]', btn.dataset.radarZoom, 'data-radar-zoom');
        updateRadarPreview();
      });
    });
    setTogglePressed(
      zoomRoot,
      '[data-radar-zoom]',
      RadarRenderer.isUsingAlternateZoom() ? 'alternate' : 'primary',
      'data-radar-zoom',
    );
  }

  async function updateViewmodelPreview() {
    if (activeSectionId !== 'viewmodel') return;
    syncCanvasDimensions();
    if (getModalCanvasIf('viewmodel') && syncModalCanvasSize()) {
      CrosshairRenderer.invalidateBgCache();
    }
    const state = getViewmodelState();
    await ViewmodelRenderer.render(els.viewmodelCanvas, state, previewBackground);
    const modalCanvas = getModalCanvasIf('viewmodel');
    if (modalCanvas) {
      await ViewmodelRenderer.render(modalCanvas, state, previewBackground);
    }
  }

  async function manageRadarAnimation() {
    const state = getRadarState();
    const modalCanvas = getModalCanvasIf('radar');
    if (Number(state.cl_radar_scale_dynamic) === 1) {
      RadarRenderer.startAnimation(
        els.radarCanvas,
        () => getRadarState(),
        () => previewBackground,
        modalCanvas,
      );
      return;
    }
    RadarRenderer.stopAnimation();
    await RadarRenderer.render(els.radarCanvas, state, previewBackground);
    if (modalCanvas) {
      await RadarRenderer.render(modalCanvas, state, previewBackground);
    }
  }

  function updateRadarPreview() {
    if (activeSectionId !== 'radar') return;
    syncCanvasDimensions();
    if (getModalCanvasIf('radar') && syncModalCanvasSize()) {
      CrosshairRenderer.invalidateBgCache();
    }
    manageRadarAnimation();
  }

  function updatePreview() {
    if (activeSectionId === 'viewmodel') {
      updateViewmodelPreview();
      return;
    }
    if (activeSectionId === 'radar') {
      updateRadarPreview();
      return;
    }
    if (activeSectionId !== 'crosshair') return;
    syncCanvasDimensions();
    if (getModalCanvasIf('crosshair') && syncModalCanvasSize()) {
      CrosshairRenderer.invalidateBgCache();
    }
    updateColorSwatch();
    updateStyleNote();
    updateLineupModeButton();
    managePreviewAnimation();
  }

  function updateLineupModeButton() {
    const lineupBtn = els.previewModeRoot?.querySelector('[data-mode="lineup"]');
    if (!lineupBtn) return;

    const enabled = PreviewMode.isLineupEnabled(getCrosshairState());
    lineupBtn.disabled = !enabled;
    lineupBtn.title = enabled ? '' : 'Enable a grenade lineup reticle in settings first';
    lineupBtn.classList.toggle('mode-btn-disabled', !enabled);

    if (!enabled && previewMode === PreviewMode.MODES.LINEUP) {
      setPreviewMode(PreviewMode.MODES.NORMAL);
    }
  }

  function managePreviewAnimation() {
    const options = getPreviewRenderOptions();
    const crosshairState = getCrosshairState();
    const modalCanvas = getModalCanvasIf('crosshair');

    if (previewMode !== PreviewMode.MODES.NORMAL) {
      CrosshairRenderer.stopAnimation();
      CrosshairRenderer.render(els.previewCanvas, crosshairState, previewBackground, 0, options);
      if (modalCanvas) {
        CrosshairRenderer.render(modalCanvas, crosshairState, previewBackground, 0, options);
      }
      return;
    }

    if (CrosshairRenderer.isDynamicStyle(crosshairState.cl_crosshairstyle)) {
      CrosshairRenderer.startAnimation(
        els.previewCanvas,
        () => getCrosshairState(),
        () => previewBackground,
        getPreviewRenderOptions,
        modalCanvas,
      );
      return;
    }

    CrosshairRenderer.stopAnimation();
    CrosshairRenderer.render(els.previewCanvas, crosshairState, previewBackground, 0, options);
    if (modalCanvas) {
      CrosshairRenderer.render(modalCanvas, crosshairState, previewBackground, 0, options);
    }
  }

  function openPreviewModal(sectionId, opener) {
    if (!els.previewModal || !PREVIEW_MODAL_TITLES[sectionId]) return;
    previewModalSection = sectionId;
    previewModalOpener = opener || null;
    if (els.previewModalTitle) {
      els.previewModalTitle.textContent = PREVIEW_MODAL_TITLES[sectionId];
    }
    if (!els.previewModal.open) {
      els.previewModal.showModal();
    }
    updatePreview();
  }

  function closePreviewModal() {
    if (els.previewModal?.open) {
      els.previewModal.close();
      return;
    }
    onPreviewModalClosed();
  }

  function onPreviewModalClosed() {
    const opener = previewModalOpener;
    previewModalSection = null;
    previewModalOpener = null;
    CrosshairRenderer.stopAnimation();
    RadarRenderer.stopAnimation();
    updatePreview();
    if (opener && typeof opener.focus === 'function') {
      opener.focus();
    }
  }

  function initPreviewModal() {
    if (!els.previewModal) return;

    const wraps = [
      { el: els.canvasWrap, sectionId: 'crosshair' },
      { el: els.viewmodelCanvasWrap, sectionId: 'viewmodel' },
      { el: els.radarCanvasWrap, sectionId: 'radar' },
    ];

    for (const { el, sectionId } of wraps) {
      if (!el) continue;
      el.addEventListener('click', () => openPreviewModal(sectionId, el));
      el.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openPreviewModal(sectionId, el);
      });
    }

    els.previewModalClose?.addEventListener('click', () => closePreviewModal());
    els.previewModal.addEventListener('click', (event) => {
      if (event.target === els.previewModal) closePreviewModal();
    });
    els.previewModal.addEventListener('close', onPreviewModalClosed);
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Highlight numbers and double-quoted strings in command output. */
  function highlightCommandText(text) {
    const re = /("(?:\\.|[^"\\])*")|(?<=^|[\s;])(-?\d+(?:\.\d+)?)(?=[\s;]|$)/gm;
    let html = '';
    let last = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      html += escapeHtml(text.slice(last, match.index));
      if (match[1] != null) {
        html += `<span class="tok-str">${escapeHtml(match[1])}</span>`;
      } else {
        html += `<span class="tok-num">${escapeHtml(match[2])}</span>`;
      }
      last = match.index + match[0].length;
    }
    html += escapeHtml(text.slice(last));
    // Trailing newline keeps overlay height in sync with the textarea.
    return `${html}\n`;
  }

  function updateCommandHighlight() {
    if (!els.commandOutputHighlight) return;
    els.commandOutputHighlight.innerHTML = highlightCommandText(els.commandOutput.value);
  }

  function setCommandOutput(text) {
    els.commandOutput.value = text;
    updateCommandHighlight();
  }

  function syncCommandOutputScroll() {
    if (!els.commandOutputHighlight) return;
    els.commandOutputHighlight.scrollTop = els.commandOutput.scrollTop;
    els.commandOutputHighlight.scrollLeft = els.commandOutput.scrollLeft;
  }

  function updateCommands() {
    if (document.activeElement === els.commandOutput) return;
    setCommandOutput(ConfigCommands.toMultilineString(sectionsState, {
      sectionId: exportSectionId(),
      comments: exportScope === 'all',
    }));
  }

  function isSectionAtDefault(sectionId) {
    const section = ConfigSections.get(sectionId);
    const state = sectionsState[sectionId];
    return section.CVAR_ORDER.every((key) => section.isAtDefault(key, state));
  }

  function isAtFullDefault() {
    for (const section of ConfigSections.ALL) {
      if (!isSectionAtDefault(section.id)) return false;
    }
    return previewBackground === Backgrounds.DEFAULT_ID
      && previewZoom === PreviewZoom.DEFAULT
      && previewMode === PreviewMode.DEFAULT_MODE
      && colorTheme === 'system';
  }

  function updateResetAllButton() {
    els.resetBtn.disabled = isAtFullDefault();
  }

  function updateSectionSummary() {
    const section = getActiveSection();
    if (hasVisualPreview()) return;

    const state = sectionsState[section.id];

    if (section.kind === 'binds') {
      const enabled = section.CVAR_ORDER.filter((id) => state[id]?.enabled);
      els.sectionSummaryTitle.textContent = section.label;
      els.sectionSummaryMeta.textContent = enabled.length
        ? `${enabled.length} bind${enabled.length === 1 ? '' : 's'} enabled`
        : 'No binds enabled';

      els.sectionSummaryList.replaceChildren();
      for (const id of enabled) {
        const entry = section.BY_ID[id];
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'section-summary-key';
        label.textContent = entry.label;
        const value = document.createElement('code');
        const preview = section.entryPreviewLines(entry, state[id]).join('\n');
        value.textContent = preview || '(enabled)';
        item.append(label, value);
        els.sectionSummaryList.append(item);
      }

      els.sectionSummaryEmpty.hidden = enabled.length > 0;
      els.sectionSummaryEmpty.textContent = 'Enable binds in this section to include them in your config.';
      els.sectionSummaryList.hidden = enabled.length === 0;
      return;
    }

    els.sectionSummaryEmpty.textContent = 'All settings in this section match defaults.';
    const changedKeys = section.CVAR_ORDER.filter((key) => !section.isAtDefault(key, state));

    els.sectionSummaryTitle.textContent = section.label;
    els.sectionSummaryMeta.textContent = changedKeys.length
      ? `${changedKeys.length} setting${changedKeys.length === 1 ? '' : 's'} changed from default`
      : 'No changes from defaults';

    els.sectionSummaryList.replaceChildren();
    for (const key of changedKeys) {
      const meta = section.SETTINGS[key];
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'section-summary-key';
      label.textContent = meta.label;
      const value = document.createElement('code');
      value.textContent = `${key} ${state[key]}`;
      item.append(label, value);
      els.sectionSummaryList.append(item);
    }

    els.sectionSummaryEmpty.hidden = changedKeys.length > 0;
    els.sectionSummaryList.hidden = changedKeys.length === 0;
  }

  function updateSectionVisibility() {
    const isCrosshair = activeSectionId === 'crosshair';
    const isViewmodel = activeSectionId === 'viewmodel';
    const isRadar = activeSectionId === 'radar';
    const visual = hasVisualPreview();

    if (els.visualPreview) els.visualPreview.hidden = !visual;
    els.crosshairPreview.hidden = !isCrosshair;
    if (els.viewmodelPreview) els.viewmodelPreview.hidden = !isViewmodel;
    if (els.radarPreview) els.radarPreview.hidden = !isRadar;
    if (els.crosshairToolbarExtras) els.crosshairToolbarExtras.hidden = !isCrosshair;
    els.sectionSummary.hidden = visual;

    for (const section of ConfigSections.ALL) {
      const mount = sectionMounts[section.id];
      if (mount) mount.hidden = section.id !== activeSectionId;
    }

    els.settingsPanel.setAttribute('aria-label', `${getActiveSection().label} settings`);
    updateSectionSummary();

    if (isCrosshair) {
      RadarRenderer.stopAnimation();
      updatePreview();
    } else if (isViewmodel) {
      CrosshairRenderer.stopAnimation();
      RadarRenderer.stopAnimation();
      updateViewmodelPreview();
    } else if (isRadar) {
      CrosshairRenderer.stopAnimation();
      updateRadarPreview();
    } else {
      CrosshairRenderer.stopAnimation();
      RadarRenderer.stopAnimation();
    }
  }

  function refresh(options = {}) {
    updateSectionVisibility();
    if (!options.skipCommands) updateCommands();
    updateControlStates();
    updateColorPresetButtons();
    updatePresetActiveStates();
    updateResetAllButton();
    if (!suppressPersist) schedulePersist();
  }

  function setState(section, key, rawValue) {
    sectionsState[section.id][key] = section.clamp(key, rawValue);
    refresh();
  }

  function updateControlStates() {
    for (const section of ConfigSections.ALL) {
      if (section.kind === 'binds') {
        updateBindControlStates(section);
        continue;
      }

      const state = sectionsState[section.id];
      for (const key of section.CVAR_ORDER) {
        const row = document.querySelector(`[data-setting="${key}"]`);
        if (!row) continue;

        const meta = section.SETTINGS[key];
        const enabled = section.isEnabled(key, state);

        if (meta.hideWhenDisabled) {
          row.hidden = !enabled;
          continue;
        }

        row.hidden = false;
        row.classList.toggle('disabled', !enabled);
        row.querySelectorAll('input, select').forEach((input) => {
          input.disabled = !enabled;
        });
      }
    }

    document.querySelectorAll('[data-reset-for]').forEach((btn) => {
      const key = btn.dataset.resetFor;
      const section = ConfigSections.findSectionForCvar(key);
      if (!section) return;
      const atDefault = section.isAtDefault(key, sectionsState[section.id]);
      btn.disabled = atDefault;
      btn.classList.toggle('is-default', atDefault);
    });
  }

  function updateBindControlStates(section) {
    const state = sectionsState[section.id];

    for (const entry of section.ENTRIES) {
      const row = document.querySelector(`[data-bind-id="${entry.id}"]`);
      if (!row) continue;

      const entryState = state[entry.id];
      const enabled = Boolean(entryState?.enabled);
      const keyInput = row.querySelector('.bind-key-input');
      if (keyInput) {
        keyInput.disabled = !enabled;
        const key = section.normalizeKey(entryState?.key);
        const invalid = enabled && entry.kind !== 'package' && !section.isValidKey(key);
        keyInput.classList.toggle('is-invalid', invalid);
        row.classList.toggle('bind-row-invalid', invalid);
      }

      const pickerBtn = row.querySelector('.bind-key-picker-btn');
      if (pickerBtn) pickerBtn.disabled = !enabled;

      const preview = row.querySelector('.bind-preview');
      if (preview) {
        preview.textContent = section.entryPreviewLines(entry, entryState).join('\n');
        preview.hidden = !enabled;
      }
    }

    document.querySelectorAll('[data-reset-bind]').forEach((btn) => {
      const id = btn.dataset.resetBind;
      const atDefault = section.isAtDefault(id, state);
      btn.disabled = atDefault;
      btn.classList.toggle('is-default', atDefault);
    });
  }

  function setBindEnabled(id, enabled) {
    const entry = BindSection.BY_ID[id];
    if (!entry) return;
    const current = sectionsState.binds[id] || BindSection.clamp(id, null);
    sectionsState.binds[id] = BindSection.clamp(id, { ...current, enabled: Boolean(enabled) });
    refresh();
  }

  function setBindKey(id, rawKey) {
    const entry = BindSection.BY_ID[id];
    if (!entry || entry.kind === 'package') return;
    const current = sectionsState.binds[id] || BindSection.clamp(id, null);
    sectionsState.binds[id] = BindSection.clamp(id, {
      ...current,
      key: BindSection.normalizeKey(rawKey),
    });
    refresh();
  }

  function resetBind(id) {
    const entry = BindSection.BY_ID[id];
    if (!entry) return;
    sectionsState.binds[id] = BindSection.clamp(id, null);
    syncBindControlsFromState();
    refresh();
    showToast(`${entry.label} reset`);
  }

  function createBindKeyPickerButton(entry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'setting-reset-btn bind-key-picker-btn';
    btn.dataset.pickBind = entry.id;
    btn.title = 'Choose key';
    btn.setAttribute('aria-label', `Choose key for ${entry.label}`);
    btn.disabled = !sectionsState.binds[entry.id]?.enabled;
    const icon = Icons.create('binds');
    if (icon) {
      icon.classList.remove('nav-icon');
      btn.append(icon);
    } else {
      btn.textContent = '⌨';
    }
    btn.addEventListener('click', () => openBindKeyPicker(entry.id));
    return btn;
  }

  function buildBindKeyPickerGroups() {
    if (!els.bindKeyPickerGroups) return;
    els.bindKeyPickerGroups.replaceChildren();

    for (const group of BindSection.KEY_PICKER_GROUPS) {
      const section = document.createElement('section');
      section.className = 'bind-key-picker-group';
      section.dataset.group = group.id;

      const label = document.createElement('h3');
      label.className = 'bind-key-picker-group-label';
      label.textContent = group.label;

      const grid = document.createElement('div');
      grid.className = 'bind-key-picker-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', group.label);

      for (const key of group.keys) {
        const keyBtn = document.createElement('button');
        keyBtn.type = 'button';
        keyBtn.className = 'bind-key-btn';
        keyBtn.dataset.key = key.value;
        keyBtn.textContent = key.label || key.value;
        keyBtn.title = key.value;
        keyBtn.addEventListener('click', () => applyPickedBindKey(key.value));
        grid.append(keyBtn);
      }

      section.append(label, grid);
      els.bindKeyPickerGroups.append(section);
    }
  }

  function syncBindKeyPickerSelection() {
    if (!els.bindKeyPickerGroups || !keyPickerBindId) return;
    const current = BindSection.normalizeKey(sectionsState.binds[keyPickerBindId]?.key);
    els.bindKeyPickerGroups.querySelectorAll('.bind-key-btn').forEach((btn) => {
      btn.classList.toggle('is-current', btn.dataset.key === current);
    });
  }

  function setKeyPickerListening(active) {
    keyPickerListening = Boolean(active);
    els.bindKeyPickerListen?.classList.toggle('is-listening', keyPickerListening);
    if (els.bindKeyPickerListen) {
      els.bindKeyPickerListen.textContent = keyPickerListening
        ? 'Listening… press a key or mouse button'
        : 'Press a key or mouse button…';
    }
    if (els.bindKeyPickerHint) {
      els.bindKeyPickerHint.textContent = keyPickerListening
        ? 'Click empty dialog space or scroll over this button for mouse/wheel. Esc stops listening.'
        : 'Or pick from the list below.';
    }
  }

  function openBindKeyPicker(bindId) {
    const entry = BindSection.BY_ID[bindId];
    if (!entry || entry.kind === 'package' || !els.bindKeyPicker) return;

    keyPickerBindId = bindId;
    if (els.bindKeyPickerSubtitle) {
      els.bindKeyPickerSubtitle.textContent = entry.label;
    }
    syncBindKeyPickerSelection();
    setKeyPickerListening(true);
    if (!els.bindKeyPicker.open) {
      els.bindKeyPicker.showModal();
    }
    els.bindKeyPickerListen?.focus();
  }

  function closeBindKeyPicker() {
    if (els.bindKeyPicker?.open) {
      els.bindKeyPicker.close();
    }
  }

  function onBindKeyPickerClosed() {
    keyPickerBindId = null;
    setKeyPickerListening(false);
  }

  function applyPickedBindKey(key) {
    if (!keyPickerBindId || !key) return;
    const id = keyPickerBindId;
    setBindKey(id, key);
    const input = document.getElementById(`bind-key-${id}`);
    if (input) input.value = BindSection.normalizeKey(key);
    closeBindKeyPicker();
    showToast(`Key set to ${BindSection.normalizeKey(key)}`);
  }

  function onKeyPickerCaptureKeydown(event) {
    if (!els.bindKeyPicker?.open || !keyPickerListening) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setKeyPickerListening(false);
      return;
    }
    const key = BindSection.keyFromKeyboardEvent(event);
    if (!key) return;
    event.preventDefault();
    event.stopPropagation();
    applyPickedBindKey(key);
  }

  function onKeyPickerCaptureMouse(event) {
    if (!els.bindKeyPicker?.open || !keyPickerListening) return;
    // Keep list / chrome clicks normal; capture mouse elsewhere in the dialog.
    if (event.target.closest('button, .bind-key-picker-groups')) return;
    const key = BindSection.keyFromMouseEvent(event);
    if (!key) return;
    event.preventDefault();
    applyPickedBindKey(key);
  }

  function onKeyPickerCaptureWheel(event) {
    if (!els.bindKeyPicker?.open || !keyPickerListening) return;
    // Capture wheel on the toolbar so the key list can still scroll.
    if (!event.target.closest('.bind-key-picker-toolbar')) return;
    const key = BindSection.keyFromWheelEvent(event);
    if (!key) return;
    event.preventDefault();
    applyPickedBindKey(key);
  }

  function onKeyPickerCaptureContextMenu(event) {
    if (!els.bindKeyPicker?.open || !keyPickerListening) return;
    if (event.target.closest('button, .bind-key-picker-groups')) return;
    event.preventDefault();
  }

  function initBindKeyPicker() {
    if (!els.bindKeyPicker) return;
    buildBindKeyPickerGroups();
    els.bindKeyPickerClose?.addEventListener('click', () => closeBindKeyPicker());
    els.bindKeyPickerListen?.addEventListener('click', () => {
      setKeyPickerListening(!keyPickerListening);
    });
    els.bindKeyPicker.addEventListener('close', onBindKeyPickerClosed);
    els.bindKeyPicker.addEventListener('click', (event) => {
      if (event.target === els.bindKeyPicker) closeBindKeyPicker();
    });
    els.bindKeyPicker.addEventListener('keydown', onKeyPickerCaptureKeydown);
    els.bindKeyPicker.addEventListener('mousedown', onKeyPickerCaptureMouse);
    els.bindKeyPicker.addEventListener('wheel', onKeyPickerCaptureWheel, { passive: false });
    els.bindKeyPicker.addEventListener('contextmenu', onKeyPickerCaptureContextMenu);
  }

  function createRangeControl(section, key, meta) {
    const state = sectionsState[section.id];
    const wrap = document.createElement('div');
    wrap.className = 'range-wrap';

    const range = document.createElement('input');
    range.type = 'range';
    range.id = `input-${key}`;
    range.min = meta.min;
    range.max = meta.max;
    range.step = meta.step;
    range.value = state[key];
    range.setAttribute('aria-describedby', `desc-${key}`);

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'number-input';
    number.min = meta.min;
    number.max = meta.max;
    number.step = meta.step;
    number.value = state[key];
    number.setAttribute('aria-label', `${meta.label} value`);
    number.setAttribute('aria-describedby', `desc-${key}`);

    const sync = (val, fromInput = false) => {
      const clamped = section.clamp(key, val);
      range.value = clamped;
      number.value = clamped;
      if (fromInput) {
        sectionsState[section.id][key] = clamped;
        refresh({ skipCommands: true });
        schedulePersist();
        updateCommands();
        return;
      }
      setState(section, key, clamped);
    };

    range.addEventListener('input', () => sync(range.value));
    number.addEventListener('input', () => sync(number.value, true));
    number.addEventListener('change', () => sync(number.value));

    wrap.append(range, number);
    return wrap;
  }

  function createToggleControl(section, key, meta) {
    const state = sectionsState[section.id];
    const label = document.createElement('label');
    label.className = 'toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `input-${key}`;
    input.checked = state[key] === 1;
    input.setAttribute('aria-label', meta?.label ?? section.SETTINGS[key].label);
    input.setAttribute('aria-describedby', `desc-${key}`);

    input.addEventListener('change', () => setState(section, key, input.checked ? 1 : 0));

    const slider = document.createElement('span');
    slider.className = 'toggle-slider';

    label.append(input, slider);
    return label;
  }

  function createColorSwatchDot(color, className = 'color-swatch-dot') {
    const dot = document.createElement('span');
    dot.className = className;
    dot.style.background = color;
    dot.setAttribute('aria-hidden', 'true');
    return dot;
  }

  function updateColorPresetButtons() {
    const wrap = document.getElementById('input-cl_crosshaircolor');
    if (!wrap) return;

    const selected = getCrosshairState().cl_crosshaircolor;
    wrap.querySelectorAll('[data-color-value]').forEach((btn) => {
      const value = Number(btn.dataset.colorValue);
      const isActive = value === selected;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

      if (value === 5) {
        btn.querySelector('.color-swatch-dot')?.style.setProperty(
          'background',
          getCrosshairSwatchColor(getCrosshairState()),
        );
      }
    });
  }

  function createColorPresetControl(section, key, meta) {
    const state = sectionsState[section.id];
    const wrap = document.createElement('div');
    wrap.className = 'color-preset-toggle';
    wrap.id = `input-${key}`;
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', meta.label);

    for (const opt of meta.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'color-preset-btn';
      btn.dataset.colorValue = opt.value;
      const isActive = opt.value === state[key];
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

      const swatchColor = opt.value === 5
        ? getCrosshairSwatchColor(state)
        : presetColorToCss(opt.value);
      btn.append(createColorSwatchDot(swatchColor), document.createTextNode(opt.label));
      btn.addEventListener('click', () => setState(section, key, opt.value));
      wrap.append(btn);
    }

    return wrap;
  }

  function createSelectControl(section, key, meta) {
    const state = sectionsState[section.id];
    const select = document.createElement('select');
    select.id = `input-${key}`;
    select.setAttribute('aria-describedby', `desc-${key}`);

    for (const opt of meta.options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === state[key]) option.selected = true;
      select.append(option);
    }

    select.addEventListener('change', () => setState(section, key, Number(select.value)));
    return select;
  }

  function resetSetting(section, key) {
    sectionsState[section.id][key] = section.SETTINGS[key].default;
    syncControlsFromState();
    refresh();
    showToast(`${section.SETTINGS[key].label} reset`);
  }

  function createResetButton(section, key) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'setting-reset-btn';
    btn.dataset.resetFor = key;
    btn.title = 'Reset to default';
    btn.setAttribute('aria-label', `Reset ${section.SETTINGS[key].label} to default`);
    btn.textContent = '↺';
    btn.addEventListener('click', () => resetSetting(section, key));
    return btn;
  }

  function createSettingRow(section, key) {
    const meta = section.SETTINGS[key];
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.dataset.setting = key;

    const labelWrap = document.createElement('div');
    labelWrap.className = 'setting-label-wrap';

    const label = document.createElement('label');
    label.className = 'setting-label';
    if (key !== 'cl_crosshaircolor') {
      label.htmlFor = `input-${key}`;
    }

    if (key in CHANNEL_SWATCH_COLORS) {
      label.classList.add('setting-label-with-swatch');
      label.append(createColorSwatchDot(CHANNEL_SWATCH_COLORS[key], 'setting-label-dot'));
    }

    const labelText = document.createElement('span');
    labelText.textContent = meta.label;
    label.append(labelText);

    if (meta.previewOnly) {
      const badge = document.createElement('span');
      badge.className = 'preview-only-badge';
      badge.textContent = 'Export only';
      badge.title = 'This setting is exported but not fully simulated in preview';
      label.append(badge);
    }

    const desc = document.createElement('span');
    desc.className = 'setting-desc';
    desc.id = `desc-${key}`;
    desc.textContent = meta.description;
    desc.title = meta.description;

    labelWrap.append(label, desc);

    let control;
    if (meta.type === 'range') {
      control = createRangeControl(section, key, meta);
    } else if (meta.type === 'toggle') {
      control = createToggleControl(section, key, meta);
    } else if (meta.type === 'select') {
      control = key === 'cl_crosshaircolor'
        ? createColorPresetControl(section, key, meta)
        : createSelectControl(section, key, meta);
    }

    row.append(labelWrap, wrapSettingControl(section, key, control));
    return row;
  }

  function wrapSettingControl(section, key, control) {
    const wrap = document.createElement('div');
    wrap.className = 'setting-control-wrap';
    wrap.append(control, createResetButton(section, key));
    return wrap;
  }

  function applyPreset(preset) {
    sectionsState.crosshair = { ...preset.state };
    syncControlsFromState();
    refresh();
    showToast(`Loaded ${preset.label}`);
  }

  function createPresetMiniCanvas(state) {
    const wrap = document.createElement('span');
    wrap.className = 'preset-preview';

    const canvas = document.createElement('canvas');
    canvas.className = 'preset-mini-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    CrosshairRenderer.renderMini(canvas, state, 64);

    wrap.append(canvas);
    return wrap;
  }

  function createPresetLoadButton(preset, subtitle) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-btn';
    btn.setAttribute('role', 'listitem');
    btn.setAttribute('aria-label', `Load ${preset.label} crosshair`);
    btn.dataset.presetId = preset.id ?? preset.label;

    btn.append(createPresetMiniCanvas(preset.state));

    const name = document.createElement('span');
    name.className = 'preset-name';
    name.textContent = preset.label;

    btn.append(name);

    if (subtitle) {
      const meta = document.createElement('span');
      meta.className = 'preset-team';
      meta.textContent = subtitle;
      btn.append(meta);
    }

    btn.addEventListener('click', () => applyPreset(preset));
    return btn;
  }

  function updatePresetActiveStates() {
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      const presetId = btn.dataset.presetId;
      let presetState = null;

      const proPreset = CrosshairPresets.PRESETS.find((p) => p.id === presetId);
      if (proPreset) presetState = proPreset.state;

      const customPreset = customPresets.find((p) => p.id === presetId);
      if (customPreset) presetState = customPreset.state;

      const isActive = presetState
        ? CrosshairSection.statesMatch(getCrosshairState(), presetState)
        : false;
      btn.classList.toggle('active', isActive);
    });
  }

  function buildProPresetsUI() {
    els.presetsGrid.replaceChildren();

    for (const preset of CrosshairPresets.PRESETS) {
      els.presetsGrid.append(createPresetLoadButton(preset, preset.team));
    }
  }

  function buildCustomPresetsUI() {
    const hasPresets = customPresets.length > 0;
    els.customPresetsEmpty.hidden = hasPresets;
    els.customPresetsGrid.hidden = !hasPresets;
    if (els.exportPresetsBtn) els.exportPresetsBtn.hidden = !hasPresets;
    els.customPresetsGrid.replaceChildren();

    for (const preset of customPresets) {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.setAttribute('role', 'listitem');

      const loadBtn = createPresetLoadButton(preset);
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'preset-delete-btn';
      deleteBtn.setAttribute('aria-label', `Delete ${preset.label}`);
      deleteBtn.textContent = '×';
      deleteBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        confirmDeleteCustomPreset(preset.id);
      });

      card.append(loadBtn, deleteBtn);
      els.customPresetsGrid.append(card);
    }

    updatePresetActiveStates();
  }

  function buildPresetsUI() {
    buildProPresetsUI();
    buildCustomPresetsUI();
  }

  function getSavePresetLabel() {
    const typed = els.savePresetName.value.trim();
    return typed || els.savePresetName.placeholder;
  }

  function showSavePresetForm() {
    els.savePresetForm.hidden = false;
    els.savePresetBtn.hidden = true;
    els.savePresetName.placeholder = CustomPresets.getNextDefaultLabel(customPresets);
    els.savePresetName.value = '';
    els.savePresetName.focus();
  }

  function hideSavePresetForm() {
    els.savePresetForm.hidden = true;
    els.savePresetBtn.hidden = false;
    els.savePresetName.value = '';
    els.savePresetName.placeholder = 'Preset name';
  }

  function saveCurrentPreset(name) {
    const label = CustomPresets.sanitizeLabel(name);
    if (!label) {
      showToast('Enter a preset name');
      return;
    }

    const existing = CustomPresets.findByLabel(customPresets, label);
    if (existing && !window.confirm(`Overwrite preset "${label}"?`)) {
      return;
    }

    const nextPresets = CustomPresets.upsertPreset(customPresets, label, getCrosshairState());

    if (!nextPresets) {
      showToast(`Maximum ${CustomPresets.MAX_PRESETS} presets`);
      return;
    }

    customPresets = nextPresets;
    hideSavePresetForm();
    buildCustomPresetsUI();
    if (!suppressPersist) persistState();
    showToast(existing ? `Updated ${label}` : `Saved ${label}`);
  }

  function confirmDeleteCustomPreset(id) {
    const preset = customPresets.find((item) => item.id === id);
    if (!preset) return;

    if (!window.confirm(`Delete preset "${preset.label}"?`)) return;

    deletedPresetUndo = { preset, index: customPresets.findIndex((p) => p.id === id) };
    customPresets = CustomPresets.removePreset(customPresets, id);
    buildCustomPresetsUI();
    if (!suppressPersist) persistState();

    showToast(`Deleted ${preset.label}`, 4000);
    clearTimeout(confirmDeleteCustomPreset._undoTimer);
    confirmDeleteCustomPreset._undoTimer = setTimeout(() => {
      deletedPresetUndo = null;
    }, 4000);
  }

  function undoDeletePreset() {
    if (!deletedPresetUndo) return;

    const { preset, index } = deletedPresetUndo;
    const next = [...customPresets];
    next.splice(Math.min(index, next.length), 0, preset);
    customPresets = next.slice(0, CustomPresets.MAX_PRESETS);
    deletedPresetUndo = null;
    buildCustomPresetsUI();
    if (!suppressPersist) persistState();
    showToast(`Restored ${preset.label}`);
  }

  function exportCustomPresets() {
    const blob = new Blob([JSON.stringify(customPresets, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cs2-crosshair-presets.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Presets exported');
  }

  function importCustomPresets(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const imported = CustomPresets.parseList(parsed);
        if (imported.length === 0) {
          showToast('No valid presets found');
          return;
        }
        customPresets = imported.slice(0, CustomPresets.MAX_PRESETS);
        buildCustomPresetsUI();
        if (!suppressPersist) persistState();
        showToast(`Imported ${customPresets.length} preset(s)`);
      } catch {
        showToast('Invalid preset file');
      }
    };
    reader.readAsText(file);
  }

  function initCustomPresets() {
    els.savePresetBtn?.addEventListener('click', showSavePresetForm);
    els.savePresetCancel?.addEventListener('click', hideSavePresetForm);
    els.savePresetForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      saveCurrentPreset(getSavePresetLabel());
    });
    els.exportPresetsBtn?.addEventListener('click', exportCustomPresets);
    els.importPresetsBtn?.addEventListener('click', () => els.importPresetsInput?.click());
    els.importPresetsInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) importCustomPresets(file);
      event.target.value = '';
    });
  }

  function buildBindsSettings(section) {
    const mount = document.createElement('div');
    mount.className = 'section-settings';
    mount.dataset.section = section.id;
    mount.hidden = section.id !== activeSectionId;

    const intro = document.createElement('p');
    intro.className = 'binds-intro muted';
    intro.textContent = 'Enable binds to include them in export. Use the keyboard button to pick keys (including mouse buttons), or type CS2 names (v, mouse5, mwheeldown).';
    mount.append(intro);

    for (const group of section.GROUPS) {
      const details = document.createElement('details');
      details.className = 'settings-group';
      details.open = true;

      const summary = document.createElement('summary');
      const summaryLabel = document.createElement('span');
      summaryLabel.className = 'summary-label';
      summaryLabel.textContent = group.label;
      summary.append(summaryLabel);
      details.append(summary);

      const body = document.createElement('div');
      body.className = 'settings-group-body';

      for (const entry of section.ENTRIES.filter((item) => item.group === group.id)) {
        body.append(createBindRow(entry));
      }

      details.append(body);
      mount.append(details);
    }

    sectionMounts[section.id] = mount;
    els.settingsContainer.append(mount);
  }

  function createBindRow(entry) {
    const state = sectionsState.binds[entry.id];
    const row = document.createElement('div');
    row.className = 'bind-row';
    row.dataset.bindId = entry.id;

    const header = document.createElement('div');
    header.className = 'bind-row-header';

    const toggle = document.createElement('label');
    toggle.className = 'toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `bind-enabled-${entry.id}`;
    checkbox.checked = Boolean(state?.enabled);
    checkbox.setAttribute('aria-label', `Enable ${entry.label}`);
    checkbox.addEventListener('change', () => setBindEnabled(entry.id, checkbox.checked));
    const slider = document.createElement('span');
    slider.className = 'toggle-slider';
    toggle.append(checkbox, slider);

    const textWrap = document.createElement('div');
    textWrap.className = 'bind-row-text';
    const title = document.createElement('label');
    title.className = 'bind-row-title';
    title.htmlFor = `bind-enabled-${entry.id}`;
    title.textContent = entry.label;
    const desc = document.createElement('p');
    desc.className = 'setting-desc';
    desc.textContent = entry.description;
    if (entry.requiresCheats) {
      const badge = document.createElement('span');
      badge.className = 'bind-cheat-badge';
      badge.textContent = 'sv_cheats';
      title.append(' ', badge);
    }
    textWrap.append(title, desc);

    const controls = document.createElement('div');
    controls.className = 'bind-row-controls';

    if (entry.kind !== 'package') {
      const keyLabel = document.createElement('label');
      keyLabel.className = 'bind-key-label';
      keyLabel.htmlFor = `bind-key-${entry.id}`;
      keyLabel.textContent = 'Key';
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.className = 'bind-key-input';
      keyInput.id = `bind-key-${entry.id}`;
      keyInput.value = state?.key ?? entry.defaultKey;
      keyInput.autocomplete = 'off';
      keyInput.spellcheck = false;
      keyInput.placeholder = entry.defaultKey || 'key';
      keyInput.disabled = !state?.enabled;
      keyInput.addEventListener('input', () => setBindKey(entry.id, keyInput.value));
      controls.append(keyLabel, keyInput, createBindKeyPickerButton(entry));
    } else {
      const packageNote = document.createElement('span');
      packageNote.className = 'bind-package-note muted';
      packageNote.textContent = 'Keys 1–0';
      controls.append(packageNote);
    }

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'setting-reset-btn';
    resetBtn.dataset.resetBind = entry.id;
    resetBtn.title = 'Reset to default';
    resetBtn.setAttribute('aria-label', `Reset ${entry.label} to default`);
    resetBtn.textContent = '↺';
    resetBtn.addEventListener('click', () => resetBind(entry.id));
    controls.append(resetBtn);

    header.append(toggle, textWrap, controls);

    const preview = document.createElement('pre');
    preview.className = 'bind-preview';
    preview.textContent = BindSection.entryPreviewLines(entry, state).join('\n');
    preview.hidden = !state?.enabled;

    row.append(header, preview);
    return row;
  }

  function buildSettingsForSection(section) {
    if (section.kind === 'binds') {
      buildBindsSettings(section);
      return;
    }

    const mount = document.createElement('div');
    mount.className = 'section-settings';
    mount.dataset.section = section.id;
    mount.hidden = section.id !== activeSectionId;

    for (const group of section.GROUPS) {
      const details = document.createElement('details');
      details.className = 'settings-group';
      details.open = group === section.GROUPS[0]
        || group.id === 'shape'
        || group.id === 'color'
        || group.id === 'position'
        || group.id === 'minimap'
        || group.id === 'scale'
        || group.id === 'limits';

      const summary = document.createElement('summary');
      const summaryLabel = document.createElement('span');
      summaryLabel.className = 'summary-label';
      summaryLabel.textContent = group.label;
      summary.append(summaryLabel);

      const headerToggleKey = group.headerToggle;
      if (headerToggleKey) {
        const toggle = createToggleControl(section, headerToggleKey, section.SETTINGS[headerToggleKey]);
        toggle.classList.add('summary-toggle');
        toggle.addEventListener('click', (e) => e.stopPropagation());
        toggle.addEventListener('mousedown', (e) => e.stopPropagation());
        const resetBtn = createResetButton(section, headerToggleKey);
        resetBtn.classList.add('summary-reset-btn');
        resetBtn.addEventListener('click', (e) => e.stopPropagation());
        resetBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        summary.append(toggle, resetBtn);
      }

      details.append(summary);

      const body = document.createElement('div');
      body.className = 'settings-group-body';

      for (const key of group.settings) {
        if (key === headerToggleKey) continue;
        body.append(createSettingRow(section, key));
      }

      details.append(body);
      mount.append(details);
    }

    sectionMounts[section.id] = mount;
    els.settingsContainer.append(mount);
  }

  function buildSettingsUI() {
    els.settingsContainer.replaceChildren();
    for (const section of ConfigSections.ALL) {
      buildSettingsForSection(section);
    }
  }

  function buildSectionTabs() {
    els.sectionTabs.replaceChildren();

    for (const section of ConfigSections.ALL) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'section-tab';
      btn.setAttribute('role', 'tab');
      btn.id = `section-tab-${section.id}`;
      btn.dataset.section = section.id;
      btn.setAttribute('aria-selected', section.id === activeSectionId ? 'true' : 'false');
      btn.append(Icons.labeled(section.icon || section.id, section.label));
      btn.addEventListener('click', () => setActiveSection(section.id));
      els.sectionTabs.append(btn);
    }

    updateSectionTabs();
  }

  function updateSectionTabs() {
    els.sectionTabs?.querySelectorAll('.section-tab').forEach((btn) => {
      const isActive = btn.dataset.section === activeSectionId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function setActiveSection(id) {
    if (!ConfigSections.isValidId(id)) return;
    if (isPreviewModalOpen()) closePreviewModal();
    activeSectionId = id;
    updateSectionTabs();
    refresh();
  }

  function setExportScope(scope) {
    if (scope !== 'current' && scope !== 'all') return;
    exportScope = scope;
    setTogglePressed(document.querySelector('.export-toggle'), '.export-scope-btn', scope, 'data-export-scope');
    updateCommands();
  }

  function initExportScope() {
    document.querySelectorAll('[data-export-scope]').forEach((btn) => {
      btn.addEventListener('click', () => setExportScope(btn.dataset.exportScope));
    });
    setTogglePressed(document.querySelector('.export-toggle'), '.export-scope-btn', exportScope, 'data-export-scope');
  }

  function applySectionsState(incoming) {
    if (!incoming || typeof incoming !== 'object') return;
    for (const section of ConfigSections.ALL) {
      if (incoming[section.id]) {
        section.mergeState(sectionsState[section.id], incoming[section.id]);
      }
    }
  }

  function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get(URL_PARAM);
    if (!encoded) return false;

    const parsed = ConfigCommands.fromUrlParam(encoded);
    if (!parsed) return false;

    applySectionsState(parsed.sections);

    if (parsed.previewBackground) {
      previewBackground = parsed.previewBackground;
    }

    if (parsed.previewMode) {
      previewMode = parsed.previewMode;
    }

    return true;
  }

  function migrateLegacyStorage(parsed) {
    const migrated = {
      sections: ConfigSections.createDefaultSectionsState(),
      previewBackground: Backgrounds.DEFAULT_ID,
      previewZoom: PreviewZoom.DEFAULT,
      previewMode: PreviewMode.DEFAULT_MODE,
      customPresets: [],
      theme: 'system',
      activeSection: ConfigSections.DEFAULT_ID,
    };

    if (parsed?.sections && typeof parsed.sections === 'object') {
      applySectionsStateInto(migrated.sections, parsed.sections);
    } else if (parsed?.crosshair && typeof parsed.crosshair === 'object') {
      CrosshairSection.mergeState(migrated.sections.crosshair, parsed.crosshair);
    } else if (parsed && typeof parsed === 'object' && 'cl_crosshairstyle' in parsed) {
      CrosshairSection.mergeState(migrated.sections.crosshair, parsed);
    }

    if (parsed?.previewBackground && Backgrounds.isValidId(parsed.previewBackground)) {
      migrated.previewBackground = parsed.previewBackground;
    }
    if (parsed?.previewZoom != null) {
      migrated.previewZoom = PreviewZoom.clamp(parsed.previewZoom);
    }
    if (PreviewMode.isValidMode(parsed?.previewMode)) {
      migrated.previewMode = parsed.previewMode;
    }
    if (parsed?.customPresets) {
      migrated.customPresets = CustomPresets.parseList(parsed.customPresets);
    }
    if (parsed?.theme === 'system' || parsed?.theme === 'light' || parsed?.theme === 'dark') {
      migrated.theme = parsed.theme;
    }
    if (ConfigSections.isValidId(parsed?.activeSection)) {
      migrated.activeSection = parsed.activeSection;
    }

    return migrated;
  }

  function applySectionsStateInto(target, incoming) {
    for (const section of ConfigSections.ALL) {
      if (incoming[section.id]) {
        section.mergeState(target[section.id], incoming[section.id]);
      }
    }
  }

  function loadFromStorage() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      let fromLegacy = false;
      if (!raw) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY);
        fromLegacy = Boolean(raw);
      }
      if (!raw) return false;

      const parsed = JSON.parse(raw);
      const migrated = migrateLegacyStorage(parsed);

      sectionsState = migrated.sections;
      previewBackground = migrated.previewBackground;
      previewZoom = migrated.previewZoom;
      previewMode = migrated.previewMode;
      customPresets = migrated.customPresets;
      colorTheme = migrated.theme;
      activeSectionId = migrated.activeSection;

      if (fromLegacy) {
        persistState();
      }

      return true;
    } catch {
      return false;
    }
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sections: sectionsState,
        activeSection: activeSectionId,
        previewBackground,
        previewZoom,
        previewMode,
        customPresets,
        theme: colorTheme,
      }));
      const url = new URL(window.location.href);
      url.searchParams.set(URL_PARAM, ConfigCommands.toUrlParam(sectionsState, {
        includePreview: true,
        previewBackground,
        previewMode,
      }));
      window.history.replaceState(null, '', url.toString());
    } catch {
      // storage or history may be unavailable
    }
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistState, PERSIST_DEBOUNCE_MS);
  }

  function syncControlsFromState() {
    suppressPersist = true;
    for (const section of ConfigSections.ALL) {
      if (section.kind === 'binds') {
        syncBindControlsFromState();
        continue;
      }

      const state = sectionsState[section.id];
      for (const key of section.CVAR_ORDER) {
        const input = document.getElementById(`input-${key}`);
        if (!input) continue;

        const meta = section.SETTINGS[key];
        const val = state[key];

        if (meta.type === 'toggle') {
          input.checked = val === 1;
        } else if (meta.type === 'select') {
          if (key === 'cl_crosshaircolor') {
            updateColorPresetButtons();
          } else {
            input.value = String(val);
          }
        } else if (meta.type === 'range') {
          input.value = val;
          const row = input.closest('.setting-row');
          const number = row?.querySelector('.number-input');
          if (number) number.value = val;
        }
      }
    }
    suppressPersist = false;
  }

  function syncBindControlsFromState() {
    const state = sectionsState.binds;
    for (const entry of BindSection.ENTRIES) {
      const entryState = state[entry.id];
      const checkbox = document.getElementById(`bind-enabled-${entry.id}`);
      if (checkbox) checkbox.checked = Boolean(entryState?.enabled);

      const keyInput = document.getElementById(`bind-key-${entry.id}`);
      if (keyInput) {
        keyInput.value = entryState?.key ?? entry.defaultKey;
        keyInput.disabled = !entryState?.enabled;
      }

      const pickerBtn = document.querySelector(`[data-pick-bind="${entry.id}"]`);
      if (pickerBtn) pickerBtn.disabled = !entryState?.enabled;

      const row = document.querySelector(`[data-bind-id="${entry.id}"]`);
      const preview = row?.querySelector('.bind-preview');
      if (preview) {
        preview.textContent = BindSection.entryPreviewLines(entry, entryState).join('\n');
        preview.hidden = !entryState?.enabled;
      }
    }
  }

  function applyColorTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function setColorTheme(theme) {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
    colorTheme = theme;
    applyColorTheme(theme);
    setTogglePressed(els.themeToggle, '.theme-btn', theme, 'data-theme');
    if (!suppressPersist) schedulePersist();
  }

  function initThemeToggle() {
    setTogglePressed(els.themeToggle, '.theme-btn', colorTheme, 'data-theme');
    els.themeToggle?.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => setColorTheme(btn.dataset.theme));
    });
    applyColorTheme(colorTheme);
  }

  function resetToDefaults() {
    const scopeLabel = exportScope === 'current'
      ? `${getActiveSection().label} settings`
      : 'all config sections, preview, and theme';

    if (!window.confirm(`Reset ${scopeLabel} to defaults?`)) return;

    if (exportScope === 'current') {
      const section = getActiveSection();
      sectionsState[section.id] = section.createDefaultState();
    } else {
      sectionsState = ConfigSections.createDefaultSectionsState();
      previewBackground = Backgrounds.DEFAULT_ID;
      previewZoom = PreviewZoom.DEFAULT;
      previewMode = PreviewMode.DEFAULT_MODE;
      colorTheme = 'system';
      setPreviewBackground(previewBackground);
      applyPreviewZoom();
      applyPreviewMode();
      setColorTheme(colorTheme);
      CrosshairRenderer.invalidateBgCache();
    }

    syncControlsFromState();
    refresh();
    showToast(exportScope === 'current' ? `${getActiveSection().label} reset` : 'Reset to defaults');
  }

  async function copyText(text, button, successLabel = 'Copied!') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCommandOutput(text);
      els.commandOutput.select();
      document.execCommand('copy');
    }

    if (button) {
      const original = button.textContent;
      button.textContent = successLabel;
      button.classList.add('btn-success');
      setTimeout(() => {
        button.textContent = original;
        button.classList.remove('btn-success');
      }, 1500);
    }

    showToast(successLabel);
  }

  async function copyCommands(minimal = false) {
    const text = ConfigCommands.toCommandString(sectionsState, {
      minimal,
      sectionId: exportSectionId(),
    });
    await copyText(text, minimal ? els.copyMinimalBtn : els.copyBtn);
  }

  function applyImportedCommands() {
    const { sections, parsed, skipped } = ConfigCommands.fromCommandString(els.commandOutput.value);

    if (parsed === 0) {
      showToast('No valid commands found');
      return;
    }

    applySectionsState(sections);
    syncControlsFromState();
    refresh();
    const suffix = skipped > 0 ? ` (${skipped} skipped)` : '';
    showToast(`Applied ${parsed} setting(s)${suffix}`);
  }

  function downloadCfg() {
    if (exportScope === 'current') {
      const section = getActiveSection();
      ConfigCommands.downloadSectionCfg(section, sectionsState[section.id]);
      showToast(`Downloaded ${section.fileName}.cfg`);
      return;
    }

    ConfigCommands.downloadCombinedCfg(sectionsState, { mode: 'inline' });
    showToast('Downloaded cs2-config.cfg');
  }

  function downloadAllSections() {
    ConfigCommands.downloadAllModular(sectionsState);
    showToast('Downloading section .cfg files + autoexec.cfg');
  }

  async function shareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, ConfigCommands.toUrlParam(sectionsState, {
      includePreview: true,
      previewBackground,
      previewMode,
    }));
    try {
      await navigator.clipboard.writeText(url.toString());
      showToast('Share link copied!');
    } catch {
      showToast('Link updated in address bar');
      window.history.replaceState(null, '', url.toString());
    }
  }

  function setPreviewBackground(id) {
    if (!Backgrounds.isValidId(id)) return;
    previewBackground = id;
    CrosshairRenderer.invalidateBgCache();
    setTogglePressed(els.bgToggleRoot, '[data-bg]', id, 'data-bg');
    CrosshairRenderer.ensureImageLoaded(id, () => {
      CrosshairRenderer.invalidateBgCache();
      updatePreview();
    });
    updatePreview();
    if (!suppressPersist) schedulePersist();
  }

  function applyPreviewZoom() {
    if (els.zoomLabel) {
      els.zoomLabel.textContent = `${Math.round(previewZoom * 100)}%`;
    }
    if (els.zoomInBtn) els.zoomInBtn.disabled = !PreviewZoom.canZoomIn(previewZoom);
    if (els.zoomOutBtn) els.zoomOutBtn.disabled = !PreviewZoom.canZoomOut(previewZoom);
    syncCanvasDimensions();
    updatePreview();
  }

  function setPreviewZoom(zoom) {
    previewZoom = PreviewZoom.clamp(zoom);
    applyPreviewZoom();
    updateResetAllButton();
    if (!suppressPersist) schedulePersist();
  }

  function initPreviewZoom() {
    applyPreviewZoom();
    els.zoomInBtn?.addEventListener('click', () => {
      setPreviewZoom(previewZoom + PreviewZoom.STEP);
    });
    els.zoomOutBtn?.addEventListener('click', () => {
      setPreviewZoom(previewZoom - PreviewZoom.STEP);
    });
  }

  function applyPreviewMode() {
    setTogglePressed(els.previewModeRoot, '[data-mode]', previewMode, 'data-mode');
    updateLineupModeButton();
  }

  function setPreviewMode(mode) {
    if (!PreviewMode.isValidMode(mode)) return;
    if (mode === PreviewMode.MODES.LINEUP && !PreviewMode.isLineupEnabled(getCrosshairState())) return;

    previewMode = mode;
    applyPreviewMode();
    updateResetAllButton();
    updatePreview();
    if (!suppressPersist) schedulePersist();
  }

  function initPreviewMode() {
    els.previewModeRoot?.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => setPreviewMode(btn.dataset.mode));
    });

    applyPreviewMode();
  }

  function buildBackgroundToggles() {
    els.bgToggleRoot.replaceChildren();

    for (const group of Backgrounds.GROUPS) {
      const groupEl = document.createElement('div');
      groupEl.className = 'bg-group';

      const label = document.createElement('span');
      label.className = 'bg-group-label';
      label.textContent = group.label;

      const toggle = document.createElement('div');
      toggle.className = 'bg-toggle';
      toggle.setAttribute('role', 'group');
      toggle.setAttribute('aria-label', `${group.label} backgrounds`);

      for (const item of group.items) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isMap = group.id === 'maps';
        btn.className = `bg-btn${isMap ? ' bg-btn-map' : ''}`;
        btn.dataset.bg = item.id;
        const isActive = item.id === previewBackground;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.setAttribute('aria-label', `${item.label} background`);

        if (isMap && item.src) {
          const thumb = document.createElement('span');
          thumb.className = 'bg-btn-thumb';
          thumb.style.backgroundImage = `url(${item.src})`;
          btn.append(thumb, document.createTextNode(item.label));
        } else {
          btn.textContent = item.label;
        }

        btn.addEventListener('click', () => setPreviewBackground(item.id));
        toggle.append(btn);
      }

      groupEl.append(label, toggle);
      els.bgToggleRoot.append(groupEl);
    }
  }

  function initPreviewCanvas() {
    const onLayoutChange = () => {
      syncCanvasDimensions();
      updatePreview();
    };

    if (typeof ResizeObserver !== 'undefined') {
      if (els.canvasWrap) new ResizeObserver(onLayoutChange).observe(els.canvasWrap);
      if (els.viewmodelCanvasWrap) {
        new ResizeObserver(onLayoutChange).observe(els.viewmodelCanvasWrap);
      }
      if (els.radarCanvasWrap) {
        new ResizeObserver(onLayoutChange).observe(els.radarCanvasWrap);
      }
    }

    window.addEventListener('resize', onLayoutChange);
  }

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && deletedPresetUndo) {
        event.preventDefault();
        undoDeletePreset();
      }
    });
  }

  function init() {
    loadFromStorage();
    loadFromUrl();

    initPreviewCanvas();
    initPreviewModal();
    initBindKeyPicker();
    initThemeToggle();
    Icons.hydrate(document.querySelector('.site-nav'));
    initPreviewZoom();
    initPreviewMode();
    initViewmodelWeaponToggle();
    initRadarPreviewToggles();
    initCustomPresets();
    initKeyboardShortcuts();
    initExportScope();
    buildSectionTabs();
    buildPresetsUI();
    buildSettingsUI();
    buildBackgroundToggles();

    els.copyBtn.addEventListener('click', () => copyCommands(false));
    els.copyMinimalBtn?.addEventListener('click', () => copyCommands(true));
    els.applyImportBtn?.addEventListener('click', applyImportedCommands);
    els.downloadCfgBtn?.addEventListener('click', downloadCfg);
    els.downloadAllBtn?.addEventListener('click', downloadAllSections);
    els.resetBtn.addEventListener('click', resetToDefaults);
    els.shareBtn.addEventListener('click', shareLink);
    els.commandOutput.addEventListener('input', updateCommandHighlight);
    els.commandOutput.addEventListener('scroll', syncCommandOutputScroll);

    syncControlsFromState();
    applyPreviewZoom();
    applyPreviewMode();
    setTogglePressed(els.bgToggleRoot, '[data-bg]', previewBackground, 'data-bg');

    refresh();
    CrosshairRenderer.preloadImages(() => {
      updatePreview();
      updateViewmodelPreview();
    });
    ViewmodelRenderer.preload?.(updateViewmodelPreview);
    RadarRenderer.whenReady(() => {
      if (activeSectionId === 'radar') updateRadarPreview();
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
