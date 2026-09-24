import path from 'node:path';

import type { LinkOptions, LinkResult } from '../types';
import { ExpoArtifacts, ManifestArtifact, RnohArtifacts, managedArtifactsForHarmonyRoot } from '../config/constants';
import { renderArkTsHostProviderSource } from '../harmony/providers/host';
import { serializeManifest } from '../harmony/manifest/generate';
import { createNativeModuleContracts } from '../harmony/manifest/runtime';
import { HarmonyAutolinkingError } from '../errors';
import { linkRnohAsync } from '../harmony/rnoh/link';
import { cleanupStagingProjectAsync, stageProjectAsync } from '../harmony/transaction/stageProject';
import { publishArtifactsAsync } from '../harmony/transaction/publish';
import { readPreviousAutolinkingStateAsync } from '../harmony/transaction/previousState';
import { emitLog } from '../utilities/values';
import { prepareModulesAsync } from './prepare';

function buildPublishEntries(staging, hostProviderSource, manifest) {
  return [
    ...Object.entries(RnohArtifacts).map(([name, relative]) => ({
      source: staging.rnohArtifacts[name].path,
      target: path.join(staging.harmonyProjectPath, relative),
    })),
    {
      content: hostProviderSource,
      target: path.join(staging.harmonyProjectPath, ExpoArtifacts.hostProvider),
    },
    {
      content: manifest,
      target: path.join(staging.projectRoot, ManifestArtifact),
    },
  ];
}

async function linkPreparedModulesAsync(
  raw: LinkOptions,
  prepared: Awaited<ReturnType<typeof prepareModulesAsync>>
): Promise<LinkResult> {
  const { options, modules, diagnostics } = prepared;
  const provider = renderArkTsHostProviderSource(modules);

  let staging;
  let failure;
  let cleanupWarning;
  const warnings = [];

  try {
    const previous = await readPreviousAutolinkingStateAsync(options.projectRoot);

    if (previous.warning) {
      warnings.push(previous.warning);
      emitLog(raw.logger, 'warn', previous.warning.message, previous.warning);
    }

    staging = await stageProjectAsync({
      projectRoot: options.projectRoot,
      harmonyProjectPath: raw.harmonyProjectPath,
      nodeModulesPath: raw.nodeModulesPath,
      modules,
      buildType: options.buildType,
      previousManagedOhpmPackageNames: previous.managedOhpmPackageNames,
      rnohCliPackageJsonPath: raw.rnohCliPackageJsonPath,
    });

    staging.rnohArtifacts = await linkRnohAsync({
      ...staging,
      modules,
      buildType: options.buildType,
      exclude: staging.rnohRuntimePackages,
      commandNodeModulesPath: staging.sourceNodeModulesPath,
      reactNativeExecutable: raw.reactNativeExecutable,
      rnohCliPackageJsonPath: raw.rnohCliPackageJsonPath,
      timeoutMs: raw.timeoutMs,
      outputLimit: raw.outputLimit,
      env: raw.env,
    });

    const harmonyRoot = path.relative(staging.projectRoot, staging.harmonyProjectPath)
      .split(path.sep).join('/');
    const managed = managedArtifactsForHarmonyRoot(harmonyRoot);

    const manifest = serializeManifest(modules, {
      buildType: options.buildType,
      managedArtifacts: managed,
      runtimeModules: createNativeModuleContracts(modules),
    });

    const published = await publishArtifactsAsync({
      allowedRoot: staging.projectRoot,
      lockPath: path.join(staging.projectRoot, '.expo/harmony/autolinking.lock'),
      files: [
        ...buildPublishEntries(staging, provider, manifest),
        ...(raw.moduleBuilds !== undefined
          ? [{
              target: path.join(staging.projectRoot, '.expo/harmony/module-build-options.json'),
              content: JSON.stringify({
                schemaVersion: 1,
                moduleBuilds: raw.moduleBuilds,
                moduleBuildSettings: raw.moduleBuildSettings,
              }, null, 2) + '\n',
            }]
          : []),
      ],
      stale: previous.artifacts.filter(artifact => !managed.some((relative) => {
        return artifact === path.join(staging.projectRoot, ...relative.split('/'));
      })),
    });

    const result: LinkResult = {
      platform: 'harmony',
      modules,
      buildType: options.buildType,
      managedArtifacts: [...managed],
      changedArtifacts: published.changed.map(target => path.relative(staging.projectRoot, target).split(path.sep).join('/')),
      unchangedArtifacts: published.unchanged.map(target => path.relative(staging.projectRoot, target).split(path.sep).join('/')),
      diagnostics,
      warnings,
    };

    emitLog(raw.logger, 'info', 'Harmony autolinking completed.', {
      moduleCount: result.modules.length,
      changedArtifactCount: result.changedArtifacts.length,
    });
    return result;
  } catch (error) {
    failure = error;
    emitLog(raw.logger, 'error', 'Harmony autolinking failed.', {
      code: error.code || 'ERR_EXPO_HARMONY_UNKNOWN',
      stage: error.stage || 'link',
    });
  } finally {
    if (staging) {
      const cleanup = await cleanupStagingProjectAsync(staging);
      if (cleanup) {
        const warning = { ...cleanup };
        delete warning.cause;
        warnings.push(warning);
        emitLog(raw.logger, 'warn', warning.message, warning);
        if (failure) cleanupWarning = warning;
      }
    }
  }

  throw new HarmonyAutolinkingError(
    typeof failure.code === 'string' ? failure.code : 'UNKNOWN',
    failure.message || 'Harmony autolinking failed.',
    {
      cause: failure,
      stage: failure.stage || 'link',
      packageName: failure.packageName,
      diagnostics: failure.diagnostics,
      details: cleanupWarning
        ? { ...(failure.details || {}), cleanupWarning }
        : failure.details,
    }
  );
}

async function linkModulesAsync(raw: LinkOptions): Promise<LinkResult> {
  return linkPreparedModulesAsync(raw, await prepareModulesAsync(raw));
}

export { linkModulesAsync, linkPreparedModulesAsync };
