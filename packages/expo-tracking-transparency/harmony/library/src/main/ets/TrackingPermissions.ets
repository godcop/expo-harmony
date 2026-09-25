import { ExpoModuleContext, ExpoModuleError, ExpoPermissionStatus } from '@expo-harmony/expo-modules-core';
import { Permissions } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { deviceInfo } from '@kit.BasicServicesKit';

export const TRACKING_PERMISSION: Permissions = 'ohos.permission.APP_TRACKING_CONSENT';
const PREFERENCES_NAME: string = 'ExpoTrackingTransparencyPermissions';
const REQUEST_ERROR_REASONS_API: number = 18;
const FULL_PERMISSION_STATUS_API: number = 20;

enum RequestReason {
  Success = 0,
  InvalidPermission = 1,
  NotDeclared = 2,
  CannotRequest = 5,
  ManualSettings = 6,
}

export class TrackingPermissionResponse {
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

export class TrackingPermissions {
  private context: ExpoModuleContext;
  private queue: Promise<void> = Promise.resolve();

  constructor(context: ExpoModuleContext) {
    this.context = context;
  }

  async get(): Promise<TrackingPermissionResponse> {
    let denied: boolean | undefined = undefined;

    if (deviceInfo.sdkApiVersion < FULL_PERMISSION_STATUS_API) {
      if (this.context.systemPermissionStatus(TRACKING_PERMISSION) === ExpoPermissionStatus.GRANTED) {
        await this.rememberDenial(false);
      }

      denied = await this.wasDenied();
    }

    const status = this.context.permissionStatus(TRACKING_PERMISSION, denied);

    if (status === ExpoPermissionStatus.GRANTED) return new TrackingPermissionResponse('granted', true);
    if (status === ExpoPermissionStatus.NOT_DETERMINED) return new TrackingPermissionResponse('undetermined', true);
    return new TrackingPermissionResponse('denied', false);
  }

  async request(): Promise<TrackingPermissionResponse> {
    const result = this.queue.then((): Promise<TrackingPermissionResponse> => this.requestOnce());
    this.queue = result.then(
      (): void => {},
      (): void => {},
    );

    return await result;
  }

  private async requestOnce(): Promise<TrackingPermissionResponse> {
    const request = await this.context.requestPermissions([TRACKING_PERMISSION]);
    let denied: boolean = false;

    for (const result of request.systemResults) {
      const index = result.permissions.indexOf(TRACKING_PERMISSION);
      const reason = deviceInfo.sdkApiVersion >= REQUEST_ERROR_REASONS_API ? result.errorReasons?.[index] : undefined;
      const granted = result.authResults[index] === ExpoPermissionStatus.GRANTED;

      if (
        index < 0 ||
        (!granted && result.authResults[index] !== ExpoPermissionStatus.DENIED) ||
        reason === RequestReason.InvalidPermission ||
        reason === RequestReason.NotDeclared
      ) {
        throw new ExpoModuleError(
          'ERR_TRACKING_TRANSPARENCY_PERMISSION',
          'Invalid tracking permission result. Check APP_TRACKING_CONSENT in the application module.json5.',
        );
      }

      const blocked = reason === RequestReason.CannotRequest || reason === RequestReason.ManualSettings;

      if (!blocked && reason !== undefined && reason !== RequestReason.Success) {
        throw new ExpoModuleError('ERR_TRACKING_TRANSPARENCY_PERMISSION', `The system could not request tracking permission (reason ${reason}).`);
      }

      const answered = granted || result.dialogShownResults?.[index] === true || blocked;

      if (!granted && answered) denied = true;

      if (deviceInfo.sdkApiVersion < FULL_PERMISSION_STATUS_API && answered) {
        await this.rememberDenial(!granted);
      }
    }

    const response = await this.get();

    // A known denial remains authoritative even if persisting its history failed.
    if (denied && !response.granted) return new TrackingPermissionResponse('denied', false);

    return response;
  }

  private async wasDenied(): Promise<boolean | undefined> {
    try {
      const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });

      return (await store.get(TRACKING_PERMISSION, false)) === true;
    } catch {
      return undefined;
    }
  }

  private async rememberDenial(denied: boolean): Promise<void> {
    try {
      const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });

      if ((await store.get(TRACKING_PERMISSION, false)) === denied) return;

      await store.put(TRACKING_PERMISSION, denied);
      await store.flush();
    } catch {
      // API 13–19 have no permission-history query; persistence is best effort.
    }
  }
}
