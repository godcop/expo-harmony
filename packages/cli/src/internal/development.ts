import { createRequire } from 'node:module';

import { installHarmonyManifest } from '../development/manifest';

installHarmonyManifest(process.cwd());
process.argv.splice(1, 1);
const run = createRequire(__filename);
run(process.argv[1]);
