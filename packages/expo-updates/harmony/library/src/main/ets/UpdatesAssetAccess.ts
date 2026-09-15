import fs from '@ohos.file.fs';
import { ExpoUpdatesError } from './UpdatesProtocol';

export function assetAccess(path: string, mode: 'read' | 'write', owns: (path: string) => boolean): boolean | undefined {
  if (!path.startsWith('/') || path.includes('\0') || path.includes('\\')) return undefined;

  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else segments.push(segment);
  }
  if (!owns(`/${segments.join('/')}`)) return undefined;
  if (mode === 'write') return false;

  // Check original segments: a symlink followed by '..' may escape an asset path.
  segments.length = 0;
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') { segments.pop(); continue; }
    segments.push(segment);

    try {
      if (fs.lstatSync(`/${segments.join('/')}`).isSymbolicLink()) {
        throw new ExpoUpdatesError('ERR_UPDATES_ASSET_ACCESS', 'An update asset path must not traverse symbolic links.');
      }
    } catch (error) {
      throw new ExpoUpdatesError('ERR_UPDATES_ASSET_ACCESS', `Unable to access the update asset: ${String(error)}`, error instanceof Error ? error : undefined);
    }
  }

  return true;
}
