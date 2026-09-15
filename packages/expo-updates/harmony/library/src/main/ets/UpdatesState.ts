import { ExpoUpdatesError, Json } from './UpdatesProtocol';
import { allowed, destination, nativeEvent, UpdatesStateEvent, UpdatesStateValue } from './UpdatesStateEvent';
import { initialContext, reduceContext } from './UpdatesStateContext';
import { StateMachineProcedure } from './procedures/StateMachineProcedure';
import { UpdatesProcedures } from './procedures/UpdatesProcedures';

export interface UpdatesStateSubscription {
  remove(): void;
  getContext(): Json;
}

export class UpdatesState {
  private value: Json = initialContext();
  private phase: UpdatesStateValue = 'idle';
  private readonly listeners = new Set<(event: Json) => void>();
  private readonly contexts = new Set<(event: Json) => void>();
  private readonly procedures: UpdatesProcedures;

  constructor() {
    const machine = this;
    this.procedures = new UpdatesProcedures({
      process: event => this.process(event),
      get state() { return machine.phase; },
      reset: () => this.reset(),
      cancelRestart: () => this.cancelRestart(),
    });
  }

  get context(): Json { return JSON.parse(JSON.stringify(this.value)); }

  queue<T>(procedure: StateMachineProcedure<T>): Promise<T> { return this.procedures.enqueue(procedure); }

  subscribe(listener: (event: Json) => void): UpdatesStateSubscription { return this.subscription(this.listeners, listener); }

  subscribeContext(listener: (event: Json) => void): UpdatesStateSubscription { return this.subscription(this.contexts, listener); }

  private subscription(listeners: Set<(event: Json) => void>, listener: (event: Json) => void): UpdatesStateSubscription {
    const callback = (event: Json): void => listener(event);
    listeners.add(callback);
    return { remove: () => { listeners.delete(callback); }, getContext: () => this.context };
  }

  private notify(listeners: Set<(event: Json) => void>, event: Json): void {
    for (const listener of [...listeners]) {
      if (!listeners.has(listener)) continue;
      try { listener(JSON.parse(JSON.stringify(event))); }
      catch (error) { console.error(`[ExpoUpdates] State listener failed: ${String(error)}`); }
    }
  }

  private process(event: UpdatesStateEvent): void {
    if (!allowed(this.phase, event)) {
      console.warn(`[ExpoUpdates] Invalid state transition: ${this.phase}, ${event.type}.`);
      return;
    }
    this.phase = destination(event);
    this.value = reduceContext(this.value, event);

    this.notify(this.listeners, nativeEvent(event));
    this.notify(this.contexts, { context: this.context });
  }

  private reset(): void {
    this.phase = 'idle';
    this.value = { ...initialContext(), restartCount: this.value.restartCount + 1, sequenceNumber: this.value.sequenceNumber + 1 };
    this.notify(this.contexts, { context: this.context });
  }

  private cancelRestart(): void {
    if (this.phase !== 'restarting') throw new ExpoUpdatesError('ERR_UPDATES_PROCEDURE', 'Only a pending restart can be cancelled.');

    // RNOH can reject before destroying the current runtime; preserve its pending update and retry route.
    this.phase = 'idle';
    this.value = { ...this.value, isRestarting: false, sequenceNumber: this.value.sequenceNumber + 1 };
    this.notify(this.contexts, { context: this.context });
  }
}
