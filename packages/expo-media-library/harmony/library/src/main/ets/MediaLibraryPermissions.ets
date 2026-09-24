import { ExpoRuntimePermissionsKey, ExpoModuleContext, ExpoModuleError, ExpoPermissionStatus } from '@expo-harmony/expo-modules-core';
import { Permissions } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { deviceInfo } from '@kit.BasicServicesKit';

export const READ_PERMISSION: Permissions = 'ohos.permission.READ_IMAGEVIDEO';
export const WRITE_PERMISSION: Permissions = 'ohos.permission.WRITE_IMAGEVIDEO';
const REQUEST_REASONS_API: number = 18;
const MEDIA_PERMISSIONS: Permissions[] = [READ_PERMISSION, WRITE_PERMISSION];
const SELF_PERMISSION_STATUS_API: number = 20;
const PREFERENCES_NAME: string = 'ExpoMediaLibraryPermissions';

enum RequestReason {
  Success = 0,
  InvalidPermission = 1,
  NotDeclared = 2,
  CannotRequest = 5,
  ManualSettings = 6,
}

export class MediaLibraryPermissionResponse {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  expires: string = 'never';
  accessPrivileges: string;

  constructor(status: string, canAskAgain: boolean) {
    this.status = status;
    this.granted = status === 'granted';
    this.canAskAgain = canAskAgain;
    this.accessPrivileges = this.granted ? 'all' : 'none';
  }
}

export class MediaLibraryPermissions {
  private context: ExpoModuleContext;
  private queue: Promise<void> = Promise.resolve();
  private destroyed: boolean = false;

  constructor(context: ExpoModuleContext) {
    this.context = context;
  }

  destroy(): void {
    this.destroyed = true;
  }

  ensureGranted(permissions: Permissions[]): void {
    if (!permissions.every((permission: Permissions): boolean => this.context.permissionStatus(permission) === ExpoPermissionStatus.GRANTED)) {
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_PERMISSION', 'The required HarmonyOS media library permission has not been granted.');
    }
  }

  async get(write: boolean): Promise<MediaLibraryPermissionResponse> {
    let undetermined: boolean = false;
    let denied: boolean = false;

    for (const permission of write ? [WRITE_PERMISSION] : MEDIA_PERMISSIONS) {
      const system = this.context.systemPermissionStatus(permission) === ExpoPermissionStatus.GRANTED;
      if (system && deviceInfo.sdkApiVersion < SELF_PERMISSION_STATUS_API) await this.rememberDenial(permission, false);

      const history = deviceInfo.sdkApiVersion < SELF_PERMISSION_STATUS_API ? await this.wasDenied(permission) : undefined;
      const status = this.context.permissionStatus(permission, history);
      if (status === ExpoPermissionStatus.GRANTED) continue;

      const rejected = status !== ExpoPermissionStatus.NOT_DETERMINED;
      denied = denied || rejected;
      undetermined = undetermined || !rejected;
    }

    return new MediaLibraryPermissionResponse(denied ? 'denied' : undetermined ? 'undetermined' : 'granted', !denied);
  }

  async request(write: boolean): Promise<MediaLibraryPermissionResponse> {
    const result = this.queue.then((): Promise<MediaLibraryPermissionResponse> => this.requestOnce(write));
    this.queue = result.then(
      (): void => {},
      (): void => {},
    );

    return await result;
  }

  private async requestOnce(write: boolean): Promise<MediaLibraryPermissionResponse> {
    if (this.destroyed) throw new ExpoModuleError('ERR_MEDIA_LIBRARY_DESTROYED', 'The media library module has been destroyed.');

    const request = await this.context.requestPermissions(write ? [WRITE_PERMISSION] : MEDIA_PERMISSIONS);

    let restricted: boolean = false;

    for (const result of request.systemResults) {
      for (const permission of write ? [WRITE_PERMISSION] : MEDIA_PERMISSIONS) {
        const index = result.permissions.indexOf(permission);
        const reason = deviceInfo.sdkApiVersion >= REQUEST_REASONS_API ? result.errorReasons?.[index] : undefined;
        const granted = result.authResults[index] === ExpoPermissionStatus.GRANTED;

        if (
          index < 0 ||
          reason === RequestReason.InvalidPermission ||
          reason === RequestReason.NotDeclared ||
          ((reason === undefined || reason === RequestReason.Success) && !granted && result.authResults[index] !== ExpoPermissionStatus.DENIED)
        ) {
          throw new ExpoModuleError(
            'ERR_MEDIA_LIBRARY_PERMISSION_REQUEST',
            `Invalid permission result for ${permission}. Check module.json5 declarations.`,
          );
        }

        if (
          deviceInfo.sdkApiVersion < SELF_PERMISSION_STATUS_API &&
          (((reason === undefined || reason === RequestReason.Success) && (granted || result.dialogShownResults?.[index] === true)) ||
            reason === RequestReason.CannotRequest ||
            reason === RequestReason.ManualSettings)
        ) {
          await this.rememberDenial(permission, !granted);
        }

        const blocked = reason === RequestReason.CannotRequest || reason === RequestReason.ManualSettings;
        if (!granted && blocked) restricted = true;

        if (!blocked && reason !== undefined && reason !== RequestReason.Success) {
          throw new ExpoModuleError('ERR_MEDIA_LIBRARY_PERMISSION_REQUEST', `The system could not request ${permission} (reason ${reason}).`);
        }
      }
    }

    const response = await this.get(write);

    if (this.context.services.get(ExpoRuntimePermissionsKey) !== undefined) {
      return restricted && !response.granted ? new MediaLibraryPermissionResponse('denied', false) : response;
    }

    return response.granted ? response : new MediaLibraryPermissionResponse('denied', response.canAskAgain && !restricted);
  }

  private async wasDenied(permission: Permissions): Promise<boolean> {
    try {
      const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });
      return (await store.get(permission, false)) === true;
    } catch (_) {
      return false;
    }
  }

  private async rememberDenial(permission: Permissions, denied: boolean): Promise<void> {
    try {
      const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });
      if ((await store.get(permission, false)) === denied) return;

      await store.put(permission, denied);
      await store.flush();
    } catch (_) {
      // API 13–19 have no permission-history query. Persistence is best effort.
    }
  }
}
