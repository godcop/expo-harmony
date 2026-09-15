import { RNInstance, RNInstanceImpl } from '@rnoh/react-native-openharmony/ts';

interface Destruction {
  before: Set<() => Promise<void>>;
  after: Set<() => void>;
  pending?: Promise<void>;
  finished: boolean;
}

const instances = new WeakMap<RNInstance, Destruction>();

function destruction(instance: RNInstance): Destruction {
  const existing = instances.get(instance);
  if (existing !== undefined) return existing;
  if (!(instance instanceof RNInstanceImpl)) {
    throw new Error('Expo Modules requires an RNInstanceImpl destruction lifecycle.');
  }

  const state: Destruction = { before: new Set(), after: new Set(), finished: false };
  const destroy = instance.onDestroy.bind(instance);
  // RNOH 0.84.1 has no awaited pre-destroy hook or destruction notification.
  // Keep the native route alive through the barrier and notify only after onDestroy completes.
  instance.onDestroy = (disconnect: boolean = true): Promise<void> => {
    if (state.pending === undefined) {
      state.pending = Promise.resolve().then(async (): Promise<void> => {
        for (const before of state.before) await before();
        await destroy(disconnect);
        state.finished = true;
        state.before.clear();
        for (const after of Array.from(state.after)) {
          if (!state.after.has(after)) continue;
          try { after(); }
          catch (error) { console.error(`React runtime destruction subscriber failed: ${String(error)}`); }
        }
        state.after.clear();
      });
    }
    return state.pending;
  };
  instances.set(instance, state);

  return state;
}

export function installRnohDestroyBarrier(instance: RNInstance, beforeDestroy: () => Promise<void>): void {
  const state = destruction(instance);
  if (state.pending !== undefined) throw new Error('Cannot register a destruction barrier after runtime teardown has started.');
  state.before.add(beforeDestroy);
}

export function observeRnohDestroy(instance: RNInstance, listener: () => void): () => void {
  const state = destruction(instance);
  if (state.finished) {
    listener();
    return (): void => {};
  }
  const callback = (): void => listener();
  state.after.add(callback);

  return (): void => { state.after.delete(callback); };
}
