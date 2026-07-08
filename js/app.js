/**
 * Main application — UI generation, state management, persistence, and preview updates.
 */
(() => {
  const STORAGE_KEY = 'cs2-crosshair-state';
  const URL_PARAM = 's';
  const PERSIST_DEBOUNCE_MS = 250;

  let crosshairState = createDefaultCrosshairState();
  let previewBackground = 'dark';
  let previewZoom = PreviewZoom.DEFAULT;
  let previewMode = PreviewMode.DEFAULT_MODE;
  let customPresets = [];
  let colorTheme = 'system';
  let suppressPersist = false;
  let persistTimer = null;
  let deletedPresetUndo = null;

  const els = {
    settingsContainer: document.getElementById('settings-container'),
    previewCanvas: document.getElementById('preview-canvas'),
    canvasWrap: document.querySelector('.canvas-wrap'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomLabel: document.getElementById('zoom-label'),
    commandOutput: document.getElementById('command-output'),
    copyBtn: document.getElementById('copy-btn'),
    copyMinimalBtn: document.getElementById('copy-minimal-btn'),
    applyImportBtn: document.getElementById('apply-import-btn'),
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
  };

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
      && CrosshairRenderer.isDynamicStyle(crosshairState.cl_crosshairstyle);
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
    const color = CrosshairRenderer.resolveColor(crosshairState);
    els.colorSwatch.style.background = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    if (els.colorSwatchLabel) {
      els.colorSwatchLabel.textContent = formatColorLabel(color);
    }
  }

  function updatePreview() {
    updateColorSwatch();
    updateStyleNote();
    updateLineupModeButton();
    managePreviewAnimation();
  }

  function updateLineupModeButton() {
    const lineupBtn = els.previewModeRoot?.querySelector('[data-mode="lineup"]');
    if (!lineupBtn) return;

    const enabled = PreviewMode.isLineupEnabled(crosshairState);
    lineupBtn.disabled = !enabled;
    lineupBtn.title = enabled ? '' : 'Enable a grenade lineup reticle in settings first';
    lineupBtn.classList.toggle('mode-btn-disabled', !enabled);

    if (!enabled && previewMode === PreviewMode.MODES.LINEUP) {
      setPreviewMode(PreviewMode.MODES.NORMAL);
    }
  }

  function managePreviewAnimation() {
    const options = getPreviewRenderOptions();

    if (previewMode !== PreviewMode.MODES.NORMAL) {
      CrosshairRenderer.stopAnimation();
      CrosshairRenderer.render(els.previewCanvas, crosshairState, previewBackground, 0, options);
      return;
    }

    if (CrosshairRenderer.isDynamicStyle(crosshairState.cl_crosshairstyle)) {
      CrosshairRenderer.startAnimation(
        els.previewCanvas,
        () => crosshairState,
        () => previewBackground,
        getPreviewRenderOptions,
      );
      return;
    }

    CrosshairRenderer.stopAnimation();
    CrosshairRenderer.render(els.previewCanvas, crosshairState, previewBackground, 0, options);
  }

  function updateCommands() {
    els.commandOutput.value = CrosshairCommands.toMultilineString(crosshairState);
  }

  function isAtFullDefault() {
    for (const key of CROSSHAIR_CVAR_ORDER) {
      if (!isSettingAtDefault(key, crosshairState)) return false;
    }
    return previewBackground === Backgrounds.DEFAULT_ID
      && previewZoom === PreviewZoom.DEFAULT
      && previewMode === PreviewMode.DEFAULT_MODE
      && colorTheme === 'system';
  }

  function updateResetAllButton() {
    els.resetBtn.disabled = isAtFullDefault();
  }

  function refresh(options = {}) {
    updatePreview();
    if (!options.skipCommands) updateCommands();
    updateControlStates();
    updateColorPresetButtons();
    updatePresetActiveStates();
    updateResetAllButton();
    if (!suppressPersist) schedulePersist();
  }

  function setState(key, rawValue) {
    crosshairState[key] = clampSettingValue(key, rawValue);
    refresh();
  }

  function updateControlStates() {
    for (const key of CROSSHAIR_CVAR_ORDER) {
      const row = document.querySelector(`[data-setting="${key}"]`);
      if (!row) continue;

      const meta = CROSSHAIR_SETTINGS[key];
      const enabled = isSettingEnabled(key, crosshairState);

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

    document.querySelectorAll('[data-reset-for]').forEach((btn) => {
      const key = btn.dataset.resetFor;
      const atDefault = isSettingAtDefault(key, crosshairState);
      btn.disabled = atDefault;
      btn.classList.toggle('is-default', atDefault);
    });
  }

  function createRangeControl(key, meta) {
    const wrap = document.createElement('div');
    wrap.className = 'range-wrap';

    const range = document.createElement('input');
    range.type = 'range';
    range.id = `input-${key}`;
    range.min = meta.min;
    range.max = meta.max;
    range.step = meta.step;
    range.value = crosshairState[key];
    range.setAttribute('aria-describedby', `desc-${key}`);

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'number-input';
    number.min = meta.min;
    number.max = meta.max;
    number.step = meta.step;
    number.value = crosshairState[key];
    number.setAttribute('aria-label', `${meta.label} value`);
    number.setAttribute('aria-describedby', `desc-${key}`);

    const sync = (val, fromInput = false) => {
      const clamped = clampSettingValue(key, val);
      range.value = clamped;
      number.value = clamped;
      if (fromInput) {
        crosshairState[key] = clamped;
        refresh({ skipCommands: true });
        schedulePersist();
        updateCommands();
        return;
      }
      setState(key, clamped);
    };

    range.addEventListener('input', () => sync(range.value));
    number.addEventListener('input', () => sync(number.value, true));
    number.addEventListener('change', () => sync(number.value));

    wrap.append(range, number);
    return wrap;
  }

  function createToggleControl(key, meta) {
    const label = document.createElement('label');
    label.className = 'toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `input-${key}`;
    input.checked = crosshairState[key] === 1;
    input.setAttribute('aria-label', meta?.label ?? CROSSHAIR_SETTINGS[key].label);
    input.setAttribute('aria-describedby', `desc-${key}`);

    input.addEventListener('change', () => setState(key, input.checked ? 1 : 0));

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

    const selected = crosshairState.cl_crosshaircolor;
    wrap.querySelectorAll('[data-color-value]').forEach((btn) => {
      const value = Number(btn.dataset.colorValue);
      const isActive = value === selected;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

      if (value === 5) {
        btn.querySelector('.color-swatch-dot')?.style.setProperty(
          'background',
          getCrosshairSwatchColor(crosshairState),
        );
      }
    });
  }

  function createColorPresetControl(key, meta) {
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
      const isActive = opt.value === crosshairState[key];
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');

      const swatchColor = opt.value === 5
        ? getCrosshairSwatchColor(crosshairState)
        : presetColorToCss(opt.value);
      btn.append(createColorSwatchDot(swatchColor), document.createTextNode(opt.label));
      btn.addEventListener('click', () => setState(key, opt.value));
      wrap.append(btn);
    }

    return wrap;
  }

  function createSelectControl(key, meta) {
    const select = document.createElement('select');
    select.id = `input-${key}`;
    select.setAttribute('aria-describedby', `desc-${key}`);

    for (const opt of meta.options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === crosshairState[key]) option.selected = true;
      select.append(option);
    }

    select.addEventListener('change', () => setState(key, Number(select.value)));
    return select;
  }

  function resetSetting(key) {
    crosshairState[key] = CROSSHAIR_SETTINGS[key].default;
    syncControlsFromState();
    refresh();
    showToast(`${CROSSHAIR_SETTINGS[key].label} reset`);
  }

  function createResetButton(key) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'setting-reset-btn';
    btn.dataset.resetFor = key;
    btn.title = 'Reset to default';
    btn.setAttribute('aria-label', `Reset ${CROSSHAIR_SETTINGS[key].label} to default`);
    btn.textContent = '↺';
    btn.addEventListener('click', () => resetSetting(key));
    return btn;
  }

  function createSettingRow(key) {
    const meta = CROSSHAIR_SETTINGS[key];
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
      badge.title = 'This setting is exported to console but not fully simulated in preview';
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
      control = createRangeControl(key, meta);
    } else if (meta.type === 'toggle') {
      control = createToggleControl(key, meta);
    } else if (meta.type === 'select') {
      control = key === 'cl_crosshaircolor'
        ? createColorPresetControl(key, meta)
        : createSelectControl(key, meta);
    }

    row.append(labelWrap, wrapSettingControl(key, control));
    return row;
  }

  function wrapSettingControl(key, control) {
    const wrap = document.createElement('div');
    wrap.className = 'setting-control-wrap';
    wrap.append(control, createResetButton(key));
    return wrap;
  }

  function applyPreset(preset) {
    crosshairState = { ...preset.state };
    syncControlsFromState();
    refresh();
    showToast(`Loaded ${preset.label}`);
  }

  function createPresetMiniCanvas(state) {
    const canvas = document.createElement('canvas');
    canvas.className = 'preset-mini-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    CrosshairRenderer.renderMini(canvas, state, 36);
    return canvas;
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

      const isActive = presetState ? crosshairStatesMatch(crosshairState, presetState) : false;
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

    const nextPresets = CustomPresets.upsertPreset(customPresets, label, crosshairState);

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

  function buildSettingsUI() {
    for (const group of CROSSHAIR_GROUPS) {
      const section = document.createElement('details');
      section.className = 'settings-group';
      section.open = group.id === 'shape' || group.id === 'color';

      const summary = document.createElement('summary');
      const summaryLabel = document.createElement('span');
      summaryLabel.className = 'summary-label';
      summaryLabel.textContent = group.label;
      summary.append(summaryLabel);

      const headerToggleKey = group.headerToggle;
      if (headerToggleKey) {
        const toggle = createToggleControl(headerToggleKey, CROSSHAIR_SETTINGS[headerToggleKey]);
        toggle.classList.add('summary-toggle');
        toggle.addEventListener('click', (e) => e.stopPropagation());
        toggle.addEventListener('mousedown', (e) => e.stopPropagation());
        const resetBtn = createResetButton(headerToggleKey);
        resetBtn.classList.add('summary-reset-btn');
        resetBtn.addEventListener('click', (e) => e.stopPropagation());
        resetBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        summary.append(toggle, resetBtn);
      }

      section.append(summary);

      const body = document.createElement('div');
      body.className = 'settings-group-body';

      for (const key of group.settings) {
        if (key === headerToggleKey) continue;
        body.append(createSettingRow(key));
      }

      section.append(body);
      els.settingsContainer.append(section);
    }
  }

  function applyCrosshairState(state) {
    for (const key of CROSSHAIR_CVAR_ORDER) {
      if (key in state) {
        crosshairState[key] = clampSettingValue(key, state[key]);
      }
    }
  }

  function loadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get(URL_PARAM);
    if (!encoded) return false;

    const parsed = CrosshairCommands.fromUrlParam(encoded);
    if (!parsed) return false;

    applyCrosshairState(parsed.crosshair);

    if (parsed.previewBackground) {
      previewBackground = parsed.previewBackground;
    }

    if (parsed.previewMode) {
      previewMode = parsed.previewMode;
    }

    return true;
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;

      const parsed = JSON.parse(raw);
      let loaded = false;

      if (parsed?.crosshair && typeof parsed.crosshair === 'object') {
        applyCrosshairState(parsed.crosshair);
        loaded = true;
      } else if (parsed && typeof parsed === 'object' && 'cl_crosshairstyle' in parsed) {
        applyCrosshairState(parsed);
        loaded = true;
      }

      if (parsed?.previewBackground && Backgrounds.isValidId(parsed.previewBackground)) {
        previewBackground = parsed.previewBackground;
        loaded = true;
      }

      if (parsed?.previewZoom != null) {
        previewZoom = PreviewZoom.clamp(parsed.previewZoom);
        loaded = true;
      }

      if (PreviewMode.isValidMode(parsed?.previewMode)) {
        previewMode = parsed.previewMode;
        loaded = true;
      }

      if (parsed?.customPresets) {
        customPresets = CustomPresets.parseList(parsed.customPresets);
        loaded = true;
      }

      if (parsed?.theme === 'system' || parsed?.theme === 'light' || parsed?.theme === 'dark') {
        colorTheme = parsed.theme;
        loaded = true;
      }

      return loaded;
    } catch {
      return false;
    }
  }

  function persistState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        crosshair: crosshairState,
        previewBackground,
        previewZoom,
        previewMode,
        customPresets,
        theme: colorTheme,
      }));
      const url = new URL(window.location.href);
      url.searchParams.set(URL_PARAM, CrosshairCommands.toUrlParam(crosshairState, {
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
    for (const key of CROSSHAIR_CVAR_ORDER) {
      const input = document.getElementById(`input-${key}`);
      if (!input) continue;

      const meta = CROSSHAIR_SETTINGS[key];
      const val = crosshairState[key];

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
    suppressPersist = false;
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
    if (!window.confirm('Reset all crosshair settings, preview, and theme to defaults?')) return;

    crosshairState = createDefaultCrosshairState();
    previewBackground = Backgrounds.DEFAULT_ID;
    previewZoom = PreviewZoom.DEFAULT;
    previewMode = PreviewMode.DEFAULT_MODE;
    colorTheme = 'system';
    syncControlsFromState();
    setPreviewBackground(previewBackground);
    applyPreviewZoom();
    applyPreviewMode();
    setColorTheme(colorTheme);
    CrosshairRenderer.invalidateBgCache();
    refresh();
    showToast('Reset to defaults');
  }

  async function copyText(text, button, successLabel = 'Copied!') {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      els.commandOutput.value = text;
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
    const text = CrosshairCommands.toCommandString(crosshairState, { minimal });
    await copyText(text, minimal ? els.copyMinimalBtn : els.copyBtn);
  }

  function applyImportedCommands() {
    const { state, parsed, skipped } = CrosshairCommands.fromCommandString(els.commandOutput.value);

    if (parsed === 0) {
      showToast('No valid commands found');
      return;
    }

    applyCrosshairState(state);
    syncControlsFromState();
    refresh();
    const suffix = skipped > 0 ? ` (${skipped} skipped)` : '';
    showToast(`Applied ${parsed} setting(s)${suffix}`);
  }

  async function shareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, CrosshairCommands.toUrlParam(crosshairState, {
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
    els.canvasWrap?.style.setProperty('--preview-zoom', String(previewZoom));
    if (els.zoomLabel) {
      els.zoomLabel.textContent = `${Math.round(previewZoom * 100)}%`;
    }
    if (els.zoomInBtn) els.zoomInBtn.disabled = !PreviewZoom.canZoomIn(previewZoom);
    if (els.zoomOutBtn) els.zoomOutBtn.disabled = !PreviewZoom.canZoomOut(previewZoom);
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
    if (mode === PreviewMode.MODES.LINEUP && !PreviewMode.isLineupEnabled(crosshairState)) return;

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
    const size = CrosshairRenderer.PREVIEW_SIZE;
    els.previewCanvas.width = size;
    els.previewCanvas.height = size;
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
    initThemeToggle();
    initPreviewZoom();
    initPreviewMode();
    initCustomPresets();
    initKeyboardShortcuts();
    buildPresetsUI();
    buildSettingsUI();
    buildBackgroundToggles();

    els.copyBtn.addEventListener('click', () => copyCommands(false));
    els.copyMinimalBtn?.addEventListener('click', () => copyCommands(true));
    els.applyImportBtn?.addEventListener('click', applyImportedCommands);
    els.resetBtn.addEventListener('click', resetToDefaults);
    els.shareBtn.addEventListener('click', shareLink);

    syncControlsFromState();
    applyPreviewZoom();
    applyPreviewMode();
    setTogglePressed(els.bgToggleRoot, '[data-bg]', previewBackground, 'data-bg');

    refresh();
    CrosshairRenderer.preloadImages(updatePreview);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
