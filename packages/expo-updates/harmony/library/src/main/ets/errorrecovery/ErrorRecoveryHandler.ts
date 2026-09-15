export enum RemoteLoadStatus {
  IDLE,
  NEW_UPDATE_LOADING,
  NEW_UPDATE_LOADED,
}

enum Task {
  WAIT_FOR_REMOTE_UPDATE,
  LAUNCH_NEW_UPDATE,
  LAUNCH_CACHED_UPDATE,
  CRASH,
}

export interface ErrorRecoveryDelegate {
  status(): RemoteLoadStatus;
  checkAllowed(): boolean;
  loadRemote(): void;
  relaunch(): Promise<void>;
  successfulCount(): number;
  markFailed(): void;
  markSuccessful(): void;
  log(message: string, error?: Error): void;
}

const remoteTimeout = 5000;

export class ErrorRecoveryHandler {
  private tasks = [Task.WAIT_FOR_REMOTE_UPDATE, Task.LAUNCH_NEW_UPDATE, Task.LAUNCH_CACHED_UPDATE, Task.CRASH];
  private readonly errors: Error[] = [];
  private readonly events: (() => void)[] = [];
  private readonly pending = new Set<() => void>();
  private delegate?: ErrorRecoveryDelegate;
  private running = false;
  private waiting = false;
  private appeared = false;
  private scheduled = false;
  private generation = 0;
  private timer?: number;
  private resolve?: () => void;
  private reject?: (error: Error) => void;

  constructor(previous?: ErrorRecoveryHandler) {
    if (previous === undefined) return;

    this.tasks = previous.tasks.slice();
    this.errors.push(...previous.errors);
    this.appeared = previous.appeared;
  }

  get isRunning(): boolean { return this.running; }

  attach(delegate: ErrorRecoveryDelegate): void { this.delegate = delegate; }

  detach(): void {
    this.generation++;
    this.delegate = undefined;
    this.events.length = 0;
    for (const resolve of this.pending) resolve();
    this.pending.clear();
    this.clearWait();
    this.running = false;
    this.finish();
  }

  recover(error: Error): Promise<void> {
    if (this.delegate === undefined) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.pending.add(resolve);
      this.post(() => {
        this.pending.delete(resolve);
        this.errors.push(error);
        if (!this.running) { this.resolve = resolve; this.reject = reject; }
        else resolve();

        if (this.delegate!.successfulCount() > 0) this.remove(Task.LAUNCH_CACHED_UPDATE);
        else if (!this.appeared) this.delegate!.markFailed();

        this.log(`Recovering from ${error.message}`, error);
        if (!this.running) {
          this.running = true;
          this.advance();
        }
      });
    });
  }

  contentAppeared(): void {
    this.post(() => {
      this.appeared = true;
      this.remove(Task.LAUNCH_NEW_UPDATE, Task.LAUNCH_CACHED_UPDATE);
      this.delegate!.markSuccessful();
    });
  }

  remoteChanged(status: RemoteLoadStatus): void {
    this.post(() => {
      if (!this.waiting) return;

      this.clearWait();
      if (status !== RemoteLoadStatus.NEW_UPDATE_LOADED) this.remove(Task.LAUNCH_NEW_UPDATE);
      this.advance();
    });
  }

  private post(event: () => void): void {
    if (this.delegate === undefined) return;

    const generation = this.generation;
    this.events.push(() => { if (generation === this.generation && this.delegate !== undefined) event(); });
    if (this.scheduled) return;

    this.scheduled = true;

    // Do not await IO here: completion, first render and errors must retain arrival order.
    Promise.resolve().then(() => {
      try {
        while (this.events.length) {
          try { this.events.shift()!(); }
          catch (error) {
            this.log('Recovery event failed.', error as Error);
            if (this.errors.length) {
              this.errors.push(error as Error);
              this.clearWait();
              this.remove(Task.WAIT_FOR_REMOTE_UPDATE, Task.LAUNCH_NEW_UPDATE, Task.LAUNCH_CACHED_UPDATE);
              this.advance();
            }
          }
        }
      } finally { this.scheduled = false; }
    });
  }

  private advance(): void {
    if (this.delegate === undefined) return;
    const task = this.tasks.shift() ?? Task.CRASH;
    switch (task) {
      case Task.WAIT_FOR_REMOTE_UPDATE:
        this.waitForRemote();
        break;
      case Task.LAUNCH_NEW_UPDATE:
      case Task.LAUNCH_CACHED_UPDATE:
        this.log(task === Task.LAUNCH_NEW_UPDATE ? 'Launching a new update.' : 'Launching a cached update.');
        this.relaunch();
        break;
      case Task.CRASH:
        this.clearWait();
        this.running = false;
        const error = this.errors[0];
        this.log('Unable to recover from the first runtime error.', error);
        this.finish(error);
        break;
    }
  }

  private waitForRemote(): void {
    const delegate = this.delegate!;
    const status = delegate.status();
    if (status === RemoteLoadStatus.NEW_UPDATE_LOADED) { this.advance(); return; }
    if (status !== RemoteLoadStatus.NEW_UPDATE_LOADING && !delegate.checkAllowed()) {
      this.remove(Task.LAUNCH_NEW_UPDATE);
      this.advance();
      return;
    }

    this.waiting = true;
    this.timer = setTimeout(() => this.remoteChanged(RemoteLoadStatus.IDLE), remoteTimeout);
    if (status !== RemoteLoadStatus.NEW_UPDATE_LOADING) delegate.loadRemote();
  }

  private relaunch(): void {
    const generation = this.generation;
    this.delegate!.relaunch().then(() => {
      if (generation !== this.generation) return;
      this.post(() => { this.running = false; this.finish(); });
    }, (error: Error) => {
      if (generation !== this.generation) return;
      this.post(() => {
        this.errors.push(error);
        this.log('Unable to relaunch from cache.', error);
        this.remove(Task.LAUNCH_NEW_UPDATE, Task.LAUNCH_CACHED_UPDATE);
        this.advance();
      });
    });
  }

  private remove(...tasks: Task[]): void { this.tasks = this.tasks.filter(task => !tasks.includes(task)); }

  private clearWait(): void {
    this.waiting = false;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private finish(error?: Error): void {
    if (error === undefined) this.resolve?.();
    else this.reject?.(error);
    this.resolve = undefined;
    this.reject = undefined;
  }

  private log(message: string, error?: Error): void {
    try { this.delegate?.log(message, error); }
    catch (_) { /* Diagnostics must not replace the first runtime error. */ }
  }
}
