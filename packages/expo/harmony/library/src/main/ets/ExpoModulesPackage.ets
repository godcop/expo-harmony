import type { RNPackageContext } from '@rnoh/react-native-openharmony';
import {
  ExpoHarmonyHostState,
  ExpoModuleRegistration,
  ExpoRuntimeConfig,
  ExpoServiceClass,
  ReactNativeHostHandlerRegistration,
  ReactActivityHandlerRegistration,
  ReactRuntimeBindingRegistration,
  ExpoModulesCorePackage,
} from '@expo-harmony/expo-modules-core';
import { ExpoHarmonyLifecycleDispatcher } from './ExpoHarmonyLifecycleDispatcher';

export interface ExpoHarmonyHostProvider {
  readonly lifecycle: ExpoHarmonyLifecycleDispatcher;
  readonly expoServices: ExpoServiceClass[];
  readonly expoModules: ExpoModuleRegistration[];
  readonly hostState: ExpoHarmonyHostState;
  readonly reactNativeHostHandlers: ReactNativeHostHandlerRegistration[];
  readonly reactActivityHandlers: ReactActivityHandlerRegistration[];
  readonly runtimeBindings: ReactRuntimeBindingRegistration[];
}

export class ExpoModulesPackage extends ExpoModulesCorePackage {
  constructor(context: RNPackageContext, provider: ExpoHarmonyHostProvider, config: ExpoRuntimeConfig = new ExpoRuntimeConfig()) {
    super(context, provider.expoModules, provider.hostState, config, provider.expoServices);
  }

  override getDebugName(): string { return '@expo-harmony/expo'; }
}
