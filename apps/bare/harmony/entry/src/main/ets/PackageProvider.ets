import { ExpoReactHostFactory } from '@expo-harmony/expo';
import { ExpoRuntimeConfig } from '@expo-harmony/expo-modules-core';
import type { RNInstanceOptions, RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony';
import { createRNOHPackages } from './RNOHPackagesFactory';
import { expoHarmonyHostProvider } from './generated/ExpoHarmonyHostProvider';

export function getRNOHPackages(context: RNPackageContext, runtimeConfig?: ExpoRuntimeConfig): RNPackage[] {
  return createRNOHPackages(context, runtimeConfig);
}

export const expoReactHost = ExpoReactHostFactory.getDefaultReactHost({
  bundlePath: 'hermes_bundle.hbc',
  workerScriptUrl: 'entry/ets/workers/RNOHWorker.ets',
  provider: expoHarmonyHostProvider,
  createRNInstanceOptions: (headless: boolean): RNInstanceOptions => ({
    name: 'Expo Harmony 演示（Bare 应用 · 电池）',
    createRNPackages: (context: RNPackageContext): RNPackage[] => getRNOHPackages(context, new ExpoRuntimeConfig({ isHeadless: headless })),
    fontResourceByFontFamily: {},
  }),
});
