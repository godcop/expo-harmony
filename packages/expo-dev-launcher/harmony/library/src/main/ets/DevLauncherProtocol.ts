import uri from '@ohos.uri';
import url from '@ohos.url';

export const DEV_LAUNCHER_PACKAGE = '@expo-harmony/expo-dev-launcher';
export const DEEP_LINK_SCHEME = 'expo-harmony';
export const DEEP_LINK_HOST = 'open';
export const EXPO_DEV_CLIENT_HOST = 'expo-development-client';
export const MANIFEST_PATH = '/manifest';
export const HARMONY_PLATFORM = 'harmony';
export const RUNTIME_CONTRACT_ASSET = 'expo-harmony-runtime.json';
export const LAUNCH_MODE_METADATA = 'expo.devLauncher.launchMode';
export const EXPO_MDNS_SERVICE = '_expo._tcp';
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const NETWORK_TIMEOUT_MS = 60_000;

export class DevLauncherError extends Error {
  readonly code: string;

  constructor(code: string, message: string, cause?: Object) {
    super(cause === undefined ? message : `${message} ${String(cause)}`);
    this.code = code;
    this.name = 'DevLauncherError';
  }
}

function decodeQueryValue(query: string, key: string): string | undefined {
  try {
    for (const component of query.split('&')) {
      const separator = component.indexOf('=');
      const name = separator < 0 ? component : component.slice(0, separator);
      if (decodeURIComponent(name.replace(/\+/g, ' ')) !== key) continue;
      const value = separator < 0 ? '' : component.slice(separator + 1);
      return decodeURIComponent(value.replace(/\+/g, ' '));
    }
  } catch (error) {
    throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'The development-client link contains invalid percent encoding.', error as Object);
  }

  return undefined;
}

function normalizedNetworkURL(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'The development URL is empty.');

  const normalized = trimmed.startsWith('exp://')
    ? `http://${trimmed.slice('exp://'.length)}`
    : trimmed.startsWith('exps://')
      ? `https://${trimmed.slice('exps://'.length)}`
      : trimmed;

  let parsed: uri.URI;

  try {
    parsed = new uri.URI(normalized);
  } catch (error) {
    throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'The development URL is malformed.', error as Object);
  }

  const scheme = (parsed.scheme ?? '').toLowerCase();
  const authority = parsed.authority ?? '';
  if ((scheme !== 'http' && scheme !== 'https') || authority.length === 0 || authority.includes('@') || (parsed.fragment ?? '').length > 0) {
    throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'Development URLs must use HTTP or HTTPS without credentials or fragments.');
  }
  return parsed.toString();
}

export function resolveDevelopmentURL(value: string): string {
  let parsed: uri.URI;

  try {
    parsed = new uri.URI(value.trim());
  } catch (_) {
    return normalizedNetworkURL(value);
  }

  const scheme = (parsed.scheme ?? '').toLowerCase();
  const host = (parsed.host ?? '').toLowerCase();
  const harmonyLink = scheme === DEEP_LINK_SCHEME;
  const expoLink = host === EXPO_DEV_CLIENT_HOST;
  if (!harmonyLink && !expoLink) return normalizedNetworkURL(value);
  if ((parsed.fragment ?? '').length > 0) {
    throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'Development-client links must not contain fragments.');
  }
  if (harmonyLink && host !== DEEP_LINK_HOST) {
    throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', `Expected ${DEEP_LINK_SCHEME}://${DEEP_LINK_HOST}.`);
  }

  const target = decodeQueryValue(parsed.query ?? '', 'url');
  if (target === undefined || target.length === 0) {
    throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'The development-client link is missing its url parameter.');
  }
  return normalizedNetworkURL(target);
}

export function manifestURL(value: string): string {
  const source = resolveDevelopmentURL(value);
  const parsed = new uri.URI(source);
  const sourcePath = parsed.path ?? '';
  if (sourcePath.endsWith('.bundle') || sourcePath.endsWith('.js')) return source;
  if (sourcePath === '' || sourcePath === '/' || sourcePath === MANIFEST_PATH || sourcePath === '/index.exp') {
    try {
      decodeURIComponent(parsed.query ?? '');
      const target = new url.URL(source);
      target.searchParams.delete('platform');
      target.searchParams.append('platform', HARMONY_PLATFORM);
      return canonicalDevelopmentManifestURL(target.toString());
    } catch (error) {
      throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'The development URL contains invalid percent encoding.', error as Object);
    }
  }
  return source;
}

// Strict identity validation is separate from user-input normalization: never
// silently repair a manifest's wrong/duplicate platform or discard its query.
export function canonicalDevelopmentManifestURL(value: string): string {
  const target = new url.URL(value);
  decodeURIComponent(target.search);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash
    || !['/', MANIFEST_PATH, '/index.exp'].includes(target.pathname)
    || target.searchParams.getAll('platform').length !== 1 || target.searchParams.get('platform') !== HARMONY_PLATFORM) {
    throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_URL', 'Expected an HTTP(S) Harmony manifest URL without credentials or fragments.');
  }
  target.pathname = MANIFEST_PATH;
  target.searchParams.delete('platform');
  target.searchParams.append('platform', HARMONY_PLATFORM);

  return target.toString();
}

export function displayError(error: Object): string {
  if (error instanceof Error && error.message.length > 0) return error.message;
  // Harmony BusinessError may be a plain object rather than an Error instance.
  if (error !== null && typeof error === 'object') {
    const details = error as { message?: string; code?: string | number };
    const message = typeof details.message === 'string' ? details.message : '';
    const code = typeof details.code === 'string' || typeof details.code === 'number' ? String(details.code) : '';
    if (message.length > 0) return code.length > 0 ? `${message} (${code})` : message;
    if (code.length > 0) return `Native operation failed (${code}).`;
  }
  return String(error);
}
