import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FindMatchingDirsResult } from '../src/filter';
import {
  buildHistoryItems,
  buildPreviewItems,
  showFilterPicker,
  type DisposableLike,
  type FilterQuickPickItem,
  type QuickPickLike,
  type TimerHandle,
} from '../src/filterPicker';

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

describe('buildPreviewItems', () => {
  it('puts the typed query first and lists every match below it', () => {
    const items = buildPreviewItems('target', result(['workspace-a/modules/target-folder', 'shared/target']));

    assert.deepEqual(items[0], {
      label: '$(filter) Filter by "target"',
      description: '2 folders',
      detail: undefined,
      alwaysShow: true,
      kind: 'query',
      query: 'target',
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
    assert.equal(buildPreviewItems('api', result(['services/api']))[0].description, '1 folder');
  });

  it('reports when nothing matched instead of hiding the query row', () => {
    const items = buildPreviewItems('nope', result([]));

    assert.equal(items.length, 1);
    assert.equal(items[0].description, 'No folders match');
    assert.equal(items[0].kind, 'query');
  });

  it('explains that a truncated preview does not truncate the applied filter', () => {
    const items = buildPreviewItems('a', result(['x/a'], true));

    assert.equal(items[0].description, 'First 1 folder');
    assert.match(items[0].detail ?? '', /applied filter still uses every match/);
  });

  it('marks every item as always shown so the VS Code fuzzy filter cannot hide the preview', () => {
    const items = buildPreviewItems('target', result(['a/target', 'b/target']));

    assert.ok(items.every((item) => item.alwaysShow));
  });

  it('ignores surrounding whitespace in the typed query', () => {
    assert.equal(buildPreviewItems('  target  ', result([])) [0].query, 'target');
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
});

function result(matches: string[], truncated = false): FindMatchingDirsResult {
  return { matches, truncated, cancelled: false };
}

interface HarnessOptions {
  readonly history?: string[];
  readonly matches?: string[];
  readonly truncated?: boolean;
}

function createHarness(options: HarnessOptions) {
  const quickPick = new FakeQuickPick();
  const timers = createTimerHarness();
  const searchCalls: string[] = [];

  const promise = showFilterPicker({
    quickPick,
    history: options.history ?? [],
    debounceMs: 150,
    search: (query) => {
      searchCalls.push(query);
      return result(options.matches ?? [], options.truncated ?? false);
    },
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  return { quickPick, timers, searchCalls, result: promise };
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

  readonly onDidChangeValue = (listener: (value: string) => unknown): DisposableLike =>
    register(this.changeListeners, listener);

  readonly onDidAccept = (listener: () => unknown): DisposableLike =>
    register(this.acceptListeners, listener);

  readonly onDidHide = (listener: () => unknown): DisposableLike =>
    register(this.hideListeners, listener);

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
}

function register<T>(listeners: Set<T>, listener: T): DisposableLike {
  listeners.add(listener);
  return {
    dispose: () => {
      listeners.delete(listener);
    },
  };
}
