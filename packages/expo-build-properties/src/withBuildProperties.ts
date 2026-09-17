import { isDeepStrictEqual } from 'node:util';
import { createRequire } from 'node:module';

import {
  createRunOncePlugin,
  normalizeHarmonyConfig,
  registerHarmonyConfigPlugin,
  withEntryBuildProfile,
  withModuleJson,
  withProjectBuildProfile,
  type HarmonyConfigPlugin,
  type ExpoConfigWithHarmony,
} from '@expo-harmony/config-plugins';

import {
  applyBuildPropertiesConfig,
  validateRuleFiles,
  validatePluginConfig,
  type HarmonyBuildProperties,
  type PluginConfigType,
} from './pluginConfig';
import { ExpoBuildPropertiesError } from './errors';

const pkg = createRequire(__filename)('../package.json') as { name: string; version: string };
type Json = Record<string, unknown>;

function record(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
}

function set(target: Json, key: string, value: unknown): void {
  if (value === undefined || (typeof value === 'object' && value !== null && !Object.keys(value).length)) delete target[key];
  else target[key] = value;
}

function managesOptionalProperties(config: Pick<ExpoConfigWithHarmony, '_internal'>): boolean {
  return config._internal?.harmonyBuildProperties !== undefined
    || config._internal?.harmonyStaleConfigPlugins?.some((plugin: { owner: string }) => plugin.owner === pkg.name);
}

const withMods: HarmonyConfigPlugin = (config) => {
  config = withProjectBuildProfile(config, (mod) => {
    const harmony = normalizeHarmonyConfig(mod.modRawConfig);
    const props: HarmonyBuildProperties = mod.modRawConfig._internal?.harmonyBuildProperties ?? {};
    const app = record(mod.modResults.app);
    const products: Json[] = Array.isArray(app.products) ? app.products : [];
    const existing = products.find(product => product.name === harmony.productName) ?? { name: harmony.productName };

    const product = {
      ...existing,
      name: harmony.productName,
      compatibleSdkVersion: harmony.compatibleSdkVersionString,
      targetSdkVersion: harmony.targetSdkVersionString,
      buildOption: { ...record(existing.buildOption), nativeCompiler: props.nativeCompiler ?? 'BiSheng' },
    };
    const next = products.map(item => item.name === product.name ? product : item);
    if (!products.some(item => item.name === product.name)) next.push(product);

    mod.modResults.app = { ...app, products: next };

    return mod;
  });

  config = withEntryBuildProfile(config, (mod) => {
    const harmony = normalizeHarmonyConfig(mod.modRawConfig);
    const props: HarmonyBuildProperties = mod.modRawConfig._internal?.harmonyBuildProperties ?? {};
    const build = { ...record(mod.modResults.buildOption) };

    build.externalNativeOptions = { ...record(build.externalNativeOptions), abiFilters: harmony.abiFilters };
    mod.modResults.buildOption = build;

    if (!managesOptionalProperties(mod)) return mod;

    const native = { ...record(build.nativeLib) };

    set(native, 'filter', props.nativeLib?.filter);
    set(build, 'nativeLib', native);

    const modes: Json[] = Array.isArray(mod.modResults.buildOptionSet) ? mod.modResults.buildOptionSet : [];
    const release = { ...modes.find(item => item.name === 'release'), name: 'release' } as Json;
    const ark = { ...record(release.arkOptions) };
    const obfuscation = { ...record(ark.obfuscation) };
    const rules = props.release?.obfuscation;
    const symbols = { ...record(release.nativeLib) };

    set(obfuscation, 'ruleOptions', rules === undefined
      ? undefined
      : {
          enable: rules.enable,
          // Keep the source file location: ArkGuard resolves keep/namecache paths relative to it.
          ...(rules.files?.length ? { files: rules.files.map(file => `../../${file}`) } : {}),
        });
    set(ark, 'obfuscation', obfuscation);
    set(release, 'arkOptions', ark);
    set(symbols, 'debugSymbol', props.release?.debugSymbol);
    set(release, 'nativeLib', symbols);

    const next = modes.filter(item => item.name !== 'release');
    if (Object.keys(release).length > 1) next.push(release);

    set(mod.modResults, 'buildOptionSet', next.length ? next : undefined);

    return mod;
  });

  return withModuleJson(config, (mod) => {
    if (!managesOptionalProperties(mod)) return mod;

    const props: HarmonyBuildProperties = mod.modRawConfig._internal?.harmonyBuildProperties ?? {};
    const module = { ...record(mod.modResults.module) };

    set(module, 'compressNativeLibs', props.compressNativeLibs);
    set(module, 'extractNativeLibs', props.extractNativeLibs);

    mod.modResults.module = module;

    return mod;
  });
};

export const withBuildPropertiesDefaults = createRunOncePlugin(withMods, pkg.name, pkg.version);

export const withBuildProperties: HarmonyConfigPlugin<PluginConfigType | void> = (config, options) => {
  if (!config.harmony?.bundleName && !config.platforms?.includes('harmony')) return config;

  const props = validatePluginConfig(options ?? {});
  config = applyBuildPropertiesConfig(config, props);
  config._internal ??= {};

  const previous = config._internal.harmonyBuildProperties;
  const root = config._internal.projectRoot;

  if (previous !== undefined && !isDeepStrictEqual(previous, props)) {
    throw new ExpoBuildPropertiesError('expo-build-properties is configured more than once with different options.');
  }
  if (props.release?.obfuscation?.files?.length && !root) {
    throw new ExpoBuildPropertiesError('Obfuscation rule files require an Expo projectRoot.');
  }
  if (root) validateRuleFiles(root, props);

  config._internal.harmonyBuildProperties = props;
  config = registerHarmonyConfigPlugin(config, pkg.name);

  return withBuildPropertiesDefaults(config);
};
