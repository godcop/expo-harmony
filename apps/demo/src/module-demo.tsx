import type { ComponentType } from 'react';

import type { ModuleId } from './catalog';
import { AppMetricsDemo } from './modules/app-metrics';
import { ApplicationDemo } from './modules/application';
import { AssetDemo } from './modules/asset';
import { AudioDemo } from './modules/audio';
import { BackgroundFetchDemo } from './modules/background-fetch';
import { BackgroundTaskDemo } from './modules/background-task';
import { BatteryDemo } from './modules/battery';
import { BlobDemo } from './modules/blob';
import { BlurDemo } from './modules/blur';
import { BrightnessDemo } from './modules/brightness';
import { CalendarDemo } from './modules/calendar';
import { CameraDemo } from './modules/camera';
import { CellularDemo } from './modules/cellular';
import { CliDemo } from './modules/cli';
import { ClipboardDemo } from './modules/clipboard';
import { ConfigPluginsDemo } from './modules/config-plugins';
import { ConstantsDemo } from './modules/constants';
import { ContactsDemo } from './modules/contacts';
import { CryptoDemo } from './modules/crypto';
import { DeviceDemo } from './modules/device';
import { DocumentPickerDemo } from './modules/document-picker';
import { ExpoModulesDemo } from './expoModules/ExpoModulesDemo';
import { ModulesAutolinkingDemo } from './modules/expo-modules-autolinking';
import { ModulesCoreDemo } from './modules/expo-modules-core';
import { RouterDemo } from './modules/expo-router';
import { TaskManagerDemo } from './modules/expo-task-manager';
import { FetchDemo } from './modules/fetch';
import { FileSystemDemo } from './modules/file-system';
import { FontDemo } from './modules/font';
import { HapticsDemo } from './modules/haptics';
import { ImageDemo } from './modules/image';
import { ImageLoaderDemo } from './modules/image-loader';
import { ImagePickerDemo } from './modules/image-picker';
import { IntentLauncherDemo } from './modules/intent-launcher';
import { KeepAwakeDemo } from './modules/keep-awake';
import { LinearGradientDemo } from './modules/linear-gradient';
import { LinkingDemo } from './modules/linking';
import { LivePhotoDemo } from './modules/live-photo';
import { LocalizationDemo } from './modules/localization';
import { LocationDemo } from './modules/location';
import { MediaLibraryDemo } from './modules/media-library';
import { MetroConfigDemo } from './modules/metro-config';
import { NavigationBarDemo } from './modules/navigation-bar';
import { NetworkDemo } from './modules/network';
import { PrebuildConfigDemo } from './modules/prebuild-config';
import { PrintDemo } from './modules/print';
import { ScreenCaptureDemo } from './modules/screen-capture';
import { ScreenOrientationDemo } from './modules/screen-orientation';
import { SecureStoreDemo } from './modules/secure-store';
import { SharingDemo } from './modules/sharing';
import { SplashScreenDemo } from './modules/splash-screen';
import { SystemUIDemo } from './modules/system-ui';
import { TemplateDemo } from './modules/template';

import { UpdatesDemo } from './modules/updates';
import { ExpoDemo } from './modules/expo';
import { EASClientDemo } from './modules/eas-client';
import { ManifestsDemo } from './modules/manifests';
import { JSONUtilsDemo } from './modules/json-utils';
import { StructuredHeadersDemo } from './modules/structured-headers';
import { UpdatesInterfaceDemo } from './modules/updates-interface';

const MODULE_DEMOS = {
  'expo': ExpoDemo,
  'eas-client': EASClientDemo,
  'manifests': ManifestsDemo,
  'json-utils': JSONUtilsDemo,
  'structured-headers': StructuredHeadersDemo,
  'updates-interface': UpdatesInterfaceDemo,
  'updates': UpdatesDemo,
  'app-metrics': AppMetricsDemo,
  'application': ApplicationDemo,
  'asset': AssetDemo,
  'audio': AudioDemo,
  'background-fetch': BackgroundFetchDemo,
  'background-task': BackgroundTaskDemo,
  'battery': BatteryDemo,
  'blob': BlobDemo,
  'blur': BlurDemo,
  'brightness': BrightnessDemo,
  'calendar': CalendarDemo,
  'camera': CameraDemo,
  'cellular': CellularDemo,
  'cli': CliDemo,
  'clipboard': ClipboardDemo,
  'config-plugins': ConfigPluginsDemo,
  'constants': ConstantsDemo,
  'contacts': ContactsDemo,
  'crypto': CryptoDemo,
  'device': DeviceDemo,
  'document-picker': DocumentPickerDemo,
  'expo-module-showcase': ExpoModulesDemo,
  'expo-modules-autolinking': ModulesAutolinkingDemo,
  'expo-modules-core': ModulesCoreDemo,
  'expo-router': RouterDemo,
  'expo-task-manager': TaskManagerDemo,
  'fetch': FetchDemo,
  'file-system': FileSystemDemo,
  'font': FontDemo,
  'haptics': HapticsDemo,
  'image': ImageDemo,
  'image-loader': ImageLoaderDemo,
  'image-picker': ImagePickerDemo,
  'intent-launcher': IntentLauncherDemo,
  'keep-awake': KeepAwakeDemo,
  'linear-gradient': LinearGradientDemo,
  'linking': LinkingDemo,
  'live-photo': LivePhotoDemo,
  'localization': LocalizationDemo,
  'location': LocationDemo,
  'media-library': MediaLibraryDemo,
  'metro-config': MetroConfigDemo,
  'navigation-bar': NavigationBarDemo,
  'network': NetworkDemo,
  'prebuild-config': PrebuildConfigDemo,
  'print': PrintDemo,
  'screen-capture': ScreenCaptureDemo,
  'screen-orientation': ScreenOrientationDemo,
  'secure-store': SecureStoreDemo,
  'sharing': SharingDemo,
  'splash-screen': SplashScreenDemo,
  'system-ui': SystemUIDemo,
  'template': TemplateDemo,
} satisfies Record<ModuleId, ComponentType>;

export function ModuleDemo({ id }: { id: ModuleId }) {
  const Demo = MODULE_DEMOS[id];
  return <Demo />;
}
