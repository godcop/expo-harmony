import { createPermissionHook, type PermissionResponse } from 'expo-modules-core';

import native from './ExpoTrackingTransparency';

export async function getTrackingPermissionsAsync(): Promise<PermissionResponse> {
  return native.getPermissionsAsync();
}

export async function requestTrackingPermissionsAsync(): Promise<PermissionResponse> {
  return native.requestPermissionsAsync();
}

export const useTrackingPermissions = createPermissionHook({
  getMethod: getTrackingPermissionsAsync,
  requestMethod: requestTrackingPermissionsAsync,
});

export async function getAdvertisingIdAsync(): Promise<string | null> {
  return native.getAdvertisingIdAsync();
}

export { getAdvertisingId, isAvailable, PermissionStatus } from 'expo-tracking-transparency/build/TrackingTransparency';
export type { PermissionResponse, PermissionExpiration, PermissionHookOptions } from 'expo-tracking-transparency/build/TrackingTransparency';
