# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-19

### Added

- Explorer title-bar filter button that opens the existing folder-name prompt when inactive.
- Toggle behavior for the Explorer title-bar button
- README documentation for the Explorer title-bar button and toggle behavior.

### Changed

- Shared the filter prompt, apply, clear, status bar, and active context update paths across commands.

### Fixed
- Restored absent workspace-folder `files.exclude` settings exactly when clearing an active filter.

## [0.0.3] - 2026-05-18

### Added

- Initial package release
- Command Palette actions for filtering and clearing the Explorer folder filter.
- Status bar clear affordance while a folder filter is active.

### Changed

- Removed default keybindings so users can assign their own shortcuts from VS Code.

[unreleased]: https://github.com/RobertLD/explorer-folder-filter/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/RobertLD/explorer-folder-filter/releases/tag/v0.0.3
