import { window } from '@kit.ArkUI';
import { ExpoAppLifecycleState, ExpoModule, ExpoModuleDefinition, ExpoModuleError } from '@expo-harmony/expo-modules-core';

const SCREENSHOT_EVENT: string = 'onScreenshot';

export class ExpoScreenCaptureModule extends ExpoModule {
  private pending: Promise<void> = Promise.resolve();
  private readonly windows: Map<number, window.Window> = new Map<number, window.Window>();
  private observer: window.Window | null = null;
  private protecting: boolean = false;
  private listening: boolean = false;
  private destroyed: boolean = false;
  private available: boolean = true;
  private generation: number = 0;

  private readonly onScreenshot = (): void => {
    if (this.shouldObserve()) this.sendEvent(SCREENSHOT_EVENT);
  };

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoScreenCapture')
      .events([SCREENSHOT_EVENT])
      .asyncFunction('preventScreenCapture', async (): Promise<void> => this.setPrivacy(true))
      .asyncFunction('allowScreenCapture', async (): Promise<void> => this.setPrivacy(false))
      .onStartObserving(SCREENSHOT_EVENT, (): void => {
        this.listening = true;
        this.refresh();
      })
      .onStopObserving(SCREENSHOT_EVENT, (): void => {
        this.listening = false;
        this.stopObserving();
      })
      .onForeground((): void => this.refresh())
      .onBackground((): void => this.stopObserving())
      .onContentAppeared((): void => this.refresh())
      .onWindowStageSetup((): void => {
        this.available = true;
        this.refresh();
      })
      .onWindowStageWillDestroy((): void => {
        this.available = false;
        this.generation += 1;

        this.stopObserving();
        // The system owns destruction of the stage's windows and their privacy flags.
        this.observer = null;
        this.windows.clear();
      })
      .onPrepareForReload(async (): Promise<void> => this.destroy())
      .onDestroy((): void => {
        this.destroy().catch((error: Object): void => this.warn('release screen-capture protection', error));
      });
  }

  private setPrivacy(enabled: boolean): Promise<void> {
    return this.serialize(async (): Promise<void> => {
      const target: window.Window = await this.currentWindow();
      await this.applyPrivacy(target, enabled);
    });
  }

  private async currentWindow(): Promise<window.Window> {
    this.assertActive();

    if (this.context.isHeadless || !this.available) {
      throw new ExpoModuleError('ERR_SCREEN_CAPTURE_WINDOW', 'Screen capture requires a UIAbility window.');
    }

    const generation: number = this.generation;
    const target: window.Window = await this.context.getReactNativeWindow();

    this.assertActive();
    if (!this.available || generation !== this.generation) {
      throw new ExpoModuleError('ERR_SCREEN_CAPTURE_WINDOW', 'The React Native window is no longer available.');
    }

    return target;
  }

  private async applyPrivacy(target: window.Window, enabled: boolean): Promise<void> {
    const generation: number = this.generation;
    const id: number = target.getWindowProperties().id;

    // Retain the window before awaiting so teardown can release an in-flight successful operation.
    if (enabled) this.windows.set(id, target);
    await target.setWindowPrivacyMode(enabled);

    this.assertActive();
    if (!this.available || generation !== this.generation) {
      throw new ExpoModuleError('ERR_SCREEN_CAPTURE_WINDOW', 'The React Native window changed during the privacy operation.');
    }

    this.protecting = enabled;
    if (!enabled) this.windows.delete(id);

    await this.releaseWindows(enabled ? id : undefined);
  }

  private async releaseWindows(except?: number): Promise<void> {
    let failure: string | undefined;

    for (const id of this.windows.keys()) {
      if (id === except) continue;
      const target: window.Window = this.windows.get(id)!;

      try {
        await target.setWindowPrivacyMode(false);
        this.windows.delete(id);
      } catch (error) {
        failure = (error as Error).message ?? String(error);
      }
    }

    if (failure !== undefined) {
      throw new ExpoModuleError('ERR_SCREEN_CAPTURE_RELEASE', `Unable to release window privacy mode: ${failure}`);
    }
  }

  private refresh(): void {
    if (this.destroyed || !this.available || this.context.isHeadless || (!this.protecting && !this.shouldObserve() && this.windows.size === 0))
      return;

    this.serialize(async (): Promise<void> => {
      if (this.destroyed || !this.available) return;

      const generation: number = this.generation;
      const target: window.Window = await this.currentWindow();

      if (this.protecting) await this.applyPrivacy(target, true);
      else await this.releaseWindows();

      if (this.destroyed || !this.available || generation !== this.generation) return;
      if (!this.shouldObserve()) return;

      const id: number = target.getWindowProperties().id;
      if (this.observer?.getWindowProperties().id === id) return;

      this.detachObserver();
      target.on('screenshot', this.onScreenshot);
      this.observer = target;
    }).catch((error: Object): void => this.warn('refresh screen-capture state', error));
  }

  private shouldObserve(): boolean {
    return (
      !this.destroyed &&
      this.available &&
      this.listening &&
      this.context.isValid &&
      !this.context.isHeadless &&
      this.context.appLifecycleState === ExpoAppLifecycleState.FOREGROUND
    );
  }

  private detachObserver(): void {
    if (this.observer === null) return;

    this.observer.off('screenshot', this.onScreenshot);
    this.observer = null;
  }

  private stopObserving(): void {
    try {
      this.detachObserver();
    } catch (error) {
      this.warn('detach the screenshot listener', error);
    }
  }

  private destroy(): Promise<void> {
    this.destroyed = true;
    this.listening = false;
    this.protecting = false;

    // Serialize after pending setters: a late completion cannot re-enable a released window.
    return this.serialize(async (): Promise<void> => {
      let failure: string | undefined;

      try {
        this.detachObserver();
      } catch (error) {
        failure = (error as Error).message ?? String(error);
      }

      await this.releaseWindows();

      if (failure !== undefined) {
        throw new ExpoModuleError('ERR_SCREEN_CAPTURE_OBSERVER', `Unable to detach the screenshot listener: ${failure}`);
      }
    });
  }

  private serialize(task: () => Promise<void>): Promise<void> {
    const next: Promise<void> = this.pending.then(task);
    this.pending = next.then(
      (): void => {},
      (): void => {},
    );

    return next;
  }

  private assertActive(): void {
    if (this.destroyed || !this.context.isValid) {
      throw new ExpoModuleError('ERR_SCREEN_CAPTURE_DESTROYED', 'The Expo ScreenCapture runtime has been destroyed.');
    }
  }

  private warn(action: string, error: Object): void {
    console.warn(`Unable to ${action}: ${(error as Error).message ?? String(error)}`);
  }
}
