import { EmbeddedManifest, ExpoUpdatesManifest } from '@expo-harmony/expo-manifests';
import { isRecord } from './UpdatesJson';
import { Decimal, parseDictionary, serializeDictionary } from '@expo-harmony/expo-structured-headers';
import { matchesFilters as policyMatchesFilters } from './selectionpolicy/Filters';

export type Json = Record<string, ESObject>;
export type Headers = Record<string, string>;
export type Filters = Record<string, string | number | boolean>;

export class ExpoUpdatesError extends Error {
  constructor(readonly code: string, message: string, cause?: Error) {
    super(message);
    this.name = 'ExpoUpdatesError';
    if (cause?.stack !== undefined) this.stack = cause.stack;
  }
}

export interface UpdateAsset {
  id?: number;
  launch: boolean;
  key: string | null;
  url: string;
  hash?: string;
  type: string;
  extension: string;
  headers: Headers;
  embedded?: string;
  path?: string;
  digest?: string;
}

export interface UpdateRecord {
  id: string;
  scope: string;
  runtime: string;
  time: number;
  manifest: Json;
  assets: UpdateAsset[];
  url: string | null;
  headers: Headers | null;
  status: 'pending' | 'ready' | 'embedded' | 'development';
  successful: number;
  failed: number;
  accessed: number;
}

export interface UpdateDirective {
  type: 'noUpdateAvailable' | 'rollBackToEmbedded';
  time?: number;
}

export interface UpdateResponse {
  update?: UpdateRecord;
  directive?: UpdateDirective;
  headers?: Filters;
  filters?: Filters;
}

export interface SignatureResult {
  verified: boolean;
  projectId?: string;
  scopeKey?: string;
}

export type VerifySignature = (body: string, signature?: string, chain?: string) => Promise<SignatureResult>;

interface Part {
  body: string;
  headers: Headers;
}

export function normalizeHeaders(value: Record<string, ESObject>): Headers {
  const headers: Headers = Object.create(null);
  for (const [key, item] of Object.entries(value)) headers[key.toLowerCase()] = Array.isArray(item) ? item.join(', ') : String(item);
  return headers;
}

export function headerDictionary(value?: string): Filters | undefined {
  if (value === undefined) return undefined;

  try {
    const result: Filters = Object.create(null);
    for (const [key, item] of parseDictionary(value)) {
      if (item[0] instanceof Decimal) result[key] = item[0].toNumber();
      else if (['string', 'number', 'boolean'].includes(typeof item[0])) result[key] = item[0] as string | number | boolean;
    }
    return result;
  } catch (_) {
    return undefined;
  }
}

export function serializeHeaders(value: Filters): string {
  return serializeDictionary(new Map(Object.entries(value).map(([key, item]) => [key, [item, new Map()]])));
}

export const matchesFilters = policyMatchesFilters;

export function parameters(value: string): Headers {
  const result: Headers = Object.create(null);
  const pattern = /;\s*([^\s=;]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]*))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) result[match[1].toLowerCase()] = (match[2] ?? match[3]).replace(/\\(.)/g, '$1');

  return result;
}

function multipart(body: string, content: string): Record<string, Part> {
  if (!body.length) return {};

  const boundary = parameters(content).boundary;
  if (!boundary || /[\r\n]/.test(boundary)) throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Multipart response has no valid boundary.');

  const delimiter = '--' + boundary;
  const parts: Record<string, Part> = Object.create(null);
  let start = body.startsWith(delimiter) ? 0 : body.indexOf('\r\n' + delimiter) + 2;
  if (start < 2 && !body.startsWith(delimiter)) throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Multipart response has no opening boundary.');

  while (start < body.length) {
    start += delimiter.length;
    if (body.slice(start, start + 2) === '--') return parts;
    if (body.slice(start, start + 2) !== '\r\n') throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Invalid multipart delimiter.');

    start += 2;

    const split = body.indexOf('\r\n\r\n', start);
    const end = body.indexOf('\r\n' + delimiter, split + 4);
    if (split < 0 || end < 0) throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Incomplete multipart response.');

    const headers: Headers = Object.create(null);
    for (const line of body.slice(start, split).replace(/\r\n[ \t]+/g, ' ').split('\r\n')) {
      const colon = line.indexOf(':');
      if (colon < 1) throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Invalid multipart header.');
      headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
    }

    const name = parameters(headers['content-disposition'] ?? '').name;
    if (name) parts[name] = { body: body.slice(split + 4, end), headers };
    start = end + 2;
  }

  throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Multipart response has no closing boundary.');
}

function asset(value: unknown, headers: Json, launch: boolean): UpdateAsset {
  if (!isRecord(value) || typeof value.key !== 'string' || !value.key || typeof value.url !== 'string'
    || !/^https?:\/\//i.test(value.url)) throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'An update asset requires a key and HTTP(S) URL.');
  if (value.hash !== undefined && (typeof value.hash !== 'string' || !/^[A-Za-z0-9_-]{43}=?$/.test(value.hash))) {
    throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'An asset hash must be a Base64URL SHA-256 digest.');
  }

  const extra = headers[value.key] ?? {};
  if (!isRecord(extra) || !Object.entries(extra).every(([key, item]) => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) && typeof item === 'string' && !/[\r\n\0]/.test(item))) {
    throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Asset request headers must be string-valued objects.');
  }

  const extension = value.fileExtension ?? '';
  if (typeof extension !== 'string' || /[/\\\0\r\n]/.test(extension) || extension.includes('..')) {
    throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Invalid asset file extension.');
  }

  return {
    launch, key: value.key, url: value.url, hash: value.hash,
    type: value.contentType ?? 'application/octet-stream',
    extension: extension && !extension.startsWith('.') ? '.' + extension : extension,
    headers: extra,
  };
}

export function parseEmbeddedUpdate(value: unknown, scope: string, runtime: string, url: string, headers: Headers): UpdateRecord {
  const manifest = new EmbeddedManifest(value);
  const raw = manifest.getRawJson();
  const id = manifest.getID().toLowerCase();
  const time = manifest.getCommitTimeLong();
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || !Number.isFinite(new Date(time).getTime())) {
    throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'An embedded update requires a UUID and a valid commit time.');
  }

  const assets = [raw.launchAsset, ...(manifest.getAssets() ?? [])].map((asset: unknown, index: number): UpdateAsset => {
    if (!isRecord(asset) || typeof asset.packagerHash !== 'string' || !asset.packagerHash
      || typeof asset.type !== 'string' || /[/\\\0\r\n]/.test(asset.type) || asset.type.includes('..')
      || typeof asset.embeddedAssetFilename !== 'string' || !asset.embeddedAssetFilename
      || asset.embeddedAssetFilename.startsWith('/') || /[\\\0]/.test(asset.embeddedAssetFilename)
      || asset.embeddedAssetFilename.split('/').some(part => part === '..')) {
      throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'An embedded asset requires a packagerHash, type, and relative rawfile path.');
    }
    if (typeof asset.hash !== 'string' || !/^[A-Za-z0-9_-]{43}=?$/.test(asset.hash)) {
      throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'An embedded asset requires a Base64URL SHA-256 digest.');
    }
    return { launch: index === 0, key: asset.packagerHash, url: '', hash: asset.hash, type: 'application/octet-stream',
      extension: asset.type ? '.' + asset.type.replace(/^\./, '') : '', headers: {}, embedded: asset.embeddedAssetFilename };
  });
  const unique = assets.filter((asset, index) => assets.findIndex(value => value.key === asset.key) === index);

  return { id, scope, runtime, time, manifest: { ...raw, isVerified: true }, assets: unique, url, headers: { ...headers },
    status: 'embedded', successful: 0, failed: 0, accessed: Date.now() };
}

export async function parseUpdateResponse(
  status: number, headers: Headers, body: string, scope: string, url: string, request: Headers,
  verify: VerifySignature, compatibility: boolean = false
): Promise<UpdateResponse> {
  const versionValue = headers['expo-protocol-version'];
  const version = versionValue === undefined ? null : (/^[01]$/.test(versionValue) ? Number(versionValue) : NaN);
  const result: UpdateResponse = {
    headers: headerDictionary(headers['expo-server-defined-headers']),
    filters: headerDictionary(headers['expo-manifest-filters']),
  };
  if (status === 204 && version !== null && version > 0) return result;
  if (status < 200 || status >= 300) throw new ExpoUpdatesError('ERR_UPDATES_HTTP', `Update server returned HTTP ${status}: ${body.slice(0, 1024)}`);
  if (version !== 0 && version !== 1) throw new ExpoUpdatesError('ERR_UPDATES_PROTOCOL', `Unsupported expo-protocol-version: ${version}`);

  const parts = headers['content-type']?.toLowerCase().startsWith('multipart/')
    ? multipart(body, headers['content-type']) : { manifest: { body, headers } };
  if (compatibility && !parts.manifest) throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Protocol 0 compatibility requires a manifest part.');

  let extensions: Json;

  try { extensions = parts.extensions ? JSON.parse(parts.extensions.body) : {}; }
  catch (error) { throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', `Invalid update extensions JSON: ${String(error)}`); }
  if (!isRecord(extensions) || (extensions.assetRequestHeaders !== undefined && !isRecord(extensions.assetRequestHeaders))) {
    throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Invalid update extensions.');
  }

  if (parts.manifest) {
    const part = parts.manifest;
    const signing = await verify(part.body, part.headers['expo-signature'], parts.certificate_chain?.body);
    let value: Json;

    try { value = JSON.parse(part.body); } catch (error) { throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', `Invalid manifest JSON: ${String(error)}`); }

    const manifest = new ExpoUpdatesManifest(value);
    if (signing.projectId !== undefined && (signing.projectId !== manifest.getEASProjectID() || signing.scopeKey !== manifest.getScopeKey())) {
      throw new ExpoUpdatesError('ERR_UPDATES_CODE_SIGNING', 'The manifest does not match the signing certificate project and scope.');
    }

    const id = manifest.getID().toLowerCase();
    const parsed = Date.parse(manifest.getCreatedAt());
    const time = Number.isFinite(parsed) ? parsed : Date.now();
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) {
      throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'An update requires a UUID.');
    }

    const values = manifest.getAssets() ?? [];
    const assets = [manifest.getLaunchAsset(), ...values].map((value, index) => asset(value, extensions.assetRequestHeaders ?? {}, index === 0))
      .filter((asset, index, assets) => assets.findIndex(value => value.key === asset.key) === index);
    result.update = {
      id, scope, time, runtime: manifest.getRuntimeVersion(), manifest: { ...value, isVerified: signing.verified }, assets,
      url, headers: { ...request }, status: manifest.isDevelopmentMode() ? 'development' : 'pending',
      successful: 0, failed: 0, accessed: Date.now(),
    };
    if (!matchesFilters(result.update, result.filters)) throw new ExpoUpdatesError('ERR_UPDATES_MANIFEST', 'Downloaded manifest does not match its filters.');
  }

  if (parts.directive && !compatibility) {
    const part = parts.directive;
    const signing = await verify(part.body, part.headers['expo-signature'], parts.certificate_chain?.body);
    let value: Json;

    try { value = JSON.parse(part.body); } catch (error) { throw new ExpoUpdatesError('ERR_UPDATES_DIRECTIVE', `Invalid directive JSON: ${String(error)}`); }
    if (!isRecord(value)) throw new ExpoUpdatesError('ERR_UPDATES_DIRECTIVE', 'An update directive must be a JSON object.');
    if (signing.projectId !== undefined && (signing.projectId !== value.extra?.signingInfo?.projectId || signing.scopeKey !== value.extra?.signingInfo?.scopeKey)) {
      throw new ExpoUpdatesError('ERR_UPDATES_CODE_SIGNING', 'The directive does not match the signing certificate project and scope.');
    }
    if (value.type === 'noUpdateAvailable') result.directive = { type: value.type };
    else if (value.type === 'rollBackToEmbedded' && Number.isFinite(Date.parse(value.parameters?.commitTime))) {
      result.directive = { type: value.type, time: Date.parse(value.parameters.commitTime) };
    } else throw new ExpoUpdatesError('ERR_UPDATES_DIRECTIVE', `Invalid update directive: ${value.type}`);
  }

  return result;
}
