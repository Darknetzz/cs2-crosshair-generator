/**
 * CS2 commands reference browser (search / sort / paginate / category).
 */
(() => {
  const STORAGE_KEY = 'cs2-config-state';
  const LEGACY_STORAGE_KEY = 'cs2-crosshair-state';
  const DATA_URL = 'data/cs2-commands.json';
  const PAGE_SIZE = 100;
  const SEARCH_DEBOUNCE_MS = 150;
  const SORT_KEYS = ['name', 'default', 'accepted', 'description'];
  const FLAGS_TITLE = 'ConVar flags (engine metadata)';

  /** @type {{ name: string, flags: string[], default: string, description: string, accepted: string, kind: string, category?: string }[]} */
  let allCommands = [];
  /** @type {{ name: string, flags: string[], default: string, description: string, accepted: string, kind: string, category?: string }[]} */
  let filtered = [];
  let sortKey = 'name';
  let sortDir = 'asc';
  let page = 1;
  let colorTheme = 'system';
  let searchTimer = 0;
  let sourceNote = '';
  let selectedCategory = '';

  const els = {
    search: document.getElementById('commands-search'),
    category: document.getElementById('commands-category'),
    meta: document.getElementById('commands-meta'),
    error: document.getElementById('commands-error'),
    tbody: document.getElementById('commands-tbody'),
    pagination: document.getElementById('commands-pagination'),
    prev: document.getElementById('commands-prev'),
    next: document.getElementById('commands-next'),
    pageLabel: document.getElementById('commands-page-label'),
    themeToggle: document.getElementById('theme-toggle'),
    sortButtons: Array.from(document.querySelectorAll('.sort-btn')),
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function displayValue(value) {
    if (value == null || value === '') return '—';
    return String(value);
  }

  function compareCommands(a, b) {
    const av = displayValue(a[sortKey]).toLowerCase();
    const bv = displayValue(b[sortKey]).toLowerCase();
    let cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp === 0 && sortKey !== 'name') {
      cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    }
    return sortDir === 'asc' ? cmp : -cmp;
  }

  function applyFilterAndSort() {
    const query = (els.search?.value || '').trim().toLowerCase();
    selectedCategory = els.category?.value || '';

    filtered = allCommands.filter((cmd) => {
      if (selectedCategory && cmd.category !== selectedCategory) return false;
      if (!query) return true;
      const haystack = [
        cmd.name,
        cmd.description,
        cmd.default,
        cmd.accepted,
        cmd.category,
        (cmd.flags || []).join(' '),
        cmd.kind,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });

    filtered.sort(compareCommands);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE) || 1);
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    render();
  }

  function populateCategories(categories) {
    if (!els.category) return;
    const current = els.category.value;
    const list = Array.isArray(categories) && categories.length
      ? categories
      : [...new Set(allCommands.map((c) => c.category).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b)
        );

    els.category.innerHTML = '<option value="">All categories</option>';
    list.forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      els.category.appendChild(opt);
    });
    if (current && list.includes(current)) {
      els.category.value = current;
    }
  }

  function updateSortButtons() {
    els.sortButtons.forEach((btn) => {
      const key = btn.dataset.sort;
      const th = btn.closest('th');
      if (!th) return;
      if (key === sortKey) {
        th.setAttribute('aria-sort', sortDir === 'asc' ? 'ascending' : 'descending');
      } else {
        th.setAttribute('aria-sort', 'none');
      }
    });
  }

  function metaLine() {
    const total = filtered.length;
    const start = (page - 1) * PAGE_SIZE;
    const rangeStart = total === 0 ? 0 : start + 1;
    const rangeEnd = Math.min(start + PAGE_SIZE, total);
    const showing =
      total === 0
        ? '0 commands'
        : `Showing ${rangeStart}–${rangeEnd} of ${total} commands`;
    return sourceNote ? `${showing} · ${sourceNote}` : showing;
  }

  function render() {
    updateSortButtons();
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
    const start = (page - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    if (!els.tbody) return;
    if (!slice.length) {
      els.tbody.innerHTML =
        '<tr><td colspan="4" class="commands-empty">No commands match your filters.</td></tr>';
    } else {
      els.tbody.innerHTML = slice
        .map((cmd) => {
          const flags = (cmd.flags || []).length
            ? `<span class="commands-flags" title="${escapeHtml(FLAGS_TITLE)}">${escapeHtml(cmd.flags.join(', '))}</span>`
            : '';
          const tags = [];
          if (cmd.category) {
            tags.push(
              `<span class="commands-category-tag">${escapeHtml(cmd.category)}</span>`
            );
          }
          if ((cmd.flags || []).includes('cheat')) {
            tags.push(
              '<span class="commands-cheat-tag" title="Requires sv_cheats 1">sv_cheats</span>'
            );
          }
          const tagRow = tags.length
            ? `<span class="commands-tags">${tags.join('')}</span>`
            : '';
          return `<tr>
            <td class="commands-col-name">
              <code>${escapeHtml(cmd.name)}</code>
              ${flags}
              ${tagRow}
            </td>
            <td class="commands-col-default"><code>${escapeHtml(displayValue(cmd.default))}</code></td>
            <td class="commands-col-accepted">${escapeHtml(displayValue(cmd.accepted))}</td>
            <td class="commands-col-desc">${escapeHtml(displayValue(cmd.description))}</td>
          </tr>`;
        })
        .join('');
    }

    if (els.meta) els.meta.textContent = metaLine();

    if (els.pagination) els.pagination.hidden = total <= PAGE_SIZE;
    if (els.pageLabel) els.pageLabel.textContent = `Page ${page} of ${totalPages}`;
    if (els.prev) els.prev.disabled = page <= 1;
    if (els.next) els.next.disabled = page >= totalPages;
  }

  function setSort(key) {
    if (!SORT_KEYS.includes(key)) return;
    if (sortKey === key) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDir = 'asc';
    }
    page = 1;
    applyFilterAndSort();
  }

  function readStoredTheme() {
    try {
      for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed?.theme === 'system' || parsed?.theme === 'light' || parsed?.theme === 'dark') {
          return parsed.theme;
        }
      }
    } catch {
      // ignore
    }
    return 'system';
  }

  function persistTheme(theme) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = parsed && typeof parsed === 'object' ? { ...parsed, theme } : { theme };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota / private mode
    }
  }

  function applyColorTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function setTogglePressed(theme) {
    els.themeToggle?.querySelectorAll('.theme-btn').forEach((btn) => {
      const active = btn.dataset.theme === theme;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('active', active);
    });
  }

  function setColorTheme(theme) {
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') return;
    colorTheme = theme;
    applyColorTheme(theme);
    setTogglePressed(theme);
    persistTheme(theme);
  }

  function initTheme() {
    colorTheme = readStoredTheme();
    applyColorTheme(colorTheme);
    setTogglePressed(colorTheme);
    els.themeToggle?.querySelectorAll('[data-theme]').forEach((btn) => {
      btn.addEventListener('click', () => setColorTheme(btn.dataset.theme));
    });
  }

  function showError(message) {
    if (!els.error) return;
    els.error.hidden = false;
    els.error.textContent = message;
    if (els.meta) els.meta.textContent = 'Failed to load commands';
  }

  async function loadData() {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      allCommands = Array.isArray(data.commands) ? data.commands : [];
      const meta = data.meta || {};
      if (meta.fetchedAt) {
        const date = String(meta.fetchedAt).slice(0, 10);
        sourceNote = `Updated ${date} · ${meta.count ?? allCommands.length} total`;
      }
      populateCategories(meta.categories);
      applyFilterAndSort();
    } catch (err) {
      const viaFile = location.protocol === 'file:';
      showError(
        viaFile
          ? 'Could not load command data over file://. Open this page over HTTP (e.g. your Apache site or python3 -m http.server).'
          : `Could not load ${DATA_URL}. ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  function bindUi() {
    els.search?.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        page = 1;
        applyFilterAndSort();
      }, SEARCH_DEBOUNCE_MS);
    });

    els.category?.addEventListener('change', () => {
      page = 1;
      applyFilterAndSort();
    });

    els.sortButtons.forEach((btn) => {
      btn.addEventListener('click', () => setSort(btn.dataset.sort));
    });

    els.prev?.addEventListener('click', () => {
      if (page <= 1) return;
      page -= 1;
      render();
    });

    els.next?.addEventListener('click', () => {
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE) || 1);
      if (page >= totalPages) return;
      page += 1;
      render();
    });
  }

  initTheme();
  bindUi();
  loadData();
})();
