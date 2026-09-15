import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { getConfig } from '@expo/config';
import { compileHarmonyModsAsync, normalizeHarmonyConfig, type ExpoConfigWithHarmony } from '@expo-harmony/config-plugins';
import { withHarmonyPrebuildConfig } from '@expo-harmony/prebuild-config';
import type { HarmonyRuntimeContract } from '@expo-harmony/expo-modules-autolinking/runtime';
import JSON5 from 'json5';

import { fingerprintHarmonyAsync } from './fingerprint';
import { HarmonyCliError } from '../errors';
import { resolveHarmonyBuildPlanAsync } from '../native/project';
import type { HarmonyBuildPlan } from '../native/types';

export interface HarmonyMetroRuntime {
  reactPackage: string;
  harmonyPackage: string;
  fixedRuntime: boolean;
}

export async function resolveRuntimeVersionAsync(root: string, config: ExpoConfigWithHarmony, app): Promise<string> {
  if (typeof config.runtimeVersion === 'object' && config.runtimeVersion?.policy === 'nativeVersion') {
    if (typeof app?.versionName !== 'string' || !app.versionName
      || !Number.isSafeInteger(app.versionCode) || app.versionCode < 1) {
      throw new HarmonyCliError(
        'ERR_HARMONY_RUNTIME_CONFIG',
        'The nativeVersion policy requires a Harmony versionName and a positive versionCode.',
        { operation: 'runtime-contract' }
      );
    }

    return `${app.versionName}(${app.versionCode})`;
  }

  if (typeof config.runtimeVersion === 'object' && config.runtimeVersion?.policy === 'fingerprint') {
    return (await fingerprintHarmonyAsync(root)).hash;
  }

  const require = createRequire(path.join(root, 'package.json'));
  const expo = createRequire(require.resolve('expo/package.json'));
  const { getRuntimeVersionAsync } = expo('@expo/config-plugins/build/utils/Updates');
  const version = await getRuntimeVersionAsync(root, {
    ...config,
    runtimeVersion: config.runtimeVersion ?? { policy: 'sdkVersion' },
  }, 'harmony');

  if (typeof version !== 'string' || !version) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_CONFIG',
      'Cannot resolve expo.runtimeVersion for Harmony.',
      { operation: 'runtime-contract' }
    );
  }

  return version;
}

export async function readMetroRuntimeAsync(root: string): Promise<HarmonyMetroRuntime | undefined> {
  const require = createRequire(path.join(root, 'package.json'));
  const previous = process.env.EXPO_METRO_TARGET;
  let config;

  try {
    process.env.EXPO_METRO_TARGET = 'harmony';
    config = (await require('metro-config').resolveConfig(undefined, root)).config;
  } finally {
    if (previous === undefined) delete process.env.EXPO_METRO_TARGET;
    else process.env.EXPO_METRO_TARGET = previous;
  }

  return config?.resolver?.resolveRequest?.harmonyRuntime;
}

function nativeConfig(profile, module, build, product: string, ability: string): HarmonyRuntimeContract['config'] {
  const selected = profile?.app?.products?.find(item => item.name === product);
  const entry = module?.abilities?.find(item => item.name === ability);
  if (!selected || !entry || !build
    || /(?:USE_HERMES|HERMES_V1_ENABLED)(?::BOOL)?=(?:OFF|FALSE|0)/i.test(build.buildOption?.externalNativeOptions?.arguments || '')
    || Object.keys(selected.buildOption || {}).some(key => key !== 'nativeCompiler')
    || profile.app.buildModeSet?.some(mode => mode.buildOption)
    || build.buildOptionSet?.length || build.targets?.some(target => target.buildOption)) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_CONFIG',
      'Runtime contracts require an existing Harmony product and ability, Hermes v1, and native options without per-target or per-mode overrides.',
      { operation: 'runtime-contract' }
    );
  }

  const api = (value: unknown) => typeof value === 'number' ? value : Number(/\((\d+)\)$/.exec(String(value))?.[1] ?? value);

  return {
    nativeCompiler: selected.buildOption?.nativeCompiler,
    targetApiVersion: api(selected.targetSdkVersion),
    compatibleApiVersion: api(selected.compatibleSdkVersion),
    permissions: [...new Set<string>((module.requestPermissions || []).map(item => item.name))].sort(),
    querySchemes: [...new Set<string>(module.querySchemes || [])].sort(),
    backgroundModes: [...new Set<string>(entry.backgroundModes || [])].sort(),
    abiFilters: [...(build.buildOption?.externalNativeOptions?.abiFilters || [])].sort(),
  };
}

export function readNativeRuntime(plan: HarmonyBuildPlan) {
  const read = (file: string) => JSON5.parse(fs.readFileSync(file, 'utf8'));
  const app = read(path.join(plan.harmonyRoot, 'AppScope/app.json5')).app;
  const profile = read(plan.projectFiles.projectBuildProfile);
  const module = read(plan.projectFiles.moduleJson).module;
  const build = read(path.join(plan.moduleRoot, 'build-profile.json5'));

  return { app, config: nativeConfig(profile, module, build, plan.productName, plan.abilityName) };
}

export async function readProjectRuntimeAsync(root: string) {
  const { exp } = getConfig(root, { skipSDKVersionRequirement: true, isModdedConfig: true });
  const config = exp as ExpoConfigWithHarmony;
  let native: ReturnType<typeof readNativeRuntime>;
  let bundle: string;

  if (config.harmony) {
    const settings = normalizeHarmonyConfig(config);
    const evaluated = await compileHarmonyModsAsync(withHarmonyPrebuildConfig(config), {
      projectRoot: root,
      introspect: true,
      ignoreExistingNativeFiles: true,
    });
    const results = evaluated._internal?.modResults?.harmony;
    native = {
      app: results?.appJson?.app,
      config: nativeConfig(
        results?.projectBuildProfile,
        results?.moduleJson?.module,
        results?.entryBuildProfile,
        settings.productName,
        settings.abilityName
      ),
    };
    bundle = settings.bundleName;
  } else {
    const plan = await resolveHarmonyBuildPlanAsync(root);
    native = readNativeRuntime(plan);
    bundle = plan.bundleName;
  }

  return {
    config,
    bundleName: bundle,
    native: native.config,
    runtimeVersion: await resolveRuntimeVersionAsync(root, config, native.app),
  };
}
