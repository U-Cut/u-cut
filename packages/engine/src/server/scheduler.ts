// Bounded, fair work scheduling. Heavy work never starts faster than the machine can carry it, and
// one person's backlog can't hold everyone else up.

/**
 * Start-time fair queuing. Whoever has been served least goes next, however much they have
 * waiting. A newcomer joins just behind the others, so they neither wait out a backlog nor take
 * over the queue.
 */
export class FairQueue<T> {
  private readonly lanes = new Map<string, T[]>();
  private readonly served = new Map<string, number>();

  push(owner: string, item: T) {
    const lane = this.lanes.get(owner);
    if (lane) {
      lane.push(item);
      return;
    }
    const level = Math.min(...[...this.lanes.keys()].map((name) => this.servedBy(name)));
    // One turn behind the others: they go next, then take turns.
    const start = Number.isFinite(level) ? Math.max(0, level - 1) : 0;
    this.served.set(owner, Math.max(this.servedBy(owner), start));
    this.lanes.set(owner, [item]);
  }

  shift(): T | undefined {
    const owner = this.nextOwner(this.served);
    if (owner === undefined) return undefined;
    const lane = this.lanes.get(owner) ?? [];
    const item = lane.shift();
    this.served.set(owner, this.servedBy(owner) + 1);
    if (lane.length === 0) this.lanes.delete(owner);
    return item;
  }

  remove(match: (item: T) => boolean): boolean {
    for (const [owner, lane] of this.lanes) {
      const index = lane.findIndex(match);
      if (index >= 0) {
        lane.splice(index, 1);
        if (lane.length === 0) this.lanes.delete(owner);
        return true;
      }
    }
    return false;
  }

  /** The items in the order they will actually run. */
  order(): T[] {
    const lanes = new Map([...this.lanes].map(([owner, lane]) => [owner, [...lane]]));
    const served = new Map(this.served);
    const result: T[] = [];
    for (;;) {
      const owner = this.nextOwner(served, lanes);
      const lane = owner === undefined ? undefined : lanes.get(owner);
      if (owner === undefined || !lane) return result;
      const item = lane.shift();
      if (item !== undefined) result.push(item);
      served.set(owner, (served.get(owner) ?? 0) + 1);
      if (lane.length === 0) lanes.delete(owner);
    }
  }

  /** Forgets who was served, once there's nothing running or waiting. */
  reset() {
    this.served.clear();
  }

  get size(): number {
    let total = 0;
    for (const lane of this.lanes.values()) total += lane.length;
    return total;
  }

  private servedBy(owner: string): number {
    return this.served.get(owner) ?? 0;
  }

  private nextOwner(served: Map<string, number>, lanes: Map<string, T[]> = this.lanes) {
    let best: string | undefined;
    let lowest = Number.POSITIVE_INFINITY;
    for (const owner of lanes.keys()) {
      const count = served.get(owner) ?? 0;
      if (count < lowest) {
        lowest = count;
        best = owner;
      }
    }
    return best;
  }
}

export interface TaskContext {
  signal: AbortSignal;
}

export interface Task<R> {
  id: string;
  owner: string;
  run(context: TaskContext): Promise<R>;
}

interface Entry<R> {
  task: Task<R>;
  controller: AbortController;
  promise: Promise<R>;
  resolve(value: R): void;
  reject(reason: Error): void;
}

export class Scheduler<R> {
  private readonly slots: () => number;
  private readonly queue = new FairQueue<Entry<R>>();
  private readonly active = new Map<string, Entry<R>>();
  private readonly listeners = new Set<() => void>();

  constructor(options: { slots: () => number }) {
    this.slots = options.slots;
  }

  /** Runs a task when there's room. An identical id joins the run already under way. */
  submit(task: Task<R>): Promise<R> {
    const existing = this.active.get(task.id) ?? this.find(task.id);
    if (existing) return existing.promise;

    let resolve: (value: R) => void = () => {};
    let reject: (reason: Error) => void = () => {};
    const promise = new Promise<R>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.queue.push(task.owner, {
      task,
      controller: new AbortController(),
      promise,
      resolve,
      reject,
    });
    this.pump();
    this.notify();
    return promise;
  }

  cancel(id: string): boolean {
    const running = this.active.get(id);
    if (running) {
      running.controller.abort();
      return true;
    }
    const queued = this.find(id);
    if (!queued) return false;
    this.queue.remove((entry) => entry === queued);
    queued.reject(new Error("Cancelled"));
    this.notify();
    return true;
  }

  /** 0 while running, 1 for next in line, null when it isn't here. */
  position(id: string): number | null {
    if (this.active.has(id)) return 0;
    const index = this.queue.order().findIndex((entry) => entry.task.id === id);
    return index >= 0 ? index + 1 : null;
  }

  stats() {
    return { slots: this.slots(), running: this.active.size, queued: this.queue.size };
  }

  queuedIds(): string[] {
    return this.queue.order().map((entry) => entry.task.id);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private find(id: string) {
    return this.queue.order().find((entry) => entry.task.id === id);
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }

  private pump() {
    while (this.active.size < this.slots()) {
      const entry = this.queue.shift();
      if (!entry) return;
      this.active.set(entry.task.id, entry);
      entry.task
        .run({ signal: entry.controller.signal })
        .then(entry.resolve, (error: Error) => entry.reject(error))
        .finally(() => {
          this.active.delete(entry.task.id);
          this.pump();
          if (this.active.size === 0 && this.queue.size === 0) this.queue.reset();
          this.notify();
        });
    }
  }
}
