import { createRequire } from 'node:module';
import path from 'node:path';

import type { InputConfigT } from 'metro-config';

import { DefaultReactNativeHarmonyPackage, HarmonyPlatform } from './constants';
import {
  createWithHarmonyConfig,
  type CreateHarmonyMetroConfig,
  type MergeConfig,
  type WithHarmonyConfigOptions,
} from './createWithHarmonyConfig';
import { ExpoHarmonyMetroError } from './errors';

interface MetroConfigPeer {
  mergeConfig?: MergeConfig;
}

interface HarmonyMetroConfigPeer {
  createHarmonyMetroConfig?: CreateHarmonyMetroConfig;
}

interface AutolinkingPlatforms {
  getSupportPackageForPlatform?: (platform: string) => string | null;
}

type WithHarmonyConfig = ReturnType<typeof createWithHarmonyConfig>;

const Implementations = new Map<string, WithHarmonyConfig>();

function patchAutolinking(root: string, runtime: string): void {
  let platforms: AutolinkingPlatforms;

  try {
    const require = createRequire(path.join(root, 'package.json'));
    const expo = createRequire(require.resolve('expo/package.json'));

    platforms = expo('expo-modules-autolinking/build/platforms') as AutolinkingPlatforms;
  } catch {
    return;
  }

  const original = platforms.getSupportPackageForPlatform;
  if (typeof original !== 'function') return;

  try {
    if (original(HarmonyPlatform) === runtime) return;
  } catch {
    // Expo SDK 55 rejects unknown platforms.
  }

  // Expo re-exports this module with getters, so the CLI sees the replacement.
  platforms.getSupportPackageForPlatform = (platform: string) => platform === HarmonyPlatform
    ? runtime
    : original(platform);
}

function loadPeer<T>(require: NodeRequire, name: string): T {
  try {
    return require(name) as T;
  } catch (cause) {
    throw new ExpoHarmonyMetroError(
      'ERR_EXPO_HARMONY_MISSING_PEER_DEPENDENCY',
      `@expo-harmony/metro-config could not load its peer dependency "${name}". `
      + 'Install it in the app that owns the Metro configuration.',
      { cause }
    );
  }
}

function getPeerVersion(require: NodeRequire, name: string): string {
  try {
    const manifest = require(`${name}/package.json`) as { version?: unknown };

    return typeof manifest.version === 'string' ? manifest.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function getImplementation(root: string, runtime: string): WithHarmonyConfig {
  const key = `${root}\0${runtime}`;
  const cached = Implementations.get(key);
  if (cached) return cached;

  const require = createRequire(path.join(root, 'package.json'));
  const metro = loadPeer<MetroConfigPeer>(require, 'metro-config');
  const harmony = loadPeer<HarmonyMetroConfigPeer>(require, `${runtime}/metro.config`);

  if (typeof metro.mergeConfig !== 'function') {
    throw new ExpoHarmonyMetroError(
      'ERR_EXPO_HARMONY_INCOMPATIBLE_PEER_DEPENDENCY',
      '@expo-harmony/metro-config requires metro-config to expose mergeConfig(); '
      + `the project resolved version ${getPeerVersion(require, 'metro-config')}.`
    );
  }
  if (typeof harmony.createHarmonyMetroConfig !== 'function') {
    throw new ExpoHarmonyMetroError(
      'ERR_EXPO_HARMONY_INCOMPATIBLE_PEER_DEPENDENCY',
      `@expo-harmony/metro-config requires ${runtime} to expose `
      + 'the /metro.config createHarmonyMetroConfig() export; '
      + `the project resolved version ${getPeerVersion(require, runtime)}.`
    );
  }

  const apply = createWithHarmonyConfig({
    createHarmonyMetroConfig: harmony.createHarmonyMetroConfig,
    mergeConfig: metro.mergeConfig,
  });
  Implementations.set(key, apply);

  return apply;
}

export function withHarmonyConfig<T extends InputConfigT>(
  config: T,
  options: WithHarmonyConfigOptions = {}
): T & InputConfigT {
  if (options.enabled === false) return config;

  const root = path.resolve(options.projectRoot ?? config.projectRoot ?? process.cwd());
  const runtime = options.reactNativeHarmonyPackageName ?? DefaultReactNativeHarmonyPackage;

  patchAutolinking(root, runtime);

  return getImplementation(root, runtime)(config, { ...options, projectRoot: root });
}
