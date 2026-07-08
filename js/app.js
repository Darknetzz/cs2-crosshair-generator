/**
 * Main application — UI generation, state management, persistence, and preview updates.
 */
(() => {
  const STORAGE_KEY = 'cs2-crosshair-state';
  const URL_PARAM = 's';

  let crosshairState = createDefaultCrosshairState();
  let previewBackground = 'dark';
  let colorTheme = 'system';
  let suppressPersist = false;

  const els = {
    settingsContainer: document.getElementById('settings-container'),
    previewCanvas: document.getElementById('preview-canvas'),
    commandOutput: document.getElementById('command-output'),
    copyBtn: document.getElementById('copy-btn'),
    resetBtn: document.getElementById('reset-btn'),
    shareBtn: document.getElementById('share-btn'),
    toast: document.getElementById('toast'),
    colorSwatch: document.getElementById('color-swatch'),
    styleNote: document.getElementById('style-note'),
    bgToggleRoot: document.getElementById('bg-toggle-root'),
    presetsGrid: document.getElementById('presets-grid'),
    themeToggle: document.getElementById('theme-toggle'),
  };

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => els.toast.classList.remove('visible'), 2000);
  }

  function updateStyleNote() {
    const isDynamic = CrosshairRenderer.isDynamicStyle(crosshairState.cl_crosshairstyle);
    els.styleNote.hidden = !isDynamic;
  }

  function updateColorSwatch() {
    const color = CrosshairRenderer.resolveColor(crosshairState);
    els.colorSwatch.style.background = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
  }

  function updatePreview() {
    updateColorSwatch();
    updateStyleNote();
    managePreviewAnimation();
  }

  function managePreviewAnimation() {
    if (CrosshairRenderer.isDynamicStyle(crosshairState.cl_crosshairstyle)) {
      CrosshairRenderer.startAnimation(
        els.previewCanvas,
        () => crosshairState,
        () => previewBackground,
      );
      return;
    }

    CrosshairRenderer.stopAnimation();
    CrosshairRenderer.render(els.previewCanvas, crosshairState, previewBackground);
  }

  function updateCommands() {
    els.commandOutput.value = CrosshairCommands.toMultilineString(crosshairState);
  }

  function refresh() {
    updatePreview();
    updateCommands();
    updateControlStates();
    updateColorPresetButtons();
    if (!suppressPersist) persistState();
  }

  function setState(key, rawValue) {
    crosshairState[key] = clampSettingValue(key, rawValue);
    refresh();
  }

  function updateControlStates() {
    for (const key of CROSSHAIR_CVAR_ORDER) {
      const row = document.querySelector(`[data-setting="${key}"]`);
      if (!row) continue;
      const enabled = isSettingEnabled(key, crosshairState);
      row.classList.toggle('disabled', !enabled);
      row.querySelectorAll('input, select').forEach((input) => {
        input.disabled = !enabled;
      });
    }
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

    const number = document.createElement('input');
    number.type = 'number';
    number.className = 'number-input';
    number.min = meta.min;
    number.max = meta.max;
    number.step = meta.step;
    number.value = crosshairState[key];
    number.setAttribute('aria-label', `${meta.label} value`);

    const sync = (val) => {
      const clamped = clampSettingValue(key, val);
      range.value = clamped;
      number.value = clamped;
      setState(key, clamped);
    };

    range.addEventListener('input', () => sync(range.value));
    number.addEventListener('change', () => sync(number.value));

    wrap.append(range, number);
    return wrap;
  }

  function createToggleControl(key) {
    const label = document.createElement('label');
    label.className = 'toggle';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `input-${key}`;
    input.checked = crosshairState[key] === 1;

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
      btn.classList.toggle('active', value === selected);

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
      btn.classList.toggle('active', opt.value === crosshairState[key]);

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

    const desc = document.createElement('span');
    desc.className = 'setting-desc';
    desc.textContent = meta.description;
    desc.title = meta.description;

    labelWrap.append(label, desc);

    let control;
    if (meta.type === 'range') {
      control = createRangeControl(key, meta);
    } else if (meta.type === 'toggle') {
      control = createToggleControl(key);
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

  function buildPresetsUI() {
    els.presetsGrid.replaceChildren();

    for (const preset of CrosshairPresets.PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', `Load ${preset.label} crosshair`);

      const name = document.createElement('span');
      name.className = 'preset-name';
      name.textContent = preset.label;

      const team = document.createElement('span');
      team.className = 'preset-team';
      team.textContent = preset.team;

      btn.append(name, team);
      btn.addEventListener('click', () => applyPreset(preset));
      els.presetsGrid.append(btn);
    }
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
        const toggle = createToggleControl(headerToggleKey);
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

    applyCrosshairState(parsed);
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
        theme: colorTheme,
      }));
      const url = new URL(window.location.href);
      url.searchParams.set(URL_PARAM, CrosshairCommands.toUrlParam(crosshairState));
      window.history.replaceState(null, '', url.toString());
    } catch {
      // storage or history may be unavailable
    }
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
    els.themeToggle?.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    if (!suppressPersist) persistState();
  }

  function initThemeToggle() {
    els.themeToggle?.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === colorTheme);
      btn.addEventListener('click', () => setColorTheme(btn.dataset.theme));
    });
    applyColorTheme(colorTheme);
  }

  function resetToDefaults() {
    crosshairState = createDefaultCrosshairState();
    previewBackground = Backgrounds.DEFAULT_ID;
    colorTheme = 'system';
    syncControlsFromState();
    els.bgToggleRoot.querySelectorAll('[data-bg]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bg === previewBackground);
    });
    setColorTheme(colorTheme);
    refresh();
    showToast('Reset to defaults');
  }

  async function copyCommands() {
    const text = CrosshairCommands.toCommandString(crosshairState);
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied!');
    } catch {
      els.commandOutput.select();
      document.execCommand('copy');
      showToast('Copied!');
    }
  }

  async function shareLink() {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, CrosshairCommands.toUrlParam(crosshairState));
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
    els.bgToggleRoot.querySelectorAll('[data-bg]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.bg === id);
    });
    updatePreview();
    if (!suppressPersist) persistState();
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
        btn.className = `bg-btn${group.id === 'maps' ? ' bg-btn-map' : ''}`;
        btn.dataset.bg = item.id;
        btn.textContent = item.label;
        btn.classList.toggle('active', item.id === previewBackground);
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

  function init() {
    loadFromStorage();
    loadFromUrl();

    initPreviewCanvas();
    initThemeToggle();
    buildPresetsUI();
    buildSettingsUI();
    buildBackgroundToggles();

    els.copyBtn.addEventListener('click', copyCommands);
    els.resetBtn.addEventListener('click', resetToDefaults);
    els.shareBtn.addEventListener('click', shareLink);

    refresh();
    CrosshairRenderer.preloadImages(updatePreview);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
