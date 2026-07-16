# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Commands reference page (`commands.html`) with searchable/sortable CS2 console command and cvar catalog
- Prefix-based category filters on the Commands page (Crosshair, HUD, Radar, etc.)
- ConVar flag legend and tooltips explaining engine metadata under each command name
- `sv_cheats` badge on Commands that require cheats enabled
- Script to refresh the command catalog from the ArminC CS2 cvar dump (`scripts/refresh-cs2-commands.py`)

### Changed

### Fixed

- Strip markdown backslashes and HTML entities from command descriptions in the catalog

### Removed
