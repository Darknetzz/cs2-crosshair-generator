# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Larger preview column and click-to-expand live preview modal (crosshair, viewmodel, radar)
- GitHub repository link in the site header nav
- Lightweight syntax highlighting in the config export editor (numbers and quoted strings)
- Commands reference page (`commands.html`) with searchable/sortable CS2 console command and cvar catalog
- Prefix-based category filters on the Commands page (Crosshair, HUD, Radar, etc.)
- ConVar flag legend and tooltips explaining engine metadata under each command name
- `sv_cheats` badge on Commands that require cheats enabled
- Script to refresh the command catalog from the ArminC CS2 cvar dump (`scripts/refresh-cs2-commands.py`)

### Changed

- Bind export and editor previews label each bind with a `//` comment and separate blocks with a blank line
- Wider config export column; long cvar lines scroll horizontally instead of wrapping
- Wider inline preview column for crosshair / viewmodel / radar canvases

### Fixed

- Crosshair Gap slider updates the preview for classic static style 4 (and other styles that use `cl_crosshairgap`)
- Strip markdown backslashes and HTML entities from command descriptions in the catalog

### Removed
