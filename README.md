# Explorer Folder Filter

Explorer Folder Filter temporarily focuses the native VS Code Explorer on folders whose names match a query.

It is useful in large workspaces where the folder tree is too broad to scan quickly.

## Commands

| Command |
| --- |
| `Focus Folder: Filter` |
| `Focus Folder: Clear Filter` |
| `Focus Folder: Toggle Filter` |

`Focus on This Folder` is available from the Explorer context menu only.

No default keybindings are contributed. Assign your own shortcuts from VS Code's Keyboard Shortcuts editor if you want keyboard access.

## Usage

Use the filter icon in the Explorer title bar to focus the Explorer on matching folders. When no filter is active, the icon is an outline filter and clicking it opens the folder-name prompt. When a filter is active, the icon is a filled filter and clicking it clears the filter and restores the previous workspace-folder `files.exclude` setting.

Right-click one or more folders in the Explorer and select `Focus on This Folder` to focus the Explorer on exactly those folders without typing a query.

You can also run `Focus Folder: Filter` from the Command Palette to open the same prompt, or run `Focus Folder: Clear Filter` to clear the active filter. While a filter is active, the status bar item shows the current query or focused folders and provides another clear action.

The folder search runs in the background with a progress notification. Select `Cancel` on the notification to stop a long search without changing the Explorer.

## Behavior

When you run `Focus Folder: Filter`, the extension asks for a folder-name query, finds matching folders anywhere under the first workspace folder, and updates workspace-folder `files.exclude` so matching folders and their parent folders stay visible while unrelated sibling folders are hidden.

Existing `files.exclude` entries are preserved while the filter is active. Running `Focus Folder: Clear Filter` restores the exact original `files.exclude` map saved when the filter was first applied.

In multi-root workspaces, Explorer Folder Filter currently operates on the first workspace folder.

Explorer Folder Filter requires VS Code 1.74 or later. It works in Restricted Mode. It is disabled in virtual workspaces because it reads folders directly from the file system.

## Notes

- Matching is case-insensitive substring matching against folder names.
- Matching folders keep their full contents visible.
- The status bar item provides a persistent clear action while a filter is active.
- The extension intentionally uses VS Code's native Explorer and `files.exclude` behavior instead of rendering a custom tree view.
