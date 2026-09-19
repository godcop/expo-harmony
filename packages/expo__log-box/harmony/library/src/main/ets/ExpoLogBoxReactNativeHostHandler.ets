import type { common } from '@kit.AbilityKit';
import { bundleManager } from '@kit.AbilityKit';
import type { DevToolsController } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/DevToolsController';
import type { ReactNativeHostHandler } from '@expo-harmony/expo-modules-core';

import { expoLogBoxController } from './ExpoLogBoxController';

export class ExpoLogBoxReactNativeHostHandler implements ReactNativeHostHandler {
  private readonly enabled: boolean;

  constructor(_context: common.Context) {
    const info = bundleManager.getBundleInfoForSelfSync(
      bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION |
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_HAP_MODULE |
        bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_METADATA,
    );
    this.enabled =
      info.appInfo.debug &&
      info.hapModulesInfo.some(
        (module): boolean => module.metadata?.some((entry): boolean => entry.name === 'expo.logBox.enabled' && entry.value === 'true') === true,
      );
  }

  onWillCreateReactInstance(debug: boolean): void {
    expoLogBoxController.setEnabled(debug && this.enabled);
  }

  onDidCreateDevSupportManager(manager: DevToolsController): void {
    expoLogBoxController.attachDevTools(manager);
  }
}
