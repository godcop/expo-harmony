import { type PermissionResponse, requireNativeModule } from 'expo-modules-core';

type TrackingModule = {
  getAdvertisingId(): string | null;
  getAdvertisingIdAsync(): Promise<string | null>;
  getPermissionsAsync(): Promise<PermissionResponse>;
  requestPermissionsAsync(): Promise<PermissionResponse>;
};

export default requireNativeModule<TrackingModule>('ExpoTrackingTransparency');
