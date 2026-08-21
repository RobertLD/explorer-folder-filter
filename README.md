# Explorer Folder Filter

Explorer Folder Filter temporarily focuses the native VS Code Explorer on folders whose names match a query.

It is useful in large workspaces where the folder tree is too broad to scan quickly.

## Commands

| Command |
| --- |
| `Focus Folder: Filter` |
| `Focus Folder: Clear Filter` |
| `Focus Folder: Toggle Filter` |

No default keybindings are contributed. Assign your own shortcuts from VS Code's Keyboard Shortcuts editor if you want keyboard access.

## Usage

Use the filter icon in the Explorer title bar to focus the Explorer on matching folders. When no filter is active, clicking the icon opens the folder-name prompt. When a filter is active, clicking it clears the filter and restores the previous workspace-folder `files.exclude` setting.

You can also run `Focus Folder: Filter` from the Command Palette to open the same prompt, or run `Focus Folder: Clear Filter` to clear the active filter. While a filter is active, the status bar item shows the current query and provides another clear action.

### Filter prompt

The prompt previews matching folders while you type:

- The first row applies whatever you typed and shows how many folders match, so an empty result set is visible before you commit to it.
- The rows below list the matching folders with their paths. Picking one reuses that folder's name as the query.
- Opening the prompt with an empty input lists your saved presets, followed by your recent queries for this workspace.

The preview is bounded — it stops after 200 matches or 20000 visited directories, whichever comes first — so typing stays responsive in large workspaces. Truncation only affects the preview; applying a filter always uses every match in the workspace.

### Presets

Click the star button on the query row to save the query you just typed as a named preset, without leaving the prompt. Presets are listed above your recent queries when the prompt opens with an empty input; picking one applies its query. Click the trash button on a preset row to delete it. Presets are stored per workspace, the same as query history.

## Behavior

When you run `Focus Folder: Filter`, the extension asks for a folder-name query, finds matching folders anywhere under the first workspace folder, and updates workspace-folder `files.exclude` so matching folders and their parent folders stay visible while unrelated sibling folders are hidden.

Existing `files.exclude` entries are preserved while the filter is active. Running `Focus Folder: Clear Filter` restores the exact original `files.exclude` map saved when the filter was first applied.

In multi-root workspaces, Explorer Folder Filter currently operates on the first workspace folder.

## Notes

- Matching is case-insensitive substring matching against folder names.
- Matching folders keep their full contents visible.
- The status bar item provides a persistent clear action while a filter is active.
- The extension intentionally uses VS Code's native Explorer and `files.exclude` behavior instead of rendering a custom tree view.
