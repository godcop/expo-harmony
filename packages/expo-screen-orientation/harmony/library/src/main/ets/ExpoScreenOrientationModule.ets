import { window } from '@kit.ArkUI';
import { ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoModuleError, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import {
  fromPreferredOrientation,
  readOrientation,
  requirePlatformOrientation,
  supportsOrientationLock,
  toPreferredOrientation,
} from './ScreenOrientation';

export class ExpoScreenOrientationModule extends ExpoModule {
  private pending: Promise<void> = Promise.resolve();
  private cleanup: Promise<void> | null = null;
  private destroyed: boolean = false;
  private available: boolean = true;
  private generation: number = 0;
  private readonly initials: Map<window.Window, window.Orientation> = new Map();

  definition(): ExpoModuleDefinition {
    return (
      new ExpoModuleDefinition()
        .name('ExpoScreenOrientation')
        // The official JS receives events from RN Dimensions, not this emitter.
        .events(['expoDidUpdateDimensions'])
        .asyncFunction(
          'lockAsync',
          ExpoFunction.typed1(ExpoValueTypes.number(), async (value: number): Promise<void> => {
            await this.setOrientation(toPreferredOrientation(value));
          }),
        )
        .asyncFunction(
          'lockPlatformAsync',
          ExpoFunction.typed1(ExpoValueTypes.number(), async (value: number): Promise<void> => {
            await this.setOrientation(requirePlatformOrientation(value));
          }),
        )
        .asyncFunction('getOrientationAsync', async (): Promise<number> => {
          return this.useWindow(async (win: window.Window): Promise<number> => readOrientation(win));
        })
        .asyncFunction('getOrientationLockAsync', async (): Promise<number> => {
          return this.useWindow(async (win: window.Window): Promise<number> => fromPreferredOrientation(win.getPreferredOrientation()));
        })
        .asyncFunction('getPlatformOrientationLockAsync', async (): Promise<number> => {
          return this.useWindow(async (win: window.Window): Promise<number> => win.getPreferredOrientation());
        })
        .asyncFunction(
          'supportsOrientationLockAsync',
          ExpoFunction.typed1(ExpoValueTypes.number(), async (value: number): Promise<boolean> => {
            this.assertActive();

            return supportsOrientationLock(value);
          }),
        )
        .onWindowStageSetup((): void => {
          this.available = true;
        })
        .onWindowStageWillDestroy((): void => {
          this.available = false;
          this.generation += 1;

          this.initials.clear();
        })
        .onPrepareForReload(async (): Promise<void> => this.destroy())
        .onAbilityDestroy((): void => this.destroyInBackground())
        .onDestroy((): void => this.destroyInBackground())
    );
  }

  private setOrientation(orientation: window.Orientation): Promise<void> {
    return this.useWindow(async (win: window.Window): Promise<void> => {
      if (!this.initials.has(win)) {
        this.initials.set(win, win.getPreferredOrientation());
      }

      await win.setPreferredOrientation(orientation);
    });
  }

  private useWindow<T>(task: (win: window.Window) => Promise<T>): Promise<T> {
    const generation = this.generation;

    return this.serialize(async (): Promise<T> => {
      this.assertWindowAvailable(generation);

      const win = await this.context.getReactNativeWindow();
      this.assertWindowAvailable(generation);

      const result = await task(win);
      this.assertWindowAvailable(generation);

      return result;
    });
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pending.then(task);
    this.pending = next.then(
      (): void => {},
      (): void => {},
    );

    return next;
  }

  private assertActive(): void {
    if (this.destroyed || !this.context.isValid) {
      throw new ExpoModuleError('ERR_SCREEN_ORIENTATION_DESTROYED', 'The Expo ScreenOrientation runtime has been destroyed.');
    }
  }

  private assertWindowAvailable(generation: number): void {
    this.assertActive();

    if (this.context.isHeadless || !this.available || generation !== this.generation) {
      throw new ExpoModuleError('ERR_SCREEN_ORIENTATION_WINDOW', 'Screen orientation requires a current UIAbility window.');
    }
  }

  private destroyInBackground(): void {
    this.destroy().catch((error: Object): void => {
      console.warn(`Unable to restore the Expo ScreenOrientation window policy: ${String(error)}`);
    });
  }

  private destroy(): Promise<void> {
    if (this.cleanup !== null) return this.cleanup;

    this.destroyed = true;

    // Restore after in-flight setters; Core awaits this queue during reload.
    this.cleanup = this.serialize(async (): Promise<void> => {
      let failure: Object | undefined;

      for (const entry of this.initials) {
        try {
          await entry[0].setPreferredOrientation(entry[1]);
        } catch (error) {
          failure = error;
        }
      }

      this.initials.clear();

      if (failure !== undefined) {
        throw new ExpoModuleError('ERR_SCREEN_ORIENTATION_RESTORE', `Unable to restore the initial window orientation: ${String(failure)}`);
      }
    });

    return this.cleanup;
  }
}
