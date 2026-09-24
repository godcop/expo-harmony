import { CodedError } from 'expo-modules-core';

export async function updateDevicePushTokenAsync(..._args: unknown[]): Promise<never> {
  throw new CodedError(
    'ERR_NOTIFICATIONS_EXPO_PUSH_SERVICE_UNSUPPORTED',
    'Expo Push Service is not supported on HarmonyOS. Use getDevicePushTokenAsync() with Huawei Push Kit.'
  );
}

export async function hasDeviceTokenChangedAsync(..._args: unknown[]): Promise<never> {
  throw new CodedError(
    'ERR_NOTIFICATIONS_EXPO_PUSH_SERVICE_UNSUPPORTED',
    'Expo Push Service is not supported on HarmonyOS. Use getDevicePushTokenAsync() with Huawei Push Kit.'
  );
}
