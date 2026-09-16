import { RNInstance, RNOHErrorStack } from '@rnoh/react-native-openharmony';
import { ExpoModuleError, observeRnohDestroy } from '@expo-harmony/expo-modules-core';
import { EXPO_RUNTIME_OBSERVE, EXPO_RUNTIME_UNOBSERVE, EXPO_RUNTIME_OBSERVED, EXPO_RUNTIME_ERROR } from './Protocol';

const timeoutMs = 10000;

export class ExpoRuntimeErrors {
  private static sequence = 0;

  static async observe(instance: RNInstance, listener: (error: Error) => void): Promise<() => void> {
    const id = `${instance.getId()}:${++ExpoRuntimeErrors.sequence}`;
    let active = true;
    let destroyed = false;
    let detached: (() => void) | undefined;
    let cancel: ((error: ExpoModuleError) => void) | undefined;
    const failed = instance.cppEventEmitter.subscribe(EXPO_RUNTIME_ERROR, (event: Record<string, ESObject>): void => {
      if (!active || event.observer !== id) return;
      try {
        const error = new Error(event.message);
        if (typeof event.stack === 'string') error.stack = event.stack;
        else if (Array.isArray(event.stack)) error.stack = `${error.message}\n${new RNOHErrorStack(event.stack).toString()}`;
        listener(error);
      } catch (error) {
        console.error(`React runtime error subscriber failed: ${String(error)}`);
      }
    });
    const remove = (): void => {
      if (!active) return;

      active = false;
      failed();
      detached?.();
      if (destroyed) return;

      try {
        instance.postMessageToCpp(EXPO_RUNTIME_UNOBSERVE, { observer: id });
      } catch (error) {
        console.error(`Unable to detach a React runtime error subscriber: ${String(error)}`);
      }
    };

    try {
      detached = observeRnohDestroy(instance, (): void => {
        destroyed = true;
        remove();
        cancel?.(new ExpoModuleError('ERR_RUNTIME_OBSERVER', 'The React runtime was destroyed while registering its error observer.'));
      });
      if (destroyed) throw new ExpoModuleError('ERR_RUNTIME_OBSERVER', 'Cannot observe a destroyed React runtime.');

      await new Promise<void>((resolve, reject): void => {
        let received: () => void = (): void => {};
        let settled = false;
        const finish = (error?: ExpoModuleError): void => {
          if (settled) return;

          settled = true;
          clearTimeout(timer);
          received();
          cancel = undefined;
          if (error !== undefined) reject(error);
          else resolve();
        };
        const timer = setTimeout((): void => {
          finish(new ExpoModuleError('ERR_RUNTIME_OBSERVER', 'Timed out registering a React runtime error observer.'));
        }, timeoutMs);
        cancel = (error: ExpoModuleError): void => finish(error);
        received = instance.cppEventEmitter.subscribe(EXPO_RUNTIME_OBSERVED, (event: Record<string, ESObject>): void => {
          if (event.observer !== id) return;
          finish(typeof event.error === 'string' ? new ExpoModuleError('ERR_RUNTIME_OBSERVER', event.error) : undefined);
        });

        try {
          instance.postMessageToCpp(EXPO_RUNTIME_OBSERVE, { observer: id });
        } catch (error) {
          finish(new ExpoModuleError('ERR_RUNTIME_OBSERVER', 'Unable to register a React runtime error observer.', error as Object));
        }
      });
      if (destroyed) throw new ExpoModuleError('ERR_RUNTIME_OBSERVER', 'The React runtime was destroyed during observer registration.');

      return remove;
    } catch (error) {
      remove();
      throw new ExpoModuleError('ERR_RUNTIME_OBSERVER', 'Unable to observe React runtime errors.', error as Object);
    }
  }
}
