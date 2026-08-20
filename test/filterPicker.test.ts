import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FindMatchingDirsResult } from '../src/filter';
import type { FilterPreset } from '../src/presets';
import {
  buildHistoryItems,
  buildPresetItems,
  buildPreviewItems,
  showFilterPicker,
  type DisposableLike,
  type FilterQuickPickItem,
  type QuickPickItemButtonEventLike,
  type QuickPickItemButtonLike,
  type QuickPickLike,
  type TimerHandle,
} from '../src/filterPicker';

const SAVE_BUTTON: QuickPickItemButtonLike = { iconPath: 'star', tooltip: 'Save as preset' };
const DELETE_BUTTON: QuickPickItemButtonLike = { iconPath: 'trash', tooltip: 'Delete preset' };

describe('buildHistoryItems', () => {
  it('renders one always-shown row per recent query', () => {
    assert.deepEqual(buildHistoryItems(['modules', 'services']), [
      {
        label: '$(history) modules',
        description: 'Recent filter',
        alwaysShow: true,
        kind: 'history',
        query: 'modules',
      },
      {
        label: '$(history) services',
        description: 'Recent filter',
        alwaysShow: true,
        kind: 'history',
        query: 'services',
      },
    ]);
  });

  it('renders nothing when there is no history', () => {
    assert.deepEqual(buildHistoryItems([]), []);
  });
});

describe('buildPresetItems', () => {
  it('renders one always-shown row per preset, with a delete button', () => {
    assert.deepEqual(buildPresetItems([{ name: 'Retail', query: 'retail' }], DELETE_BUTTON), [
      {
        label: '$(bookmark) Retail',
        description: 'retail',
        alwaysShow: true,
        kind: 'preset',
        query: 'retail',
        presetName: 'Retail',
        buttons: [DELETE_BUTTON],
      },
    ]);
  });

  it('renders nothing when there are no presets', () => {
    assert.deepEqual(buildPresetItems([], DELETE_BUTTON), []);
  });
});

describe('buildPreviewItems', () => {
  it('puts the typed query first and lists every match below it', () => {
    const items = buildPreviewItems(
      'target',
      result(['workspace-a/modules/target-folder', 'shared/target']),
      SAVE_BUTTON,
    );

    assert.deepEqual(items[0], {
      label: '$(filter) Filter by "target"',
      description: '2 folders',
      detail: undefined,
      alwaysShow: true,
      kind: 'query',
      query: 'target',
      buttons: [SAVE_BUTTON],
    });
    assert.deepEqual(items.slice(1), [
      {
        label: '$(folder) target-folder',
        description: 'workspace-a/modules/target-folder',
        alwaysShow: true,
        kind: 'match',
        query: 'target-folder',
      },
      {
        label: '$(folder) target',
        description: 'shared/target',
        alwaysShow: true,
        kind: 'match',
        query: 'target',
      },
    ]);
  });

  it('uses a singular noun for a single match', () => {
    assert.equal(buildPreviewItems('api', result(['services/api']), SAVE_BUTTON)[0].description, '1 folder');
  });

  it('reports when nothing matched instead of hiding the query row', () => {
    const items = buildPreviewItems('nope', result([]), SAVE_BUTTON);

    assert.equal(items.length, 1);
    assert.equal(items[0].description, 'No folders match');
    assert.equal(items[0].kind, 'query');
  });

  it('explains that a truncated preview does not truncate the applied filter', () => {
    const items = buildPreviewItems('a', result(['x/a'], true), SAVE_BUTTON);

    assert.equal(items[0].description, 'First 1 folder');
    assert.match(items[0].detail ?? '', /applied filter still uses every match/);
  });

  it('marks every item as always shown so the VS Code fuzzy filter cannot hide the preview', () => {
    const items = buildPreviewItems('target', result(['a/target', 'b/target']), SAVE_BUTTON);

    assert.ok(items.every((item) => item.alwaysShow));
  });

  it('ignores surrounding whitespace in the typed query', () => {
    assert.equal(buildPreviewItems('  target  ', result([]), SAVE_BUTTON)[0].query, 'target');
  });

  it('attaches the save button so the row can be saved as a preset', () => {
    const items = buildPreviewItems('target', result([]), SAVE_BUTTON);
    assert.deepEqual(items[0].buttons, [SAVE_BUTTON]);
  });
});

describe('showFilterPicker', () => {
  it('offers the recent queries as soon as it opens', async () => {
    const harness = createHarness({ history: ['modules', 'services'] });

    assert.equal(harness.quickPick.shownCount, 1);
    assert.deepEqual(
      harness.quickPick.items.map((item) => item.query),
      ['modules', 'services'],
    );
    assert.equal(harness.quickPick.title, 'Focus Folder: Filter');
    assert.ok(harness.quickPick.ignoreFocusOut);

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('does not search until the debounce elapses', async () => {
    const harness = createHarness({});

    harness.quickPick.type('tar');
    assert.deepEqual(harness.searchCalls, []);
    assert.ok(harness.quickPick.busy);

    harness.timers.flush();
    assert.deepEqual(harness.searchCalls, ['tar']);
    assert.equal(harness.quickPick.busy, false);

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('collapses a burst of keystrokes into a single search for the final value', async () => {
    const harness = createHarness({});

    harness.quickPick.type('t');
    harness.quickPick.type('ta');
    harness.quickPick.type('tar');
    assert.equal(harness.timers.pendingCount, 1);

    harness.timers.flush();
    assert.deepEqual(harness.searchCalls, ['tar']);

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('shows the previewed matches once the search resolves', async () => {
    const harness = createHarness({ matches: ['services/api-gateway'] });

    harness.quickPick.type('gate');
    harness.timers.flush();

    assert.deepEqual(
      harness.quickPick.items.map((item) => item.kind),
      ['query', 'match'],
    );

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('goes back to the history and cancels pending work when the input is cleared', async () => {
    const harness = createHarness({ history: ['modules'] });

    harness.quickPick.type('tar');
    harness.quickPick.type('   ');

    assert.equal(harness.timers.pendingCount, 0);
    assert.equal(harness.quickPick.busy, false);
    assert.deepEqual(
      harness.quickPick.items.map((item) => item.kind),
      ['history'],
    );

    harness.timers.flush();
    assert.deepEqual(harness.searchCalls, []);

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('resolves the typed query when the query row is accepted', async () => {
    const harness = createHarness({ matches: ['services/api-gateway'] });

    harness.quickPick.type('gate');
    harness.timers.flush();
    harness.quickPick.select(0);
    harness.quickPick.emitAccept();

    assert.equal(await harness.result, 'gate');
  });

  it('re-reads the live value so accepting mid-typing cannot apply a stale query', async () => {
    const harness = createHarness({ matches: ['services/api-gateway'] });

    harness.quickPick.type('gate');
    harness.timers.flush();
    harness.quickPick.select(0);
    harness.quickPick.type('gateway');
    harness.quickPick.emitAccept();

    assert.equal(await harness.result, 'gateway');
  });

  it('resolves the folder name when a previewed match is accepted', async () => {
    const harness = createHarness({ matches: ['services/api-gateway'] });

    harness.quickPick.type('gate');
    harness.timers.flush();
    harness.quickPick.select(1);
    harness.quickPick.emitAccept();

    assert.equal(await harness.result, 'api-gateway');
  });

  it('resolves the stored query when a history row is accepted', async () => {
    const harness = createHarness({ history: ['modules'] });

    harness.quickPick.select(0);
    harness.quickPick.emitAccept();

    assert.equal(await harness.result, 'modules');
  });

  it('resolves undefined when accepting an empty input with no history', async () => {
    const harness = createHarness({});

    harness.quickPick.emitAccept();

    assert.equal(await harness.result, undefined);
  });

  it('resolves undefined and cleans up when the picker is dismissed', async () => {
    const harness = createHarness({});

    harness.quickPick.type('tar');
    harness.quickPick.emitHide();

    assert.equal(await harness.result, undefined);
    assert.equal(harness.timers.pendingCount, 0);
    assert.equal(harness.quickPick.disposedCount, 1);
  });

  it('does not resolve twice when hide follows accept', async () => {
    const harness = createHarness({ history: ['modules'] });

    harness.quickPick.select(0);
    harness.quickPick.emitAccept();
    harness.quickPick.emitHide();

    assert.equal(await harness.result, 'modules');
    assert.equal(harness.quickPick.disposedCount, 1);
  });

  it('never leaves a queued search running after the picker closes', async () => {
    const harness = createHarness({});

    harness.quickPick.type('tar');
    harness.quickPick.emitHide();
    harness.timers.flush();

    await harness.result;
    assert.deepEqual(harness.searchCalls, []);
  });

  it('lists presets before history when the input is empty', async () => {
    const harness = createHarness({
      presets: [{ name: 'Retail', query: 'retail' }],
      history: ['modules'],
    });

    assert.deepEqual(
      harness.quickPick.items.map((item) => item.kind),
      ['preset', 'history'],
    );

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('resolves the stored query when a preset row is accepted', async () => {
    const harness = createHarness({ presets: [{ name: 'Retail', query: 'retail' }] });

    harness.quickPick.select(0);
    harness.quickPick.emitAccept();

    assert.equal(await harness.result, 'retail');
  });

  it('saves the typed query as a preset when the query row button is triggered', async () => {
    const harness = createHarness({
      matches: ['services/api'],
      onSaveQueryAsPreset: async (query) => [{ name: 'API', query }],
    });

    harness.quickPick.type('api');
    harness.timers.flush();
    harness.quickPick.triggerButtonOn(0);
    await flushAsync();

    assert.deepEqual(harness.saveCalls, ['api']);

    harness.quickPick.type('');
    assert.deepEqual(
      harness.quickPick.items.map((item) => item.kind),
      ['preset'],
    );

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('does not change the preset list when the save prompt is cancelled', async () => {
    const harness = createHarness({
      matches: ['services/api'],
      onSaveQueryAsPreset: async () => undefined,
    });

    harness.quickPick.type('api');
    harness.timers.flush();
    harness.quickPick.triggerButtonOn(0);
    await flushAsync();

    harness.quickPick.type('');
    assert.deepEqual(
      harness.quickPick.items.map((item) => item.kind),
      [],
    );

    harness.quickPick.emitHide();
    await harness.result;
  });

  it('deletes a preset when its row button is triggered, refreshing the empty-query list', async () => {
    const harness = createHarness({
      presets: [{ name: 'Retail', query: 'retail' }],
      onDeletePreset: async () => [],
    });

    harness.quickPick.triggerButtonOn(0);
    await flushAsync();

    assert.deepEqual(harness.deleteCalls, ['Retail']);
    assert.deepEqual(
      harness.quickPick.items.map((item) => item.kind),
      [],
    );

    harness.quickPick.emitHide();
    await harness.result;
  });
});

function result(matches: string[], truncated = false): FindMatchingDirsResult {
  return { matches, truncated, cancelled: false };
}

interface HarnessOptions {
  readonly history?: string[];
  readonly matches?: string[];
  readonly truncated?: boolean;
  readonly presets?: FilterPreset[];
  readonly onSaveQueryAsPreset?: (query: string) => Promise<readonly FilterPreset[] | undefined>;
  readonly onDeletePreset?: (name: string) => Promise<readonly FilterPreset[]>;
}

/** Flushes the microtasks queued by the `async` preset callbacks. */
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHarness(options: HarnessOptions) {
  const quickPick = new FakeQuickPick();
  const timers = createTimerHarness();
  const searchCalls: string[] = [];
  const saveCalls: string[] = [];
  const deleteCalls: string[] = [];

  const promise = showFilterPicker({
    quickPick,
    history: options.history ?? [],
    presets: options.presets ?? [],
    saveButton: SAVE_BUTTON,
    deleteButton: DELETE_BUTTON,
    debounceMs: 150,
    search: (query) => {
      searchCalls.push(query);
      return result(options.matches ?? [], options.truncated ?? false);
    },
    onSaveQueryAsPreset: async (query) => {
      saveCalls.push(query);
      return options.onSaveQueryAsPreset ? options.onSaveQueryAsPreset(query) : undefined;
    },
    onDeletePreset: async (name) => {
      deleteCalls.push(name);
      return options.onDeletePreset ? options.onDeletePreset(name) : [];
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  return { quickPick, timers, searchCalls, saveCalls, deleteCalls, result: promise };
}

function createTimerHarness() {
  const pending = new Map<number, () => void>();
  let nextHandle = 1;

  return {
    setTimer: (callback: () => void): TimerHandle => {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      return handle;
    },
    clearTimer: (handle: TimerHandle): void => {
      pending.delete(handle as number);
    },
    flush: (): void => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) {
        callback();
      }
    },
    get pendingCount(): number {
      return pending.size;
    },
  };
}

class FakeQuickPick implements QuickPickLike {
  value = '';
  title?: string;
  placeholder?: string;
  busy = false;
  items: readonly FilterQuickPickItem[] = [];
  matchOnDescription = false;
  ignoreFocusOut = false;
  selectedItems: readonly FilterQuickPickItem[] = [];
  shownCount = 0;
  hiddenCount = 0;
  disposedCount = 0;

  private readonly changeListeners = new Set<(value: string) => unknown>();
  private readonly acceptListeners = new Set<() => unknown>();
  private readonly hideListeners = new Set<() => unknown>();
  private readonly itemButtonListeners = new Set<(event: QuickPickItemButtonEventLike) => unknown>();

  readonly onDidChangeValue = (listener: (value: string) => unknown): DisposableLike =>
    register(this.changeListeners, listener);

  readonly onDidAccept = (listener: () => unknown): DisposableLike =>
    register(this.acceptListeners, listener);

  readonly onDidHide = (listener: () => unknown): DisposableLike =>
    register(this.hideListeners, listener);

  readonly onDidTriggerItemButton = (listener: (event: QuickPickItemButtonEventLike) => unknown): DisposableLike =>
    register(this.itemButtonListeners, listener);

  show(): void {
    this.shownCount += 1;
  }

  hide(): void {
    this.hiddenCount += 1;
  }

  dispose(): void {
    this.disposedCount += 1;
  }

  /** Simulates the user typing, which VS Code reports after updating `value`. */
  type(value: string): void {
    this.value = value;
    for (const listener of [...this.changeListeners]) {
      listener(value);
    }
  }

  /** Simulates VS Code highlighting the row at `index`. */
  select(index: number): void {
    const item = this.items[index];
    this.selectedItems = item ? [item] : [];
  }

  emitAccept(): void {
    for (const listener of [...this.acceptListeners]) {
      listener();
    }
  }

  emitHide(): void {
    for (const listener of [...this.hideListeners]) {
      listener();
    }
  }

  /** Simulates the user clicking the button on the row at `index`. */
  triggerButtonOn(index: number): void {
    const item = this.items[index];
    if (!item) {
      return;
    }

    for (const listener of [...this.itemButtonListeners]) {
      listener({ item });
    }
  }
}

function register<T>(listeners: Set<T>, listener: T): DisposableLike {
  listeners.add(listener);
  return {
    dispose: () => {
      listeners.delete(listener);
    },
  };
}
