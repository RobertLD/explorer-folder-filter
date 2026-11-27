import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SerialQueue } from '../src/serialQueue';

describe('SerialQueue', () => {
  it('runs each task only after the previous task finishes', async () => {
    const queue = new SerialQueue();
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = queue.run(async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    const second = queue.run(async () => {
      events.push('second:start');
    });

    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(events, ['first:start']);

    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(events, ['first:start', 'first:end', 'second:start']);
  });

  it('returns each task result to its caller', async () => {
    const queue = new SerialQueue();

    assert.equal(await queue.run(async () => 42), 42);
  });

  it('keeps running later tasks after a task rejects', async () => {
    const queue = new SerialQueue();

    const failing = queue.run(async () => {
      throw new Error('boom');
    });
    const following = queue.run(async () => 'ran');

    await assert.rejects(failing, /boom/);
    assert.equal(await following, 'ran');
  });
});
