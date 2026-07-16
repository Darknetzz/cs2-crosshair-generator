# AGENTS.md

Agent guidance for the CS2 Config Generator — a static vanilla JS web app (no build step, no npm, no tests).

## Project overview

Users build Counter-Strike 2 configs (crosshair, viewmodel, HUD, radar, FPS, binds), preview live canvases, then copy console commands or download `.cfg` files. A separate `commands.html` page browses the full CS2 cvar/command dump.

Stack: plain `index.html` / `commands.html`, `css/style.css`, and classic `<script>` globals (no ES modules, no bundler).

## Run locally

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` (or your Apache/nginx URL). Opening `index.html` via `file://` also works for most generator features; **`commands.html` requires HTTP** (any static host) because it fetches `data/cs2-commands.json`.

Refresh the command catalog after CS2 patches:

```bash
python3 scripts/refresh-cs2-commands.py
```

There is no lint, format, or test command. Verify changes in the browser.

## Architecture

| Area | Role |
|------|------|
| `js/settings-module.js` | Factory for declarative cvar sections (`createSettingsModule`) |
| `js/crosshair-settings.js` | Crosshair schema + UI helpers; defines `CrosshairSection` |
| `js/sections/*.js` | Other sections (`ViewmodelSection`, `HudSection`, …) |
| `js/sections/index.js` | `ConfigSections` registry — order and lookup |
| `js/commands.js` | Serialize/import console commands and `.cfg` text |
| `js/commands-page.js` | Commands reference UI (search/sort/paginate) |
| `data/cs2-commands.json` | Generated full cvar/command catalog |
| `scripts/refresh-cs2-commands.py` | Rebuild catalog from ArminC dump + section enrichments |
| `js/*-renderer.js` | Canvas previews (crosshair, viewmodel, radar) |
| `js/app.js` | UI, state, persistence (`localStorage`), share URLs |
| `js/presets.js` / `custom-presets.js` | Pro + user crosshair presets |

**Script load order in `index.html` is load-bearing.** New scripts must be inserted so dependencies exist before consumers (`settings-module` → section files → `sections/index.js` → helpers/renderers → `commands.js` → `app.js`). `commands.html` only loads `js/commands-page.js`.

## Adding or changing settings

Prefer `createSettingsModule({ id, label, fileName, groups, settings })`:

1. Define `groups` (UI group order) and `settings` metadata (`type`: `range` | `toggle` | `select`, plus `default`, `min`/`max`/`step`, `options`, optional `enabledWhen`).
2. Register the section in `js/sections/index.js` `ALL` (and add a `<script>` tag if the file is new).
3. Export/import flows through `ConfigCommands` automatically for standard sections.

Special cases:

- **Crosshair** — schema lives in `crosshair-settings.js`; keep canvas helpers and color swatches in sync with cvars.
- **Binds** — `kind: 'binds'`; custom `toCommandLines` / state shape in `js/sections/binds.js`, not the normal cvar path.
- **Import** — unknown cvars are ignored; routing uses `ConfigSections.findSectionForCvar`.

Cvar names and value ranges should match real CS2 console commands.

## Conventions

- Keep code DRY: extend existing section/renderer/command helpers before inventing parallel patterns.
- Match existing style: IIFE or `const Name = (() => { … })()` globals, 2-space indent, concise JSDoc on public helpers.
- Persist keys: `cs2-config-state` (legacy: `cs2-crosshair-state`). Don’t break share-link (`?s=`) or storage shape without migration.
- Themes: `system` | `dark` | `light` via `document.documentElement.dataset.theme`.
- UI copy and labels in English; keep accessibility attributes (`aria-*`, skip link, live regions) intact.
- Assets: prefer WebP under `assets/`; map backgrounds are third-party (see README).

## Do / don’t

**Do**

- Reuse `createSettingsModule` for new cvar panels.
- Update both UI metadata and command serialization when changing a setting.
- Manually check section tabs, preview, copy/download, import, and share after UI/state changes.
- **Keep `README.md` up to date** whenever you change user-facing features, usage, project structure, scripts, or assets. Update it in the same change set — do not leave docs stale.

**Don’t**

- Add a bundler, framework, or npm toolchain unless explicitly requested.
- Convert to ES modules without updating every script tag and load order.
- Commit or invent secrets; this app has no backend.
- Put large binary assets in chat; edit or add files under `assets/` instead.
