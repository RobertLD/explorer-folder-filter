# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-08-20

### Added

- Named filter presets: save the current query as a preset from the filter prompt, apply it later from the same prompt, and delete it when no longer needed.
- Presets are listed above recent queries when the prompt opens with an empty input.

## [0.2.1] - 2026-08-19

### Fixed

- The status bar filter indicator no longer disappears after reloading the window with an active filter. The active query is now persisted and restored on activation, so the "clear filter" control stays visible.

## [0.2.0] - 2026-08-14

### Added

- Live preview in the filter prompt: matching folders are listed as you type, with a match count.
- Recent-query history, offered when the filter prompt is opened with an empty input.
- Selecting a previewed folder reuses its name as the query.
- Bounded preview search (`findMatchingDirsLimited`) with match limit, visited-directory budget and cooperative cancellation.

### Changed

- Replaced the blind input box with a QuickPick, so an empty result set is visible before applying the filter.
- The workspace folder is now resolved before prompting, so the preview always describes the tree the filter will act on.

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
