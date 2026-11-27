import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LatestOperationQueue, OperationCancelledError } from '../src/latestOperation';

describe('LatestOperationQueue', () => {
  it('runs each commit only after the previous commit finishes', async () => {
    const operations = new LatestOperationQueue();
    const signal = new AbortController().signal;
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = operations.commit(signal, async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = operations.commit(signal, async () => {
      events.push('second:start');
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ['first:start']);

    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(events, ['first:start', 'first:end', 'second:start']);
  });

  it('returns each commit result to its caller', async () => {
    const operations = new LatestOperationQueue();

    assert.equal(await operations.commit(new AbortController().signal, async () => 42), 42);
  });

  it('aborts the previous operation when a new one starts', () => {
    const operations = new LatestOperationQueue();

    const first = operations.start();
    const second = operations.start();

    assert.equal(first.signal.aborted, true);
    assert.equal(second.signal.aborted, false);
  });

  it('rejects a commit whose operation was superseded without running it', async () => {
    const operations = new LatestOperationQueue();
    const superseded = operations.start();
    operations.start();
    let ran = false;

    await assert.rejects(
      operations.commit(superseded.signal, async () => {
        ran = true;
      }),
      OperationCancelledError,
    );
    assert.equal(ran, false);
  });

  it('keeps running later commits after a commit rejects', async () => {
    const operations = new LatestOperationQueue();
    const signal = new AbortController().signal;

    const failing = operations.commit(signal, async () => {
      throw new Error('boom');
    });
    const following = operations.commit(signal, async () => 'ran');

    await assert.rejects(failing, /boom/);
    assert.equal(await following, 'ran');
  });
});
