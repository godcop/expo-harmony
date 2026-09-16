import { ExpoModuleError } from '@expo-harmony/expo-modules-core';

export class ExpoImageError extends ExpoModuleError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'ExpoImageError';
  }
}
