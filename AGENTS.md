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

## Releases & changelog

This project uses [Keep a Changelog](https://keepachangelog.com/) + [SemVer](https://semver.org/). Version tags are `vX.Y.Z`. There is **no GitHub Actions** release workflow.

### While developing

- Prefer [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`; breaking with `!`) so `git cliff` stays useful for drafts.
- For any **user-facing** change, add a bullet under the matching subsection of `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) in the same change set (along with README updates when needed).
- Optional draft from commits: `git cliff --unreleased`
- Optional SemVer hint from conventional commits: `git cliff --bumped-version` or `./scripts/release.sh --suggest`

### Cutting a release (only when the user asks)

Working tree must be clean. `[Unreleased]` must contain at least one bullet.

```bash
./scripts/release.sh
# Version [0.1.1]:    # Enter = patch bump from latest tag (or 0.1.0 if none)
# Or skip the prompt: VERSION=0.2.0 ./scripts/release.sh
# Preview only:       ./scripts/release.sh --dry-run
```

The script rotates `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD`, restores empty Unreleased stubs, commits `chore(release): vX.Y.Z`, and creates an annotated tag `vX.Y.Z`. It does **not** push.

```bash
git push origin HEAD
git push origin vX.Y.Z   # only if the user asks to push tags
```

Do not rewrite published version sections; put follow-ups under `[Unreleased]` or cut a new patch release.

## Architecture

| Area | Role |
|------|------|
| `js/icons.js` | Shared SVG icons for site nav and section tabs |
| `js/settings-module.js` | Factory for declarative cvar sections (`createSettingsModule`) |
| `js/crosshair-settings.js` | Crosshair schema + UI helpers; defines `CrosshairSection` |
| `js/sections/*.js` | Other sections (`ViewmodelSection`, `HudSection`, …) |
| `js/sections/index.js` | `ConfigSections` registry — order and lookup |
| `js/commands.js` | Serialize/import console commands and `.cfg` text |
| `js/commands-page.js` | Commands reference UI (search/sort/paginate) |
| `data/cs2-commands.json` | Generated full cvar/command catalog |
| `scripts/refresh-cs2-commands.py` | Merge Nihilnia + ArminC (or local) dumps into the command catalog |
| `scripts/release.sh` | Rotate CHANGELOG, commit, annotated SemVer tag (no push) |
| `CHANGELOG.md` | Keep a Changelog (`[Unreleased]` + released sections) |
| `cliff.toml` | git-cliff config for draft notes / bump suggestions |
| `js/*-renderer.js` | Canvas previews (crosshair, viewmodel, radar) |
| `js/app.js` | UI, state, persistence (`localStorage`), share URLs |
| `js/presets.js` / `custom-presets.js` | Pro + user crosshair presets |

**Script load order in `index.html` is load-bearing.** New scripts must be inserted so dependencies exist before consumers (`icons.js` → `settings-module` → section files → `sections/index.js` → helpers/renderers → `commands.js` → `app.js`). `commands.html` loads `js/icons.js` then `js/commands-page.js`.

## Adding or changing settings

Prefer `createSettingsModule({ id, label, fileName, icon, groups, settings })`:

1. Define `groups` (UI group order) and `settings` metadata (`type`: `range` | `toggle` | `select`, plus `default`, `min`/`max`/`step`, `options`, optional `enabledWhen`). Optional `icon` defaults to `id` and must match a key in `Icons.PATHS`.
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
- **Update `CHANGELOG.md` `[Unreleased]`** for user-facing changes; cut releases only with `./scripts/release.sh` when the user asks.

**Don’t**

- Add a bundler, framework, or npm toolchain unless explicitly requested.
- Convert to ES modules without updating every script tag and load order.
- Commit or invent secrets; this app has no backend.
- Put large binary assets in chat; edit or add files under `assets/` instead.
- Add GitHub Actions (or other CI) release workflows for changelog/versioning.
- Push release tags unless the user explicitly asks.
