import uri from '@ohos.uri';
import type { Want, common } from '@kit.AbilityKit';
import { bundleManager } from '@kit.AbilityKit';
import { ExpoAbilityLifecycleSubscriber } from '@expo-harmony/expo-modules-core';
import { DevLauncherController } from './DevLauncherController';
import { DEEP_LINK_SCHEME, EXPO_DEV_CLIENT_HOST } from './DevLauncherProtocol';

export class ExpoDevLauncherLifecycleSubscriber extends ExpoAbilityLifecycleSubscriber {
  private readonly controller: DevLauncherController;
  private readonly debug: boolean;

  constructor(context: common.UIAbilityContext) {
    super(context);
    this.debug = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION).appInfo.debug;
    this.controller = DevLauncherController.get(context.getApplicationContext());
    this.controller.attachAbility(context);
  }

  override onWillReceiveWant(want: Want): void {
    this.receive(want);
  }
  override onForeground(): void {
    this.controller.foreground();
  }
  override onDidForeground(): void {
    this.controller.foreground();
  }
  override onBackground(): void {
    this.controller.background();
  }
  override onDidBackground(): void {
    this.controller.background();
  }
  override onDestroy(): void {
    this.controller.detachAbility(this.context);
  }

  private receive(want: Want): void {
    if (!this.debug) return;

    const value = want.uri;
    if (value === undefined || value.length === 0) return;
    try {
      const parsed = new uri.URI(value);
      if ((parsed.scheme ?? '').toLowerCase() === DEEP_LINK_SCHEME || (parsed.host ?? '').toLowerCase() === EXPO_DEV_CLIENT_HOST) {
        this.controller.receiveLink(value);
        // This URI selects a runtime; it is not a route in the selected app.
        want.uri = undefined;
      }
    } catch (_) {}
  }
}
