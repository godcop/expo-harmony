import type { common } from '@kit.AbilityKit';
import type { DevToolsController } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/DevToolsController';
import type { JSBundleProvider, RNInstance } from '@rnoh/react-native-openharmony';
import type { ReactNativeHostHandler } from '@expo-harmony/expo-modules-core';
import { DevLauncherController } from './DevLauncherController';

export class ExpoDevLauncherReactNativeHostHandler implements ReactNativeHostHandler {
  private readonly controller: DevLauncherController;

  constructor(context: common.Context) {
    this.controller = DevLauncherController.get(context.getApplicationContext());
  }

  onWillCreateReactInstance(debug: boolean): void {
    this.controller.activate(debug);
  }

  getUseDeveloperSupport(): boolean | undefined {
    return this.controller.useDeveloperSupport;
  }

  async getJSBundleProvider(_debug: boolean): Promise<JSBundleProvider | undefined> {
    if (!this.controller.enabled) return undefined;
    this.controller.connectUpdates();
    await this.controller.ready;
    return this.controller.selectedProvider;
  }

  onDidCreateDevSupportManager(manager: DevToolsController): void {
    this.controller.setDevToolsManager(manager);
  }

  get onReactInstanceException(): ((_debug: boolean, instance: RNInstance, error: Error) => void) | undefined {
    if (!this.controller.enabled) return undefined;
    return (_debug: boolean, _instance: RNInstance, error: Error): void => this.controller.reportReactError(error);
  }
}
