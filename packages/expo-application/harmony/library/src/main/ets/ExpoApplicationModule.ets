import { ExpoModule, ExpoModuleContext, ExpoModuleDefinition, ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { bundleManager } from '@kit.AbilityKit';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';

const RESOURCE_INVALID_ID: number = 9001001;
const RESOURCE_NOT_FOUND: number = 9001002;
const MAX_ECMASCRIPT_TIMESTAMP: number = 8_640_000_000_000_000;

export class ExpoApplicationModule extends ExpoModule {
  private cache?: bundleManager.BundleInfo = undefined;
  private pending?: Promise<bundleManager.BundleInfo> = undefined;

  constructor(context: ExpoModuleContext) {
    super(context);
  }

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoApplication')
      .constant('applicationName', (): string | null => {
        const info = this.readConstantInfo();
        return info === undefined ? null : resolveApplicationName(this.context, info);
      })
      .constant('applicationId', (): string | null => nonEmptyOrNull(this.readConstantInfo()?.name))
      .constant('nativeApplicationVersion', (): string | null => nonEmptyOrNull(this.readConstantInfo()?.versionName))
      .constant('nativeBuildVersion', (): string | null => {
        const code = this.readConstantInfo()?.versionCode;
        return code !== undefined && Number.isSafeInteger(code) ? String(code) : null;
      })
      .asyncFunction('getInstallationTimeAsync', async (): Promise<number> => {
        const info = await this.readBundleInfo('ERR_APPLICATION_INSTALLATION_TIME', 'installation time');
        return installationTime(info);
      })
      .asyncFunction('getLastUpdateTimeAsync', async (): Promise<number> => {
        const info = await this.readBundleInfo('ERR_APPLICATION_LAST_UPDATE_TIME', 'last update time');
        return checkedTimestamp(info.updateTime, 'last update', 'ERR_APPLICATION_LAST_UPDATE_TIME');
      });
  }

  private readConstantInfo(): bundleManager.BundleInfo | undefined {
    if (this.cache !== undefined) return this.cache;

    try {
      this.cache = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);

      return this.cache;
    } catch (error) {
      this.context.logger.warn(`Unable to read the running Harmony application's constants: ${String(error)}`);

      return undefined;
    }
  }

  private async readBundleInfo(code: string, label: string): Promise<bundleManager.BundleInfo> {
    try {
      if (this.pending === undefined) {
        this.pending = bundleManager.getBundleInfoForSelf(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
      }

      return await this.pending;
    } catch (error) {
      throw new ExpoModuleError(code, `Unable to read the running Harmony application's ${label}: ${String(error)}`, error as Object);
    } finally {
      this.pending = undefined;
    }
  }
}

function nonEmptyOrNull(value: string | undefined): string | null {
  return value !== undefined && value.length > 0 ? value : null;
}

function installationTime(info: bundleManager.BundleInfo): number {
  let time: number = info.installTime;

  // Keep the SDK check separate so ArkTS recognizes the API 18 guard.
  if (deviceInfo.sdkApiVersion >= 18) {
    if (info.firstInstallTime !== undefined) {
      time = info.firstInstallTime;
    }
  }

  return checkedTimestamp(time, 'installation', 'ERR_APPLICATION_INSTALLATION_TIME');
}

function checkedTimestamp(time: number, kind: string, code: string): number {
  if (!Number.isSafeInteger(time) || time < 0 || time > MAX_ECMASCRIPT_TIMESTAMP) {
    throw new ExpoModuleError(code, `Harmony returned an invalid ${kind} timestamp.`);
  }

  return time;
}

function literalApplicationLabel(label: string): string | null {
  return label.length === 0 || /^\$string:[A-Za-z_][A-Za-z0-9_]*$/.test(label) ? null : label;
}

function resolveApplicationName(context: ExpoModuleContext, info: bundleManager.BundleInfo): string | null {
  const ability = context.uiAbilityContext;
  const resource = info.appInfo.labelResource;
  const local = resource.moduleName.length === 0 || resource.moduleName === ability.currentHapModuleInfo.name;

  try {
    // Cross-module IDs need their Resource scope. The recommended replacement,
    // application.createModuleContext, is async and cannot serve a sync constant.
    const name = local ? ability.resourceManager.getStringSync(resource.id) : ability.resourceManager.getStringSync(resource);

    if (name.length > 0) return name;
  } catch (error) {
    if (!isMissingResource(error)) {
      throw new ExpoModuleError(
        'ERR_APPLICATION_NAME',
        `Unable to resolve the running Harmony application's name: ${String(error)}`,
        error as Object,
      );
    }
  }

  const id = info.appInfo.labelId;
  if (local && Number.isSafeInteger(id) && id > 0) {
    try {
      const name = ability.resourceManager.getStringSync(id);

      if (name.length > 0) return name;
    } catch (error) {
      if (!isMissingResource(error)) {
        throw new ExpoModuleError(
          'ERR_APPLICATION_NAME',
          `Unable to resolve the running Harmony application's name: ${String(error)}`,
          error as Object,
        );
      }
    }
  }

  return literalApplicationLabel(info.appInfo.label);
}

function isMissingResource(error: Object): boolean {
  const code = (error as BusinessError).code;
  return code === RESOURCE_INVALID_ID || code === RESOURCE_NOT_FOUND;
}
