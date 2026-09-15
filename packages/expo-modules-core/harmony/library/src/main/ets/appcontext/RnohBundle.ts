import { RNInstance } from '@rnoh/react-native-openharmony/ts';
import { EXPO_BUNDLE_WAIT, EXPO_BUNDLE_CANCEL, EXPO_BUNDLE_READY } from '../protocol/Protocol';
import { observeRnohDestroy } from './RnohDestroyAdapter';

let sequence = 0;

function sameBundle(left: BundleProvider, right: BundleProvider): boolean {
  if (left === right) return true;
  try {
    const leftUrl = left.getURL();
    const rightUrl = right.getURL();
    return typeof leftUrl === 'string' && leftUrl.length > 0 && leftUrl === rightUrl;
  } catch (_error) {
    return false;
  }
}
type BundleProvider = { getURL(): string; };

interface BundleCompletion {
  initialization: Promise<void>;
  completion: Promise<void>;
  loaded: boolean;
  failed: boolean;
  fail(error: Error): void;
}
const bundles = new WeakMap<RNInstance, BundleCompletion>();

export function waitForRnohBundle(instance: RNInstance): Promise<void> {
  return bundles.get(instance)?.completion ?? Promise.reject(new Error('Install the React bundle lifecycle before loading the runtime.'));
}

export function waitForRnohInitialization(instance: RNInstance): Promise<void> {
  return bundles.get(instance)?.initialization ?? Promise.reject(new Error('Install the React bundle lifecycle before initializing the runtime.'));
}

export function hasLoadedRnohBundle(instance: RNInstance): boolean {
  return bundles.get(instance)?.loaded === true;
}

export function reportRnohBundleError(instance: RNInstance, error: Error): void {
  bundles.get(instance)?.fail(error);
}

export function installRnohBundleBarrier(instance: RNInstance): void {
  if (bundles.has(instance)) return;

  let finish: () => void = () => {};
  let reject: (error: Error) => void = () => {};
  const failure = new Promise<void>((_resolve, failure) => { reject = failure; });
  const completion = Promise.race([new Promise<void>(resolve => { finish = resolve; }), failure]);
  let initialized: () => void = () => {};
  let unavailable: (error: Error) => void = () => {};
  const initialization = new Promise<void>((resolve, reject) => { initialized = resolve; unavailable = reject; });
  const fail = (error: Error): void => {
    if (!bundle.loaded) { bundle.failed = true; reject(error); unavailable(error); }
  };
  const bundle: BundleCompletion = { initialization, completion, loaded: false, failed: false, fail };
  completion.catch(() => {});
  bundles.set(instance, bundle);
  const created = instance.subscribeToLifecycleEvents('JS_BUNDLE_EXECUTION_FINISH', initialized);
  initialization.then(created, created);
  const url = instance.getInitialBundleUrl();
  if (url !== undefined && instance.getBundleExecutionStatus(url) === 'DONE') initialized();
  const detached = observeRnohDestroy(instance, () => fail(new Error('The React runtime was destroyed before its first bundle completed.')));
  completion.then(detached, detached);

  const run = instance.runJSBundle.bind(instance);
  let tail: Promise<void> = Promise.resolve();
  let first: { provider: BundleProvider; promise: Promise<void> } | undefined;
  instance.runJSBundle = provider => {
    if (!bundle.loaded && !bundle.failed && first !== undefined && sameBundle(first.provider, provider)) {
      return first.promise;
    }

    const pending = tail.then(async () => {
      if (bundle.failed) return completion;
      if (bundle.loaded) return run(provider);

      const request = `${instance.getId()}:${++sequence}`;
      let resolve: () => void = () => {};
      let reject: (error: Error) => void = () => {};
      const ready = new Promise<void>((success, failure) => { resolve = success; reject = failure; });
      ready.catch(() => {});
      const received = instance.cppEventEmitter.subscribe(EXPO_BUNDLE_READY, event => {
        if ((event as { request?: string }).request === request) resolve();
      });
      const failed = instance.subscribeToRNOHErrors(error => {
        const failure = new Error(error.getMessage());
        const stack = error.getStack()?.toString();
        if (stack) failure.stack = `${failure.message}\n${stack}`;
        fail(failure);
      });
      let alive = true;
      const destroyed = observeRnohDestroy(instance, () => {
        alive = false;
        reject(new Error('The React runtime was destroyed while loading its first bundle.'));
      });

      try {
        instance.postMessageToCpp(EXPO_BUNDLE_WAIT, { request });
        await Promise.race([Promise.all([run(provider), ready]), failure]);
        bundle.loaded = true;
        finish();
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return completion;
      } finally {
        received();
        failed();
        destroyed();
        if (alive) {
          try { instance.postMessageToCpp(EXPO_BUNDLE_CANCEL, { request }); }
          catch (error) { console.error(`Unable to cancel the bundle completion listener: ${String(error)}`); }
        }
      }
    });
    if (!bundle.loaded && !bundle.failed && first === undefined) {
      first = { provider, promise: pending };
      const clear = (): void => { if (first?.promise === pending) first = undefined; };
      pending.then(clear, clear);
    }
    tail = pending.catch(() => {});

    return pending;
  };
}
