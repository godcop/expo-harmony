import { HarmonyCliError } from '../errors';

export const HarmonyManifestPath = '/manifest';

function validateManifestUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch (cause) {
    throw new HarmonyCliError(
      'ERR_HARMONY_MANIFEST_URL',
      'Expected an absolute HTTP(S) Harmony manifest URL.',
      { cause, operation: 'development-manifest' }
    );
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash
    || !['/', '/manifest', '/index.exp'].includes(url.pathname) || url.searchParams.toString() !== 'platform=harmony') {
    throw new HarmonyCliError(
      'ERR_HARMONY_MANIFEST_URL',
      'Expected an HTTP(S) Expo manifest URL with platform=harmony and without credentials or a fragment.',
      { operation: 'development-manifest' }
    );
  }

  return url;
}

export function createHarmonyLaunchLink(manifest: string): string {
  validateManifestUrl(manifest);

  const url = new URL('expo-harmony://open');
  url.searchParams.set('url', manifest);

  return url.toString();
}
