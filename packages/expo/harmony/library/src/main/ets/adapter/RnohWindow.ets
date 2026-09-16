import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { window } from '@kit.ArkUI';

export function adaptRnohWindow(view: window.Window, closing: () => boolean): () => void {
  const target: ESObject = view;
  const off: ESObject = target.off;
  const detach = (...args: ESObject[]): void => {
    if (!closing()) {
      off.apply(target, args);
      return;
    }

    try {
      off.apply(target, args);
    } catch (error) {
      // RNOH 0.84.1 removes module listeners after Ability destruction has invalidated the window.
      if (error?.code !== 1300002)
        throw new ExpoModuleError('ERR_RNOH_WINDOW_LISTENER', 'Unable to remove the RNOH window listener.', error as Object);
    }
  };
  target.off = detach;

  return (): void => {
    if (target.off === detach) target.off = off;
  };
}
