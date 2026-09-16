import { ExpoModuleError } from '@expo-harmony/expo-modules-core';

export class ExpoImagePickerError extends ExpoModuleError {
  constructor(code: string, message: string, cause?: Object) {
    super(code, message, cause);
    this.name = 'ExpoImagePickerError';
  }
}
