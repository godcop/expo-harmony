import { ExpoModuleContext, ExpoModuleError, ExpoPermissionStatus } from '@expo-harmony/expo-modules-core';
import { Permissions } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { deviceInfo } from '@kit.BasicServicesKit';

const ACTIVITY_MOTION: Permissions = 'ohos.permission.ACTIVITY_MOTION';
const SELF_PERMISSION_STATUS_API: number = 20;
const REQUEST_ERROR_REASONS_API: number = 18;
const PREFERENCES_NAME: string = 'ExpoSensors';
const DENIED_KEY: string = 'activityMotionDenied';

enum RequestReason {
  Success = 0,
  InvalidPermission = 1,
  NotDeclared = 2,
  CannotRequest = 5,
  ManualSettings = 6,
}

export class SensorPermissionResponse {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  expires: string = 'never';

  constructor(status: string, canAskAgain: boolean) {
    this.status = status;
    this.granted = status === 'granted';
    this.canAskAgain = canAskAgain;
  }
}

// API 13–19 needs persisted history to distinguish first use from denial.
export class PedometerPermissions {
  private readonly context: ExpoModuleContext;
  private denied?: boolean;
  private pending?: Promise<SensorPermissionResponse>;

  constructor(context: ExpoModuleContext) {
    this.context = context;
  }

  async get(): Promise<SensorPermissionResponse> {
    let history: boolean | undefined = undefined;

    if (deviceInfo.sdkApiVersion < SELF_PERMISSION_STATUS_API) {
      if (this.context.systemPermissionStatus(ACTIVITY_MOTION) === ExpoPermissionStatus.GRANTED) {
        await this.setDenied(false);
      }

      history = await this.wasDenied();
    }

    const status = this.context.permissionStatus(ACTIVITY_MOTION, history);
    if (status === ExpoPermissionStatus.GRANTED) return new SensorPermissionResponse('granted', true);

    const undetermined = status === ExpoPermissionStatus.NOT_DETERMINED;

    return new SensorPermissionResponse(undetermined ? 'undetermined' : 'denied', undetermined);
  }

  async request(): Promise<SensorPermissionResponse> {
    if (this.pending !== undefined) return await this.pending;

    const pending = this.requestOnce();
    this.pending = pending;

    try {
      return await pending;
    } finally {
      if (this.pending === pending) this.pending = undefined;
    }
  }

  private async requestOnce(): Promise<SensorPermissionResponse> {
    const request = await this.context.requestPermissions([ACTIVITY_MOTION]);
    let blocked = false;

    for (const result of request.systemResults) {
      const index = result.permissions.indexOf(ACTIVITY_MOTION);
      const reason =
        deviceInfo.sdkApiVersion >= REQUEST_ERROR_REASONS_API ? (result.errorReasons?.[index] ?? RequestReason.Success) : RequestReason.Success;

      if (
        index < 0 ||
        reason === RequestReason.InvalidPermission ||
        reason === RequestReason.NotDeclared ||
        (reason === RequestReason.Success &&
          result.authResults[index] !== ExpoPermissionStatus.GRANTED &&
          result.authResults[index] !== ExpoPermissionStatus.DENIED)
      ) {
        throw new ExpoModuleError(
          'ERR_SENSOR_PERMISSION',
          'Invalid activity motion permission result. Check the ACTIVITY_MOTION declaration in module.json5.',
        );
      }

      blocked = blocked || reason === RequestReason.CannotRequest || reason === RequestReason.ManualSettings;
      if (
        deviceInfo.sdkApiVersion < SELF_PERMISSION_STATUS_API &&
        ((reason === RequestReason.Success &&
          (result.authResults[index] === ExpoPermissionStatus.GRANTED || result.dialogShownResults?.[index] === true)) ||
          blocked)
      ) {
        await this.setDenied(result.authResults[index] === ExpoPermissionStatus.DENIED);
      }
    }

    const response = await this.get();

    return blocked && !response.granted ? new SensorPermissionResponse('denied', false) : response;
  }

  private async wasDenied(): Promise<boolean> {
    if (this.denied !== undefined) return this.denied;

    try {
      const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });
      const value = await store.get(DENIED_KEY, false);

      this.denied = this.denied ?? value === true;
    } catch (_) {
      this.denied = this.denied ?? false;
    }

    return this.denied;
  }

  private async setDenied(value: boolean): Promise<void> {
    this.denied = value;

    try {
      const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });
      if ((await store.get(DENIED_KEY, false)) === value) return;

      await store.put(DENIED_KEY, value);
      await store.flush();
    } catch (_) {
      // Permission history is best effort; the OS remains authoritative.
    }
  }
}
