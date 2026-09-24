import { linkPreparedModulesAsync } from '../autolinking/link';
import { prepareModulesAsync } from '../autolinking/prepare';

import { addCommonOptions, parsePositiveInt, toApiOptions } from './autolinkingOptions';
import { writeResult } from './output';

function registerLinkCommand(program, io) {
  addCommonOptions(program.command('link [searchPaths...]').description('transactionally link Expo and RNOH modules'))
    .requiredOption('--harmony-project-path <path>', 'Harmony project root')
    .option('--node-modules-path <path>', 'node_modules directory')
    .option('--react-native-executable <path>', 'explicit project-local react-native executable')
    .option('--rnoh-cli-package-json <path>', 'explicit RNOH CLI package.json')
    .option('--timeout-ms <milliseconds>', 'RNOH command timeout', parsePositiveInt)
    .option('--output-limit <bytes>', 'per-stream output capture limit', parsePositiveInt)
    .option('-j, --json', 'output results in the plain JSON format', false)
    .action(async (searchPaths, options) => {
      const input = {
        ...toApiOptions(options, searchPaths),
        harmonyProjectPath: options.harmonyProjectPath,
        nodeModulesPath: options.nodeModulesPath,
        reactNativeExecutable: options.reactNativeExecutable,
        rnohCliPackageJsonPath: options.rnohCliPackageJson,
        timeoutMs: options.timeoutMs,
        outputLimit: options.outputLimit,
      };
      const prepared = await prepareModulesAsync(input);
      writeResult(io, await linkPreparedModulesAsync(input, prepared), options);
    });
}

export { registerLinkCommand };
