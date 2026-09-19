import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { publishEmbeddedUpdateAsync } from '../updates/export';
import { doctorAsync } from '../doctor/doctor';
import { resolveHarmonyEntryPoint } from '../entry';
import { HarmonyCliError } from '../errors';
import { withHarmonyProjectLockAsync } from '../projectLock';
import { resolveHarmonyBuildPlanAsync } from '../native/project';
import { formatDiagnostics, spawnAsync } from '../process';
import { resolveTimeoutMs } from '../timeout';
import { resolveExpoHermesBuilder } from '../expo';
import {
  assertHermesBundle, assertSourceMap, exportPaths,
  publishExportAsync, validatePublishedExportAsync,
  type HarmonyExportManifest,
} from './manifest';

export interface ExportOptions {
  check?: boolean;
  outputDirectory?: string;
  resetCache?: boolean;
  skipDoctor?: boolean;
  timeoutMs?: number;
}

export interface ExportTemporary {
  assets: string;
  bundle: string;
  javascript: string;
  metroSourceMap: string;
  metadata: string;
  sourceMap: string;
}

async function exportEmbedUnlockedAsync(
  root: string,
  options: ExportOptions = {}
): Promise<HarmonyExportManifest> {
  if (!options.skipDoctor) {
    const doctor = await doctorAsync(root);
    if (!doctor.ok) {
      const checks = doctor.checks.filter(check => check.status === 'error').map(check => check.id);

      throw new HarmonyCliError('ERR_HARMONY_EXPORT_DOCTOR', `Harmony doctor found blocking checks: ${checks.join(', ') || 'unknown'}.`, { operation: 'doctor' });
    }
  }

  const plan = await resolveHarmonyBuildPlanAsync(root, { buildMode: 'release' });
  const paths = options.outputDirectory
    ? {
        rawfileRoot: path.join(options.outputDirectory, 'embedded'), bundle: path.join(options.outputDirectory, 'embedded/hermes_bundle.hbc'),
        metadataRoot: options.outputDirectory, manifest: path.join(options.outputDirectory, 'export-manifest.json'),
        sourceMap: path.join(options.outputDirectory, 'hermes_bundle.hbc.map'),
      }
    : exportPaths(plan);

  if (options.check) return await validatePublishedExportAsync(paths);

  const entry = resolveHarmonyEntryPoint(root);
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'expo-harmony-export-'));
  const temp: ExportTemporary = {
    assets: path.join(directory, 'assets'),
    metadata: path.join(directory, 'assets.json'),
    bundle: path.join(directory, 'hermes_bundle.hbc'),
    javascript: path.join(directory, 'index.js'),
    metroSourceMap: path.join(directory, 'index.js.map'),
    sourceMap: path.join(directory, 'hermes_bundle.hbc.map'),
  };

  try {
    await fs.promises.mkdir(temp.assets, { recursive: true });

    const result = await spawnAsync(process.execPath, [
      path.resolve(__dirname, '../internal/export.js'), root,
      JSON.stringify({ update: !!options.outputDirectory, platform: 'harmony', entryFile: entry, bundleOutput: temp.javascript, assetsDest: temp.assets,
        dev: false, minify: false, sourcemapOutput: temp.metroSourceMap, sourcemapSourcesRoot: '.',
        unstableTransformProfile: 'hermes-stable', resetCache: options.resetCache }), temp.metadata,
    ], {
      capture: true,
      cwd: root,
      env: {
        ...process.env,
        EXPO_METRO_TARGET: 'harmony',
        HERMES_V1_ENABLED: 'true',
        NODE_ENV: 'production',
      },
      operation: 'expo-export-embed',
      outputLimit: 4 * 1024 * 1024,
      timeoutMs: resolveTimeoutMs('expo-export-embed', 10 * 60_000, options.timeoutMs),
    });

    if (result.code !== 0 || result.timedOut) {
      const diagnostics = formatDiagnostics(result);

      throw new HarmonyCliError(
        'ERR_HARMONY_EXPORT_FAILED',
        `Expo export:embed exited with code ${result.code}${result.timedOut ? ' after timing out' : ''}.${diagnostics ? `\n${diagnostics}` : ''}`,
        { exitCode: result.code || 1, operation: 'expo-export-embed' }
      );
    }

    // Expo 55 only infers Hermes for iOS and Android. Keep Harmony bundling in the Expo CLI,
    // then explicitly hand its JS and source map to Expo's own Hermes exporter.
    try {
      const [code, map] = await Promise.all([
        fs.promises.readFile(temp.javascript, 'utf8'),
        fs.promises.readFile(temp.metroSourceMap, 'utf8'),
      ]);
      const buildHermesBundleAsync = resolveExpoHermesBuilder(root);

      // Expo resolves hermes-compiler from react-native. For Harmony, resolve it
      // from RNOH instead of the app's Android/iOS React Native installation.
      const require = createRequire(path.join(root, 'package.json'));
      const runtime = path.dirname(require.resolve('@react-native-oh/react-native-harmony/package.json'));
      const modules = path.join(directory, 'node_modules');

      await fs.promises.mkdir(modules);
      await fs.promises.symlink(runtime, path.join(modules, 'react-native'),
        process.platform === 'win32' ? 'junction' : 'dir');

      const output = await buildHermesBundleAsync({
        code,
        filename: entry,
        map,
        minify: true,
        projectRoot: directory,
      });

      if (!(output?.hbc instanceof Uint8Array) || typeof output.sourcemap !== 'string') {
        throw new Error('Expo did not return Hermes bytecode and a composed source map.');
      }

      await Promise.all([
        fs.promises.writeFile(temp.bundle, output.hbc),
        fs.promises.writeFile(temp.sourceMap, output.sourcemap),
      ]);
    } catch (cause) {
      if (cause instanceof HarmonyCliError) {
        throw new HarmonyCliError(cause.code, cause.message, {
          cause,
          exitCode: cause.exitCode,
          operation: cause.operation,
        });
      }

      throw new HarmonyCliError(
        'ERR_HARMONY_EXPORT_HERMES',
        'Expo failed to compile the Harmony bundle to Hermes bytecode.',
        { cause, operation: 'expo-hermes-export' }
      );
    }

    const bytecode = await assertHermesBundle(temp.bundle);
    await assertSourceMap(temp.sourceMap);

    const manifest = await publishExportAsync(root, paths, temp, entry, bytecode);
    await publishEmbeddedUpdateAsync(root, paths, JSON.parse(await fs.promises.readFile(temp.metadata, 'utf8')));

    return manifest;
  } finally {
    await fs.promises.rm(directory, { force: true, recursive: true });
  }
}

async function exportEmbedAsync(
  root: string,
  options: ExportOptions = {}
): Promise<HarmonyExportManifest> {
  return withHarmonyProjectLockAsync(
    root,
    'export:embed',
    () => exportEmbedUnlockedAsync(root, options)
  );
}

export { exportEmbedAsync };
