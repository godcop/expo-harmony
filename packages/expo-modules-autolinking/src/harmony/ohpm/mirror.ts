import fs from 'node:fs/promises';
import path from 'node:path';

import { HarmonyAutolinkingError } from '../../errors';
import { isPathInside } from '../../utilities/values';

export async function mirrorPackageLinkAsync(
  link: string,
  project: string,
  root?: string
): Promise<string> {
  if (!root) return link;

  const mirror = await fs.realpath(root);
  const roots = [path.resolve(root, 'filesystem'), path.join(mirror, 'filesystem')];

  if (!roots.some(root => isPathInside(root, project))
    || roots.some(root => isPathInside(root, link))) return link;

  const source = path.resolve(link);
  const parsed = path.parse(source);
  const volume = parsed.root.replace(/[^A-Za-z0-9]+/gu, '') || 'root';
  const target = path.join(mirror, 'filesystem', volume, source.slice(parsed.root.length));
  let existing: string | undefined;

  try {
    existing = await fs.realpath(target);
  } catch (cause) {
    if (cause.code !== 'ENOENT') {
      throw new HarmonyAutolinkingError(
        'MIRROR_PATH_FAILED',
        `Cannot inspect the isolated dependency path: ${target}`,
        { cause, stage: 'artifact-materialize' }
      );
    }
  }

  if (existing !== undefined) {
    if (existing !== await fs.realpath(source)) {
      throw new HarmonyAutolinkingError(
        'UNSAFE_MIRROR_PATH',
        `The isolated dependency path conflicts with an existing file or link: ${target}`,
        { stage: 'artifact-materialize' }
      );
    }

    return target;
  }

  // Do not create directories through a copied symlink into the original project.
  let directory = mirror;

  for (const segment of path.relative(mirror, path.dirname(target)).split(path.sep)) {
    directory = path.join(directory, segment);

    try {
      await fs.mkdir(directory);
    } catch (cause) {
      if (cause.code !== 'EEXIST') {
        throw new HarmonyAutolinkingError(
          'MIRROR_PATH_FAILED',
          `Cannot create the isolated dependency directory: ${directory}`,
          { cause, stage: 'artifact-materialize' }
        );
      }

      if (!(await fs.lstat(directory)).isDirectory()) {
        throw new HarmonyAutolinkingError(
          'UNSAFE_MIRROR_PATH',
          `The isolated dependency path conflicts with an existing file or link: ${directory}`,
          { cause, stage: 'artifact-materialize' }
        );
      }
    }
  }

  await fs.symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');

  return target;
}
