import { throwIfAborted } from './errors.mjs';
import { AsyncResource } from 'node:async_hooks';

export class TaskPoolError extends Error {
  constructor() { super('작업 대기열이 가득 찼습니다. 잠시 후 다시 시도해 주세요.'); this.name = 'TaskPoolError'; this.code = 'POOL_FULL'; this.status = 429; }
}

/** Slots belong to underlying work until settlement, including cancellation cleanup. */
export class TaskPool {
  #waiting = new Map();
  #active = 0;
  constructor(limit = 2, { maxPending = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(maxPending) || maxPending < 0) throw new TypeError('Invalid task pool limits');
    this.limit = limit;
    this.maxPending = maxPending;
  }
  get active() { return this.#active; }
  get pending() { return this.#waiting.size; }
  async acquire(signal) {
    let available, unavailable, finish;
    const ready = new Promise((resolve, reject) => { available = resolve; unavailable = reject; });
    const held = new Promise(resolve => { finish = resolve; });
    const task = this.submit(() => { available(); return held; }, signal);
    task.catch(unavailable);
    await ready;
    return async () => { finish(); await task; };
  }
  run(work, options = {}) { return this.submit(work, options?.signal ?? (typeof options?.aborted === 'boolean' ? options : undefined)); }
  submit(work, signal) {
    return new Promise((resolve, reject) => {
      try { throwIfAborted(signal); if (typeof work !== 'function') throw new TypeError('Work must be a function'); }
      catch (error) { reject(error); return; }
      if (this.#active >= this.limit && this.#waiting.size >= this.maxPending) { reject(new TaskPoolError()); return; }
      const token = Symbol();
      const abort = () => {
        if (!this.#waiting.delete(token)) return;
        signal.removeEventListener('abort', abort);
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      };
      // Draining is triggered by the previous task's finally. Retain the submitter's
      // async context so queued provider work updates its own activity and scope.
      this.#waiting.set(token, { work: AsyncResource.bind(work, 'GSPECTaskPoolWork'), signal, abort, resolve, reject });
      signal?.addEventListener('abort', abort, { once: true });
      this.#drain();
    });
  }
  #drain() {
    while (this.#active < this.limit && this.#waiting.size) {
      const [token, entry] = this.#waiting.entries().next().value;
      this.#waiting.delete(token);
      entry.signal?.removeEventListener('abort', entry.abort);
      this.#active++;
      Promise.resolve().then(() => { throwIfAborted(entry.signal); return entry.work(entry.signal); })
        .then(entry.resolve, entry.reject).finally(() => { this.#active--; this.#drain(); });
    }
  }
}

export const geminiPool = new TaskPool(2);
export const sandboxPool = new TaskPool(2);
