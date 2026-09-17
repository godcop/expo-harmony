import fs from 'node:fs';
import path from 'node:path';

import {
  HarmonyPaths,
  normalizeHarmonyConfig,
  parseHarmonySdkVersion,
  type ExpoConfigWithHarmony,
} from '@expo-harmony/config-plugins';

import { ExpoBuildPropertiesError } from './errors';

export interface NativeLibFilter {
  excludes?: string[];
  pickFirsts?: string[];
  pickLasts?: string[];
  enableOverride?: boolean;
}

export interface DebugSymbol {
  strip: boolean;
  /** Hvigor semantics: exceptions to strip=true, or the only stripped libraries when strip=false. */
  exclude?: string[];
}

export interface HarmonyBuildProperties {
  compatibleSdkVersion?: number | string;
  targetSdkVersion?: number | string;
  abiFilters?: ('arm64-v8a' | 'x86_64')[];
  nativeCompiler?: 'BiSheng' | 'Original';
  nativeLib?: { filter?: NativeLibFilter };
  compressNativeLibs?: boolean;
  extractNativeLibs?: boolean;
  release?: {
    debugSymbol?: DebugSymbol;
    obfuscation?: {
      enable: boolean;
      files?: string[];
    };
  };
}

export interface PluginConfigType {
  harmony?: HarmonyBuildProperties;
}

function object(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ExpoBuildPropertiesError(`${field} must be an object.`);
  }

  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new ExpoBuildPropertiesError(`${field}.${key} is not supported.`);
  }

  return value as Record<string, unknown>;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new ExpoBuildPropertiesError(`${field} must be a boolean.`);
  return value;
}

function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim() || /[\r\n\0]/.test(item))) {
    throw new ExpoBuildPropertiesError(`${field} must be an array of non-empty strings.`);
  }

  return [...new Set(value as string[])];
}

function validateBuildProperties(value: unknown): HarmonyBuildProperties {
  const props = object(value, 'build-properties.harmony', [
    'compatibleSdkVersion', 'targetSdkVersion', 'abiFilters', 'nativeCompiler',
    'nativeLib', 'compressNativeLibs', 'extractNativeLibs', 'release',
  ]);

  const result: HarmonyBuildProperties = {};

  for (const key of ['compatibleSdkVersion', 'targetSdkVersion'] as const) {
    if (props[key] !== undefined) result[key] = parseHarmonySdkVersion(props[key], key).native;
  }

  if (props.abiFilters !== undefined) {
    const abis = strings(props.abiFilters, 'abiFilters');

    if (!abis.length || abis.some(abi => abi !== 'arm64-v8a' && abi !== 'x86_64')) {
      throw new ExpoBuildPropertiesError('abiFilters must contain arm64-v8a and/or x86_64.');
    }

    result.abiFilters = abis as NonNullable<HarmonyBuildProperties['abiFilters']>;
  }

  if (props.nativeCompiler !== undefined) {
    if (props.nativeCompiler !== 'BiSheng' && props.nativeCompiler !== 'Original') {
      throw new ExpoBuildPropertiesError('nativeCompiler must be BiSheng or Original.');
    }

    result.nativeCompiler = props.nativeCompiler;
  }

  for (const key of ['compressNativeLibs', 'extractNativeLibs'] as const) {
    if (props[key] !== undefined) result[key] = boolean(props[key], key);
  }

  if (props.nativeLib !== undefined) {
    const native = object(props.nativeLib, 'nativeLib', ['filter']);
    result.nativeLib = {};

    if (native.filter !== undefined) {
      const filter = object(native.filter, 'nativeLib.filter', ['excludes', 'pickFirsts', 'pickLasts', 'enableOverride']);
      const output: NativeLibFilter = {};

      for (const key of ['excludes', 'pickFirsts', 'pickLasts'] as const) {
        if (filter[key] !== undefined) output[key] = strings(filter[key], `nativeLib.filter.${key}`);
      }
      if (filter.enableOverride !== undefined) output.enableOverride = boolean(filter.enableOverride, 'nativeLib.filter.enableOverride');

      if (output.pickFirsts?.some(pattern => output.pickLasts?.includes(pattern))) {
        throw new ExpoBuildPropertiesError('The same SO pattern cannot appear in both pickFirsts and pickLasts.');
      }

      result.nativeLib.filter = output;
    }
  }

  if (props.release !== undefined) {
    const release = object(props.release, 'release', ['debugSymbol', 'obfuscation']);
    result.release = {};

    if (release.debugSymbol !== undefined) {
      const symbol = object(release.debugSymbol, 'release.debugSymbol', ['strip', 'exclude']);

      result.release.debugSymbol = {
        strip: boolean(symbol.strip, 'release.debugSymbol.strip'),
        ...(symbol.exclude === undefined ? {} : { exclude: strings(symbol.exclude, 'release.debugSymbol.exclude') }),
      };
    }

    if (release.obfuscation !== undefined) {
      const rules = object(release.obfuscation, 'release.obfuscation', ['enable', 'files']);
      const enable = boolean(rules.enable, 'release.obfuscation.enable');
      const files = rules.files === undefined ? [] : strings(rules.files, 'release.obfuscation.files');

      if (enable && files.length === 0) {
        throw new ExpoBuildPropertiesError('Enabling ArkTS obfuscation requires at least one rule file.');
      }

      for (const file of files) {
        if (path.isAbsolute(file) || path.win32.isAbsolute(file) || file.includes('\\')
          || file.split('/').includes('..') || path.posix.normalize(file).startsWith('harmony/')) {
          throw new ExpoBuildPropertiesError(`Obfuscation input must be an application-relative path outside harmony/: ${file}`);
        }
      }

      result.release.obfuscation = { enable, files: [...new Set(files.map(file => path.posix.normalize(file)))] };
    }
  }

  return result;
}

export function validatePluginConfig(value: unknown): HarmonyBuildProperties {
  const config = object(value, 'build-properties', ['harmony']);
  return validateBuildProperties(config.harmony === undefined ? {} : config.harmony);
}

export function applyBuildPropertiesConfig<Config extends ExpoConfigWithHarmony>(
  config: Config, props: HarmonyBuildProperties
): Config {
  const harmony = { ...config.harmony! };

  for (const key of ['compatibleSdkVersion', 'targetSdkVersion'] as const) {
    const value = props[key];
    if (value === undefined) continue;

    const legacy = harmony[key] ?? (key === 'targetSdkVersion' ? harmony.targetApiVersion : undefined);

    if (legacy !== undefined && parseHarmonySdkVersion(legacy, `harmony.${key}`).native !== value) {
      throw new ExpoBuildPropertiesError(`expo.harmony.${key} conflicts with expo-build-properties. Remove the legacy setting.`);
    }

    harmony[key] = value;
  }

  if (props.abiFilters !== undefined) {
    if (harmony.abiFilters !== undefined
      && JSON.stringify([...new Set(harmony.abiFilters)].sort()) !== JSON.stringify([...props.abiFilters].sort())) {
      throw new ExpoBuildPropertiesError('expo.harmony.abiFilters conflicts with expo-build-properties. Remove the legacy setting.');
    }

    harmony.abiFilters = props.abiFilters;
  }

  const result = { ...config, harmony };
  normalizeHarmonyConfig(result);

  return result;
}

export function validateRuleFiles(root: string, props: HarmonyBuildProperties): void {
  for (const source of props.release?.obfuscation?.files ?? []) {
    const input = path.resolve(root, source);
    let real: string;
    let stat: fs.Stats;

    try {
      real = fs.realpathSync(input);
      stat = fs.statSync(real);
      fs.accessSync(real, fs.constants.R_OK);
    } catch (cause) {
      throw new ExpoBuildPropertiesError(`Cannot read obfuscation rule file ${source}: ${(cause as Error).message}`, { cause });
    }

    if (!stat.isFile()) {
      throw new ExpoBuildPropertiesError(`Not an obfuscation rule file: ${source}`);
    }

    if (!HarmonyPaths.isInside(fs.realpathSync(root), real)
      || HarmonyPaths.isInside(path.join(fs.realpathSync(root), 'harmony'), real)) {
      throw new ExpoBuildPropertiesError(`Obfuscation rule file must remain inside the application and outside harmony/: ${source}`);
    }
  }
}
