export class OperationCancelledError extends Error {
  constructor() {
    super('Operation was cancelled.');
    this.name = 'OperationCancelledError';
  }
}

export class LatestOperationQueue {
  private current: AbortController | undefined;
  private tail: Promise<unknown> = Promise.resolve();

  start(): AbortController {
    this.current?.abort();
    this.current = new AbortController();
    return this.current;
  }

  commit<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(() => {
      if (signal.aborted) {
        throw new OperationCancelledError();
      }

      return task();
    });
    this.tail = result.catch(() => undefined);
    return result;
  }
}
