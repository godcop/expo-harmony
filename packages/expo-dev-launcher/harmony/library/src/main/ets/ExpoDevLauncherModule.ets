import { ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import { DevLauncherController } from './DevLauncherController';

export class ExpoDevLauncherModule extends ExpoModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition().name('ExpoDevLauncher').asyncFunction(
      'loadApp',
      ExpoFunction.typed1(ExpoValueTypes.string(), async (url: string): Promise<void> => {
        const controller = DevLauncherController.get(this.context.uiAbilityContext.getApplicationContext());
        if (controller.enabled) await controller.load(url);
      }),
    );
  }
}
