import type { common } from '@kit.AbilityKit';
import type { ReactActivityHandler, ReactRootViewBuilder, ReactRootViewContext } from '@expo-harmony/expo-modules-core';
import { DevLauncherController } from './DevLauncherController';
import { buildExpoDevLauncherRoot } from './ExpoDevLauncherView';

export class ExpoDevLauncherReactActivityHandler implements ReactActivityHandler {
  private readonly controller: DevLauncherController;

  constructor(context: common.Context) {
    this.controller = DevLauncherController.get(context.getApplicationContext());
  }

  createReactRootViewContainer(_context: ReactRootViewContext): ReactRootViewBuilder | undefined {
    return this.controller.enabled ? wrapBuilder(buildExpoDevLauncherRoot) : undefined;
  }

  getDelayLoadAppHandler(_context: ReactRootViewContext): Promise<void> | undefined {
    if (!this.controller.enabled) return undefined;
    this.controller.startInitialSelection();
    return this.controller.ready;
  }
}
