import { ExpoModuleContext, ExpoPermissionStatus, ExpoRuntimePermissionsKey } from '@expo-harmony/expo-modules-core';
import { Permissions } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { deviceInfo } from '@kit.BasicServicesKit';
import { ExpoImagePickerError } from './ExpoImagePickerError';

const CAMERA_PERMISSION: Permissions = 'ohos.permission.CAMERA';
const PERMISSION_STATUS_API: number = 20;
const REQUEST_REASONS_API: number = 18;
const PREFERENCES_NAME: string = 'ExpoImagePickerPermissions';

enum RequestReason {
  Success = 0,
  InvalidPermission = 1,
  NotDeclared = 2,
  CannotRequest = 5,
  ManualSettings = 6,
}

export class PermissionResponse {
  status: string;
  granted: boolean;
  canAskAgain: boolean;
  expires: string = 'never';
  accessPrivileges?: string;

  constructor(status: string, canAskAgain: boolean) {
    this.status = status;
    this.granted = status === 'granted';
    this.canAskAgain = canAskAgain;
  }
}

export class ImagePickerPermissions {
  private readonly context: ExpoModuleContext;
  private pending?: Promise<PermissionResponse>;
  private denied?: boolean;

  constructor(context: ExpoModuleContext) {
    this.context = context;
  }

  async getCamera(): Promise<PermissionResponse> {
    const system = this.context.systemPermissionStatus(CAMERA_PERMISSION);
    if (deviceInfo.sdkApiVersion < PERMISSION_STATUS_API) {
      if (system === ExpoPermissionStatus.GRANTED) this.denied = false;

      try {
        const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });
        if (system === ExpoPermissionStatus.GRANTED) {
          await store.put(CAMERA_PERMISSION, false);
          await store.flush();
        } else if (this.denied === undefined) {
          const denied = (await store.get(CAMERA_PERMISSION, false)) === true;
          if (this.denied === undefined) this.denied = denied;
        }
      } catch (_) {}
    }

    const status = this.context.permissionStatus(CAMERA_PERMISSION, this.denied ?? false);
    if (status === ExpoPermissionStatus.GRANTED) return new PermissionResponse('granted', true);
    if (status === ExpoPermissionStatus.NOT_DETERMINED) return new PermissionResponse('undetermined', true);
    return new PermissionResponse('denied', false);
  }

  async requestCamera(): Promise<PermissionResponse> {
    if (this.pending !== undefined) return await this.pending;

    this.pending = this.requestCameraOnce();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }

  private async requestCameraOnce(): Promise<PermissionResponse> {
    const request = await this.context.requestPermissions([CAMERA_PERMISSION]);
    let denied = false;
    for (const result of request.systemResults) {
      const index = result.permissions.indexOf(CAMERA_PERMISSION);
      const reason = deviceInfo.sdkApiVersion >= REQUEST_REASONS_API ? result.errorReasons?.[index] : undefined;
      const granted = result.authResults[index] === ExpoPermissionStatus.GRANTED;
      if (
        index < 0 ||
        reason === RequestReason.InvalidPermission ||
        reason === RequestReason.NotDeclared ||
        ((reason === undefined || reason === RequestReason.Success) && !granted && result.authResults[index] !== ExpoPermissionStatus.DENIED)
      ) {
        throw new ExpoImagePickerError('ERR_IMAGE_PICKER_PERMISSION', 'Declare ohos.permission.CAMERA in module.json5.');
      }

      const blocked = reason === RequestReason.CannotRequest || reason === RequestReason.ManualSettings;
      denied = denied || blocked || (!granted && result.dialogShownResults?.[index] === true);
      if (deviceInfo.sdkApiVersion < PERMISSION_STATUS_API && (granted || denied)) {
        this.denied = !granted;

        try {
          const store = await preferences.getPreferences(this.context.uiAbilityContext, { name: PREFERENCES_NAME });
          await store.put(CAMERA_PERMISSION, !granted);
          await store.flush();
        } catch (_) {}
      }

      if (!blocked && reason !== undefined && reason !== RequestReason.Success) {
        throw new ExpoImagePickerError('ERR_IMAGE_PICKER_PERMISSION', `The system could not request camera permission (reason ${reason}).`);
      }
    }

    const response = await this.getCamera();
    if (!response.granted && this.context.services.get(ExpoRuntimePermissionsKey) === undefined) {
      response.status = 'denied';
      response.canAskAgain = response.canAskAgain && !denied;
    }

    return response;
  }
}

export function mediaLibraryPermission(): PermissionResponse {
  // Picker access does not grant permission to enumerate or write the library.
  const available = canIUse('SystemCapability.FileManagement.PhotoAccessHelper.Core');
  const response = new PermissionResponse(available ? 'granted' : 'denied', available);
  response.accessPrivileges = available ? 'all' : 'none';
  return response;
}
