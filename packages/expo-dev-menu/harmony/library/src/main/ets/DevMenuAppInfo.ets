import { bundleManager } from '@kit.AbilityKit';
import { DrawableDescriptor } from '@kit.ArkUI';
import { util } from '@kit.ArkTS';
import { RNOHCoreContext } from '@rnoh/react-native-openharmony';

const APP_CONFIG_RAW_FILE: string = 'app.config';

export interface DevMenuAppInfoProvider {
  getDevMenuAppInfo(): DevMenuAppMetadata;
}

export class DevMenuAppMetadata {
  appName?: string;
  appVersion?: string;
  runtimeVersion?: string;
  sdkVersion?: string;
  localBundlePath?: string;
  engine?: string;
}

export class DevMenuAppInfo extends DevMenuAppMetadata {
  hostUrl: string = '';
  icon?: DrawableDescriptor;

  serialize(): string {
    const result: Record<string, ESObject> = {};
    result.appName = this.appName ?? null;
    result.appVersion = this.appVersion ?? null;
    result.runtimeVersion = this.runtimeVersion ?? null;
    result.sdkVersion = this.sdkVersion ?? null;
    result.hostUrl = this.hostUrl;
    result.engine = this.engine ?? null;

    return JSON.stringify(result, null, 2);
  }
}

export function readDevMenuAppInfo(core: RNOHCoreContext, bundleUrl: string, provider?: DevMenuAppInfoProvider): DevMenuAppInfo {
  const result = new DevMenuAppInfo();
  result.hostUrl = bundleUrl;

  const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
  result.appName = info.name;
  result.appVersion = info.versionName;
  if (info.appInfo.labelId > 0) {
    try {
      result.appName = core.uiAbilityContext.resourceManager.getStringSync(info.appInfo.labelId);
    } catch (error) {
      core.logger.warn(`Unable to resolve Dev Menu app label: ${String(error)}`);
    }
  }
  if (info.appInfo.iconId > 0) {
    try {
      result.icon = core.uiAbilityContext.resourceManager.getDrawableDescriptor(info.appInfo.iconId);
    } catch (error) {
      core.logger.warn(`Unable to resolve Dev Menu app icon: ${String(error)}`);
    }
  }
  if (provider !== undefined) {
    const metadata = provider.getDevMenuAppInfo();
    result.appName = metadata.appName ?? result.appName;
    result.appVersion = metadata.appVersion ?? result.appVersion;
    result.runtimeVersion = metadata.runtimeVersion;
    result.sdkVersion = metadata.sdkVersion;
    result.localBundlePath = metadata.localBundlePath;
    result.engine = metadata.engine;
  } else {
    const resources = core.uiAbilityContext.resourceManager;
    if (resources.getRawFileListSync('').includes(APP_CONFIG_RAW_FILE)) {
      const parsed: ESObject = JSON.parse(util.TextDecoder.create('utf-8').decodeToString(resources.getRawFileContentSync(APP_CONFIG_RAW_FILE)));
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const config = parsed as Record<string, ESObject>;
        if (typeof config.runtimeVersion === 'string') result.runtimeVersion = config.runtimeVersion;
        if (typeof config.sdkVersion === 'string') result.sdkVersion = config.sdkVersion;
      }
    }
  }

  return result;
}
