import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createNativeModuleContracts, ohpmDependenciesFromManifest, verifyModulesAsync, type Manifest, type ModuleDescriptor } from '@expo-harmony/expo-modules-autolinking';
import { assertHarmonyCompatibility, harmonyRuntimeSchemaVersion, validateHarmonyRuntime, type HarmonyRuntimeContract } from '@expo-harmony/expo-modules-autolinking/runtime';
import JSON5 from 'json5';

import { publishUpdatesConfigurationAsync } from '../updates/export';
import { HarmonyCliError } from '../errors';
import { atomicCopy, atomicWriteJson } from '../file';
import type { HarmonyBuildPlan } from '../native/types';
import { readMetroRuntimeAsync, readNativeRuntime, readProjectRuntimeAsync, resolveRuntimeVersionAsync, type HarmonyMetroRuntime } from './config';

async function createRuntimeContractAsync(
  root: string,
  project: Awaited<ReturnType<typeof readProjectRuntimeAsync>>,
  modules: readonly ModuleDescriptor[],
  metro?: HarmonyMetroRuntime
): Promise<HarmonyRuntimeContract> {
  const resolution = metro ?? await readMetroRuntimeAsync(root);
  if (!resolution?.fixedRuntime || resolution.harmonyPackage !== '@react-native-oh/react-native-harmony'
    || typeof resolution.reactPackage !== 'string' || !resolution.reactPackage) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_CONFIG',
      'Runtime contracts require withHarmonyConfig with the standard RNOH package and supported React resolution.',
      { operation: 'runtime-contract' }
    );
  }

  const require = createRequire(path.join(root, 'package.json'));
  const version = (name: string) => require(`${name}/package.json`).version as string;
  const native = createRequire(require.resolve(resolution.harmonyPackage + '/package.json'));

  const contract: HarmonyRuntimeContract = {
    schemaVersion: harmonyRuntimeSchemaVersion(project.native),
    platform: 'harmony',
    runtimeVersion: project.runtimeVersion,
    development: true,
    expo: version('expo'),
    expoModulesCore: version('expo-modules-core'),
    rnoh: native('./package.json').version,
    react: version(resolution.reactPackage),
    hermes: native('hermes-compiler/package.json').version,
    engine: 'hermes-v1',
    bundleFormat: 'js-source',
    renderer: 'rnoh',
    modules: createNativeModuleContracts(modules),
    config: project.native,
  };

  if (contract.rnoh !== '0.84.1' || contract.react !== '19.2.3' || contract.hermes !== '250829098.0.9'
    || !contract.expo.startsWith('55.') || !modules.some(module => module.packageName === '@expo-harmony/expo-modules-core')) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_UNSUPPORTED',
      'The fixed development runtime requires Expo SDK 55, Harmony Expo Modules Core, RNOH 0.84.1, React 19.2.3, and Hermes 250829098.0.9. Check the Metro React alias.',
      { operation: 'runtime-contract' }
    );
  }

  const issues = validateHarmonyRuntime(contract);
  if (issues.length > 0) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_CONFIG',
      issues.map(issue => issue.message).join('\n'),
      { operation: 'runtime-contract' }
    );
  }

  return contract;
}

export async function resolveRuntimeRequirementsAsync(
  root: string,
  metro?: HarmonyMetroRuntime
): Promise<HarmonyRuntimeContract> {
  const result = await verifyModulesAsync({ projectRoot: root });
  if (!result.valid) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_MODULES',
      result.diagnostics.filter(item => item.severity === 'error').map(item => item.message).join('\n'),
      { operation: 'runtime-contract' }
    );
  }

  const project = await readProjectRuntimeAsync(root);

  return createRuntimeContractAsync(root, project, result.modules, metro);
}

export async function publishRuntimeContractAsync(
  root: string,
  plan: HarmonyBuildPlan
): Promise<HarmonyRuntimeContract> {
  const manifest = JSON.parse(await fs.promises.readFile(path.join(root, '.expo/harmony/autolinking.json'), 'utf8')) as Manifest;
  if (manifest.schemaVersion !== 4 || manifest.platform !== 'harmony' || manifest.buildType !== plan.buildMode) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_BUILD',
      'Runtime publication requires autolinking from this native build.',
      { operation: 'runtime-contract' }
    );
  }

  const project = await readProjectRuntimeAsync(root);
  const requirements = await createRuntimeContractAsync(root, project, manifest.modules);
  if (!manifest.runtimeModules || JSON.stringify(requirements.modules) !== JSON.stringify(manifest.runtimeModules)) {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_BUILD',
      'Native inputs changed or lack a runtime snapshot. Run autolinking/prebuild again before publishing capabilities.',
      { operation: 'runtime-contract' }
    );
  }

  const read = (file: string) => JSON5.parse(fs.readFileSync(file, 'utf8'));
  const dependencies = read(plan.nativeInputs.manifest);
  const declared = { ...dependencies.dependencies, ...dependencies.overrides };
  const linked = ohpmDependenciesFromManifest(manifest, { harmonyProjectPath: plan.harmonyRoot });
  for (const [name, expected] of Object.entries(linked)) {
    const actual = declared[name];
    const target = fs.realpathSync(path.resolve(plan.harmonyRoot, expected));
    if (typeof actual !== 'string' || !actual.startsWith('.')
      || fs.realpathSync(path.resolve(plan.harmonyRoot, actual)) !== target) {
      throw new HarmonyCliError(
        'ERR_HARMONY_RUNTIME_BUILD',
        `Native dependency ${name} does not use the HAR recorded by autolinking.`,
        { operation: 'runtime-contract' }
      );
    }
  }

  const directory = path.join(plan.harmonyRoot, 'oh_modules/@rnoh/react-native-openharmony');
  const rnoh = read(path.join(directory, 'oh-package.json5'));
  const hermes = read(path.join(directory, 'src/main/cpp/third-party/hermes/npm/hermes-compiler/package.json'));
  if (rnoh.version !== requirements.rnoh || hermes.version !== requirements.hermes
    || declared['@rnoh/react-native-openharmony'] !== requirements.rnoh
    || process.env.HERMES_V1_ENABLED === 'false') {
    throw new HarmonyCliError(
      'ERR_HARMONY_RUNTIME_BUILD',
      'Runtime publication requires matching installed RNOH and Hermes v1.',
      { operation: 'runtime-contract' }
    );
  }

  const native = readNativeRuntime(plan);
  requirements.development = plan.buildMode === 'debug';

  const contract: HarmonyRuntimeContract = {
    ...requirements,
    schemaVersion: harmonyRuntimeSchemaVersion(native.config),
    runtimeVersion: await resolveRuntimeVersionAsync(root, project.config, native.app),
    config: native.config,
  };

  assertHarmonyCompatibility(contract, requirements);

  const require = createRequire(path.join(root, 'package.json'));
  const file = path.join(plan.exportPaths.rawfileRoot, 'expo-harmony-runtime.json');
  const source = require.resolve('@expo-harmony/expo-modules-autolinking/runtime-source');
  const target = path.join(plan.moduleRoot, 'src/main/ets/generated/HarmonyRuntime.ts');

  await atomicCopy(source, target, root);
  await atomicWriteJson(contract, file, root);
  await atomicWriteJson(contract, path.join(root, '.expo/harmony/runtime.json'), root);
  await publishUpdatesConfigurationAsync(root, plan.exportPaths.rawfileRoot, project.config, contract.runtimeVersion);

  return contract;
}
