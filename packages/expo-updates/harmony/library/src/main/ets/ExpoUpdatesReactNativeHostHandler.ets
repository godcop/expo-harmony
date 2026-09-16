import type { common } from '@kit.AbilityKit';
import { ReactNativeHostHandler } from '@expo-harmony/expo-modules-core';
import type { RNInstance } from '@rnoh/react-native-openharmony';
import { UpdatesController } from './UpdatesController';

export class ExpoUpdatesReactNativeHostHandler implements ReactNativeHostHandler {
  private readonly context: common.ApplicationContext;

  constructor(context: common.Context) {
    this.context = context.getApplicationContext();
  }

  onWillCreateReactInstance(debug: boolean): void {
    UpdatesController.initialize(this.context, debug);
  }

  getUseDeveloperSupport(): boolean | undefined {
    return UpdatesController.get(this.context).configuration.debug ? false : undefined;
  }

  async getJSBundleFile(_debug: boolean): Promise<string | undefined> {
    await UpdatesController.get(this.context).ready;
    const controller = UpdatesController.get(this.context);
    return controller.active ? (controller.path ?? undefined) : undefined;
  }

  async getBundleAssetName(_debug: boolean): Promise<string | undefined> {
    await UpdatesController.get(this.context).ready;
    const controller = UpdatesController.get(this.context);
    return controller.active && controller.path === null ? controller.embedded?.assets.find((asset) => asset.launch)?.embedded : undefined;
  }

  onDidCreateReactInstance(_debug: boolean, instance: RNInstance): void {
    UpdatesController.get(this.context).loaded(instance.getId());
  }

  get onReactInstanceException(): ((_debug: boolean, instance: RNInstance, error: Error) => void) | undefined {
    const controller = UpdatesController.get(this.context);
    if (!controller.active) return undefined;
    return (_debug: boolean, instance: RNInstance, error: Error): void =>
      UpdatesController.get(this.context).onReactInstanceException(instance.getId(), error);
  }
}
