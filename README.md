# Explorer Folder Filter

Explorer Folder Filter temporarily focuses the native VS Code Explorer on folders whose names match a query.

It is useful in large workspaces where the folder tree is too broad to scan quickly.

## Commands

| Command |
| --- |
| `Focus Folder: Filter` |
| `Focus Folder: Clear Filter` |

No default keybindings are contributed. Assign your own shortcuts from VS Code's Keyboard Shortcuts editor if you want keyboard access.

## Behavior

When you run `Focus Folder: Filter`, the extension asks for a folder-name query, finds matching folders anywhere under the first workspace folder, and updates workspace-folder `files.exclude` so matching folders and their parent folders stay visible while unrelated sibling folders are hidden.

Existing `files.exclude` entries are preserved while the filter is active. Running `Focus Folder: Clear Filter` restores the exact original `files.exclude` map saved when the filter was first applied.

In multi-root workspaces, Explorer Folder Filter currently operates on the first workspace folder.

## Notes

- Matching is case-insensitive substring matching against folder names.
- Matching folders keep their full contents visible.
- The status bar item provides a persistent clear action while a filter is active.
- The extension intentionally uses VS Code's native Explorer and `files.exclude` behavior instead of rendering a custom tree view.
