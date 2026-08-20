import type { FindMatchingDirsResult } from './filter';
import type { FilterPreset } from './presets';

/**
 * QuickPick that previews matching folders while the user types and offers the
 * recently used queries when the input is empty.
 *
 * The controller is written against narrow structural interfaces instead of the
 * `vscode` namespace, following the same approach as `workspaceConfig.ts`, so it
 * can be unit tested with fakes under `node --test`.
 */

export const DEFAULT_DEBOUNCE_MS = 150;
export const DEFAULT_PREVIEW_LIMIT = 200;
export const DEFAULT_MAX_VISITED_DIRS = 20000;

export type FilterQuickPickItemKind = 'query' | 'match' | 'history' | 'preset';

export interface QuickPickItemButtonLike {
  readonly iconPath: unknown;
  readonly tooltip?: string;
}

export interface FilterQuickPickItem {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  /**
   * Always true. VS Code applies its own fuzzy filtering to QuickPick items
   * based on the typed value, which would hide the preview rows we just
   * computed; `alwaysShow` opts out of that second filtering pass.
   */
  readonly alwaysShow: boolean;
  readonly kind: FilterQuickPickItemKind;
  /** Query this item resolves to when accepted. */
  readonly query: string;
  /** Preset name, set only on `kind: 'preset'` rows so the delete button knows what to remove. */
  readonly presetName?: string;
  readonly buttons?: readonly QuickPickItemButtonLike[];
}

export interface DisposableLike {
  dispose(): void;
}

export type EventLike<T> = (listener: (value: T) => unknown) => DisposableLike;

export interface QuickPickItemButtonEventLike {
  readonly item: FilterQuickPickItem;
}

export interface QuickPickLike {
  value: string;
  title?: string;
  placeholder?: string;
  busy: boolean;
  items: readonly FilterQuickPickItem[];
  matchOnDescription: boolean;
  ignoreFocusOut: boolean;
  readonly selectedItems: readonly FilterQuickPickItem[];
  readonly onDidChangeValue: EventLike<string>;
  readonly onDidAccept: EventLike<void>;
  readonly onDidHide: EventLike<void>;
  readonly onDidTriggerItemButton: EventLike<QuickPickItemButtonEventLike>;
  show(): void;
  hide(): void;
  dispose(): void;
}

export type TimerHandle = unknown;

export interface FilterPickerDeps {
  readonly quickPick: QuickPickLike;
  /**
   * Runs a bounded preview search.
   *
   * `isCancelled` is checked cooperatively by the walker. With today's
   * synchronous search it can only ever return false, because a newer keystroke
   * cannot be processed while the walk owns the event loop; the bound that
   * actually protects the extension host is `maxVisitedDirs`. The parameter
   * exists so an asynchronous walker can be dropped in without reshaping this
   * controller.
   */
  readonly search: (query: string, isCancelled: () => boolean) => FindMatchingDirsResult;
  readonly history: readonly string[];
  readonly presets: readonly FilterPreset[];
  /** Button shown on the query row; triggering it prompts to save that query as a named preset. */
  readonly saveButton: QuickPickItemButtonLike;
  /** Button shown on each preset row; triggering it deletes that preset. */
  readonly deleteButton: QuickPickItemButtonLike;
  /** Prompts for a name and persists `query` as a preset. Resolves the updated list, or undefined if cancelled. */
  readonly onSaveQueryAsPreset: (query: string) => Promise<readonly FilterPreset[] | undefined>;
  /** Deletes the preset named `name` and resolves the updated list. */
  readonly onDeletePreset: (name: string) => Promise<readonly FilterPreset[]>;
  readonly debounceMs?: number;
  readonly setTimer: (callback: () => void, milliseconds: number) => TimerHandle;
  readonly clearTimer: (handle: TimerHandle) => void;
}

export function buildHistoryItems(history: readonly string[]): FilterQuickPickItem[] {
  return history.map((query) => ({
    label: `$(history) ${query}`,
    description: 'Recent filter',
    alwaysShow: true,
    kind: 'history',
    query,
  }));
}

export function buildPresetItems(
  presets: readonly FilterPreset[],
  deleteButton: QuickPickItemButtonLike,
): FilterQuickPickItem[] {
  return presets.map((preset) => ({
    label: `$(bookmark) ${preset.name}`,
    description: preset.query,
    alwaysShow: true,
    kind: 'preset',
    query: preset.query,
    presetName: preset.name,
    buttons: [deleteButton],
  }));
}

export function buildPreviewItems(
  query: string,
  result: FindMatchingDirsResult,
  saveButton: QuickPickItemButtonLike,
): FilterQuickPickItem[] {
  const trimmed = query.trim();
  const count = result.matches.length;
  const queryItem: FilterQuickPickItem = {
    label: `$(filter) Filter by "${trimmed}"`,
    description: describeMatchCount(count, result.truncated),
    detail: result.truncated
      ? 'Preview is capped. The applied filter still uses every match in the workspace.'
      : undefined,
    alwaysShow: true,
    kind: 'query',
    query: trimmed,
    buttons: [saveButton],
  };

  const matchItems: FilterQuickPickItem[] = result.matches.map((relativePath) => ({
    label: `$(folder) ${basename(relativePath)}`,
    description: relativePath,
    alwaysShow: true,
    kind: 'match',
    query: basename(relativePath),
  }));

  return [queryItem, ...matchItems];
}

export function showFilterPicker(deps: FilterPickerDeps): Promise<string | undefined> {
  const { quickPick } = deps;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const disposables: DisposableLike[] = [];

  let pendingTimer: TimerHandle | undefined;
  let runningSearch: { cancelled: boolean } | undefined;
  let settled = false;
  let presets = deps.presets;

  return new Promise<string | undefined>((resolve) => {
    const showEmptyQueryItems = (): void => {
      quickPick.items = [...buildPresetItems(presets, deps.deleteButton), ...buildHistoryItems(deps.history)];
    };

    const cancelPendingWork = (): void => {
      if (pendingTimer !== undefined) {
        deps.clearTimer(pendingTimer);
        pendingTimer = undefined;
      }

      if (runningSearch) {
        runningSearch.cancelled = true;
        runningSearch = undefined;
      }
    };

    const settle = (query: string | undefined): void => {
      if (settled) {
        return;
      }

      settled = true;
      cancelPendingWork();

      for (const disposable of disposables.splice(0)) {
        disposable.dispose();
      }

      quickPick.hide();
      quickPick.dispose();
      resolve(query);
    };

    const runSearch = (trimmedQuery: string): void => {
      const token = { cancelled: false };
      runningSearch = token;

      try {
        const result = deps.search(trimmedQuery, () => token.cancelled);
        if (token.cancelled || settled) {
          return;
        }

        quickPick.items = buildPreviewItems(trimmedQuery, result, deps.saveButton);
      } finally {
        if (runningSearch === token) {
          runningSearch = undefined;
        }

        if (!settled) {
          quickPick.busy = false;
        }
      }
    };

    disposables.push(
      quickPick.onDidChangeValue((value) => {
        cancelPendingWork();

        const trimmed = value.trim();
        if (!trimmed) {
          quickPick.busy = false;
          showEmptyQueryItems();
          return;
        }

        quickPick.busy = true;
        pendingTimer = deps.setTimer(() => {
          pendingTimer = undefined;
          runSearch(trimmed);
        }, debounceMs);
      }),
      quickPick.onDidAccept(() => {
        settle(resolveAcceptedQuery(quickPick));
      }),
      quickPick.onDidHide(() => {
        settle(undefined);
      }),
      quickPick.onDidTriggerItemButton(({ item }) => {
        if (settled) {
          return;
        }

        if (item.kind === 'query') {
          void deps.onSaveQueryAsPreset(item.query).then((updated) => {
            if (updated === undefined || settled) {
              return;
            }

            presets = updated;
          });
          return;
        }

        if (item.kind === 'preset' && item.presetName) {
          void deps.onDeletePreset(item.presetName).then((updated) => {
            if (settled) {
              return;
            }

            presets = updated;
            if (!quickPick.value.trim()) {
              showEmptyQueryItems();
            }
          });
        }
      }),
    );

    quickPick.title = 'Focus Folder: Filter';
    quickPick.placeholder = 'Type part of a folder name, or pick a recent filter';
    quickPick.matchOnDescription = true;
    quickPick.ignoreFocusOut = true;
    showEmptyQueryItems();
    quickPick.show();
  });
}

/**
 * A `query` item mirrors whatever was typed, so it is re-read from the live
 * value: the user can accept before the debounced rebuild has run, which would
 * otherwise apply a stale query captured on the previous keystroke.
 */
function resolveAcceptedQuery(quickPick: QuickPickLike): string | undefined {
  const selected = quickPick.selectedItems[0];
  const source = selected && selected.kind !== 'query' ? selected.query : quickPick.value;
  return source.trim() || undefined;
}

function describeMatchCount(count: number, truncated: boolean): string {
  if (count === 0) {
    return 'No folders match';
  }

  const noun = count === 1 ? 'folder' : 'folders';
  return truncated ? `First ${count} ${noun}` : `${count} ${noun}`;
}

function basename(relativePath: string): string {
  const segments = relativePath.split('/');
  return segments[segments.length - 1] ?? relativePath;
}
