import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { BusinessError } from '@kit.BasicServicesKit';

export class ExpoSecureStoreError extends ExpoModuleError {
  constructor(error: Object) {
    if (error instanceof ExpoModuleError) {
      super(error.code, error.message, error.cause, error.path);
    } else {
      super('ERR_SECURE_STORE_OPERATION_FAILED', `HarmonyOS SecureStore operation failed (code ${(error as BusinessError).code}).`, error);
    }
  }
}
