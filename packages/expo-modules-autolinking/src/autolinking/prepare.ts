import type { LinkOptions, VerifyOptions } from '../types';
import { HarmonyAutolinkingError } from '../errors';
import { normalizeOptionsAsync } from '../config/options';
import { materializeLocalSourcesAsync } from '../harmony/materialize';
import { buildConfiguredModulesAsync } from '../harmony/configuredBuild';
import { assertVerificationSucceeded, verifyModulesAsync } from './verify';

export async function prepareModulesAsync(raw: LinkOptions) {
  const options = await normalizeOptionsAsync(raw);
  if (typeof raw.harmonyProjectPath !== 'string' || !raw.harmonyProjectPath) {
    throw new HarmonyAutolinkingError('INVALID_OPTIONS', 'link requires harmonyProjectPath.', { stage: 'link' });
  }

  const verify = await verifyModulesAsync((raw.modules !== undefined
    ? { modules: raw.modules }
    : { ...options, searchResult: raw.searchResult }) as VerifyOptions);
  assertVerificationSucceeded(verify, 'link');

  const modules = verify.modules;
  const pending = modules.filter(module => module.artifact.kind === 'local-source');
  if (pending.length > 0) {
    if (pending.some(module => module.source !== 'nativeModulesDir')) {
      throw new HarmonyAutolinkingError(
        'SOURCE_ARTIFACT_MATERIALIZATION_REQUIRED',
        'Only nativeModulesDir modules may build a local Harmony HAR.',
        { stage: 'link', details: pending.map(module => module.packageName).sort() }
      );
    }

    await materializeLocalSourcesAsync(pending, {
      dependencies: modules,
      projectRoot: options.projectRoot,
      timeoutMs: raw.timeoutMs,
      outputLimit: raw.outputLimit,
      env: raw.env,
    });
  }

  return {
    options,
    diagnostics: verify.diagnostics,
    modules: await buildConfiguredModulesAsync(modules, {
      ...raw, projectRoot: options.projectRoot, buildType: options.buildType,
    }),
  };
}
