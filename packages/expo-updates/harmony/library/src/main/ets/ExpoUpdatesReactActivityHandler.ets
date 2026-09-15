import type { common } from '@kit.AbilityKit';
import type { ReactActivityHandler, ReactRootViewContext } from '@expo-harmony/expo-modules-core';
import { UpdatesController } from './UpdatesController';

export class ExpoUpdatesReactActivityHandler implements ReactActivityHandler {
  private readonly context: common.ApplicationContext;

  constructor(context: common.Context) { this.context = context.getApplicationContext(); }

  getDelayLoadAppHandler(_context: ReactRootViewContext): Promise<void> | undefined {
    const controller = UpdatesController.get(this.context);
    return controller.active ? controller.ready : undefined;
  }
}
