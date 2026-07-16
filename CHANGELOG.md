# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `mp_shoot_dropped_grenades` in the Commands catalog (curated override; shoot dropped grenades to activate them, needs `sv_cheats 1`)
- Icons on site nav links and config section tabs
- Larger preview column and click-to-expand live preview modal (crosshair, viewmodel, radar)
- GitHub repository link in the site header nav
- Lightweight syntax highlighting in the config export editor (numbers and quoted strings)
- Bind key picker (keyboard icon) with categorized CS2 keys, mouse buttons, and press-to-capture
- Commands reference page (`commands.html`) with searchable/sortable CS2 console command and cvar catalog
- Prefix-based category filters on the Commands page (Crosshair, HUD, Radar, etc.)
- ConVar flag legend and tooltips explaining engine metadata under each command name
- `sv_cheats` badge on Commands that require cheats enabled
- Client / server badges on Commands derived from `cl` / `sv` flags
- Script to refresh the command catalog (`scripts/refresh-cs2-commands.py`)

### Changed

- Commands catalog merges ArminC (broad/hidden) + Nihilnia (fresher public) dumps by default
- Bind export and editor previews label each bind with a `//` comment and separate blocks with a blank line
- Wider config export column; long cvar lines scroll horizontally instead of wrapping
- Wider inline preview column for crosshair / viewmodel / radar canvases

### Fixed

- Viewmodel (and radar) preview no longer grows scrollbars / resizes in a loop; canvases fill the wrap at device-pixel resolution so the preview stays sharp
- Crosshair Gap slider updates the preview for classic static style 4 (and other styles that use `cl_crosshairgap`)
- Strip markdown backslashes and HTML entities from command descriptions in the catalog

### Removed
