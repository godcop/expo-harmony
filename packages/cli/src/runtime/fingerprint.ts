import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createFingerprintAsync, type HashSource } from '@expo/fingerprint';
import { createNativeModuleContracts, verifyModulesAsync } from '@expo-harmony/expo-modules-autolinking';
import { HarmonyCliError } from '../errors';

export async function fingerprintHarmonyAsync(root: string) {
  const result = await verifyModulesAsync({ projectRoot: root });
  if (!result.valid) throw new HarmonyCliError('ERR_HARMONY_FINGERPRINT', 'Build and verify Harmony native modules before calculating the runtime fingerprint.', { operation: 'fingerprint' });

  const require = createRequire(path.join(root, 'package.json'));
  const dependencies = createNativeModuleContracts(result.modules);
  const generated: string[] = [];
  const previous = path.join(root, '.expo/harmony/export-manifest.json');
  if (fs.existsSync(previous)) {
    const manifest = JSON.parse(fs.readFileSync(previous, 'utf8'));
    generated.push(...manifest.assets.map(asset => `**/harmony/**/src/main/resources/rawfile/${asset.path}`));
  }
  const sources: HashSource[] = [{ type: 'contents', id: 'harmonyAutolinking', contents: JSON.stringify(dependencies), reasons: ['harmonyAutolinking'] }];
  for (const name of ['@react-native-oh/react-native-harmony', '@expo-harmony/template', '@expo-harmony/config-plugins', '@expo-harmony/prebuild-config']) {
    const file = require.resolve(name + '/package.json');
    sources.push({ type: 'dir', filePath: path.relative(root, path.dirname(file)), reasons: ['harmonyNativeToolchain'] });
  }
  if (fs.existsSync(path.join(root, 'harmony'))) sources.push({ type: 'dir', filePath: 'harmony', reasons: ['harmonyNativeProject'] });

  return createFingerprintAsync(root, {
    platforms: [], extraSources: sources,
    ignorePaths: [
      ...generated,
      '**/harmony/**/build/**', '**/harmony/**/.hvigor/**', '**/harmony/**/.cxx/**', '**/harmony/**/oh_modules/**',
      '**/harmony/**/oh-package-lock.json5', '**/harmony/**/local.properties', '**/harmony/**/native-inputs.cmake',
      '**/harmony/**/HarmonyRuntime.ts', '**/harmony/**/expo-harmony-runtime.json', '**/harmony/**/expo-updates/**',
      '**/harmony/**/hermes_bundle.hbc', '**/harmony/**/hermes_bundle.hbc.*', '**/harmony/**/.expo-harmony/**',
      '**/harmony/**/autolinking.cmake', '**/harmony/**/autolinking.cpp',
      '**/harmony/**/generated/**', '**/*.har', '**/*.hap', '**/.git/**', '**/node_modules/**/node_modules/**',
    ],
  });
}
