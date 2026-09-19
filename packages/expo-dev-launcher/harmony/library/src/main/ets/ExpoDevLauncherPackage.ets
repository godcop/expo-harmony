import { bundleManager } from '@kit.AbilityKit';
import { RNOHPackage, UITurboModule, UITurboModuleContext } from '@rnoh/react-native-openharmony';
import type { RNPackageContext } from '@rnoh/react-native-openharmony';
import { EXDevLauncherTurboModule } from './EXDevLauncherTurboModule';

export class ExpoDevLauncherPackage extends RNOHPackage {
  constructor(context: RNPackageContext) {
    super(context);
  }

  override getUITurboModuleFactoryByNameMap(): Map<string, (context: UITurboModuleContext) => UITurboModule | null> {
    const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    if (!info.appInfo.debug) return new Map<string, (context: UITurboModuleContext) => UITurboModule | null>();
    return new Map<string, (context: UITurboModuleContext) => UITurboModule | null>().set(
      EXDevLauncherTurboModule.NAME,
      (context: UITurboModuleContext): UITurboModule => new EXDevLauncherTurboModule(context),
    );
  }

  override getDebugName(): string {
    return '@expo-harmony/expo-dev-launcher';
  }
}
