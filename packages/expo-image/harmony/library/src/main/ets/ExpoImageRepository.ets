import { ExpoFileAccessKey, ExpoModuleContext, fileUriFromPath } from '@expo-harmony/expo-modules-core';
import { common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { http } from '@kit.NetworkKit';
import fs from '@ohos.file.fs';
import fileHash from '@ohos.file.hash';
import image from '@ohos.multimedia.image';
import util from '@ohos.util';
import { decodeBlurhash, decodeThumbhash } from './ExpoImageHash';
import { colorComponents, copyPixelMap, tintPixelMap, ExifOrientation, readOrientation, orientPixelMap, animationIterations } from './ExpoImageUtils';
import { ExpoImageError } from './ExpoImageError';
import { filePathFromUri, packagedResourceName } from './ExpoImageUtils';

const MAX_SOURCE_BYTES: number = 100 * 1024 * 1024;
const CONNECT_TIMEOUT_MS: number = 15_000;
const READ_TIMEOUT_MS: number = 60_000;
const IO_CHUNK_BYTES: number = 64 * 1024;
const MAX_DECODED_BYTES: number = 256 * 1024 * 1024;
const SVG_MEDIA_TYPE: string = 'image/svg+xml';

export type CachePolicy = 'none' | 'disk' | 'memory' | 'memory-disk';
export type CacheType = 'none' | 'disk' | 'memory';
type DecodeInput = string | ArrayBuffer;

export interface ImageSourceRecord {
  uri?: string;
  width?: number | null;
  height?: number | null;
  scale?: number | null;
  headers?: Record<string, string>;
  cacheKey?: string;
  isAnimated?: boolean;
}

export interface ImageLoadOptions {
  maxWidth?: number;
  maxHeight?: number;
  tintColor?: number | string | null;
  priority?: string;
  decodeFormat?: string;
  contentFit?: string;
}

export interface ImageCacheConfig {
  maxDiskSize?: number;
  maxMemoryCost?: number;
  maxMemoryCount?: number;
}

export interface ImageProgress {
  loaded: number;
  total: number;
}

export type ImageProgressCallback = (progress: ImageProgress) => void;

export class ExpoImageLoadCancellation {
  private readonly listeners: Set<() => void> = new Set();
  private cancelled: boolean = false;

  cancel(): void {
    if (this.cancelled) return;

    this.cancelled = true;
    for (const listener of this.listeners) listener();

    this.listeners.clear();
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  subscribe(listener: () => void): () => void {
    if (this.cancelled) {
      listener();
      return (): void => {};
    }

    this.listeners.add(listener);

    return (): void => {
      this.listeners.delete(listener);
    };
  }
}

class DownloadResult {
  readonly buffer: ArrayBuffer;
  readonly contentType: string | undefined;

  constructor(buffer: ArrayBuffer, contentType?: string) {
    this.buffer = buffer;
    this.contentType = contentType;
  }
}

class RequestTracker {
  private readonly requests: Set<http.HttpRequest> = new Set();
  private cancelled: boolean = false;
  private code: string = 'ERR_IMAGE_LOAD_CANCELLED';
  private message: string = 'The image load was cancelled.';

  add(request: http.HttpRequest): void {
    if (this.cancelled) {
      try {
        request.destroy();
      } catch (_) {}

      throw new ExpoImageError(this.code, this.message);
    }

    this.requests.add(request);
  }

  remove(request: http.HttpRequest): void {
    this.requests.delete(request);
  }

  cancelAll(code: string = 'ERR_IMAGE_LOAD_CANCELLED', message: string = 'The image load was cancelled.'): void {
    if (this.cancelled) return;

    this.cancelled = true;
    this.code = code;
    this.message = message;

    for (const request of this.requests) {
      try {
        request.destroy();
      } catch (_) {}
    }

    this.requests.clear();
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  throwIfCancelled(): void {
    if (this.cancelled) throw new ExpoImageError(this.code, this.message);
  }
}

class PendingImageSubscriber {
  readonly progress: ImageProgressCallback | undefined;

  constructor(progress?: ImageProgressCallback) {
    this.progress = progress;
  }
}

class PendingImageLoad {
  readonly promise: Promise<ExpoImageResource>;
  readonly tracker: RequestTracker;
  private readonly subscribers: Set<PendingImageSubscriber> = new Set();
  private readonly retain: (resource: ExpoImageResource) => void;
  private readonly release: (resource: ExpoImageResource) => void;
  private readonly finish: () => void;
  private resource: ExpoImageResource | undefined;
  private settled: boolean = false;
  private accepting: boolean = true;

  constructor(
    promise: Promise<ExpoImageResource>,
    tracker: RequestTracker,
    retain: (resource: ExpoImageResource) => void,
    release: (resource: ExpoImageResource) => void,
    finish: () => void,
  ) {
    this.promise = promise;
    this.tracker = tracker;
    this.retain = retain;
    this.release = release;
    this.finish = finish;

    void promise
      .then((resource: ExpoImageResource): void => {
        this.settled = true;
        this.resource = resource;
        this.retain(resource);
        if (this.subscribers.size === 0) this.deactivate();
      })
      .catch((): void => {
        this.settled = true;
        this.deactivate();
      });
  }

  addSubscriber(subscriber: PendingImageSubscriber): boolean {
    if (!this.accepting) return false;

    this.subscribers.add(subscriber);
    return true;
  }

  removeSubscriber(subscriber: PendingImageSubscriber): void {
    if (!this.subscribers.delete(subscriber)) return;

    if (this.subscribers.size === 0) {
      if (!this.settled) this.tracker.cancelAll();
      this.deactivate();
    }
  }

  hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  notify(progress: ImageProgress): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber.progress?.(progress);
      } catch (error) {
        console.warn(`Expo Image progress observer failed: ${String(error)}`);
      }
    }
  }

  cancel(code: string, message: string): void {
    this.tracker.cancelAll(code, message);
    this.subscribers.clear();

    this.deactivate();
  }

  private deactivate(): void {
    if (this.accepting) {
      this.accepting = false;
      this.finish();
    }

    if (this.subscribers.size === 0 && this.resource !== undefined) {
      const resource = this.resource;
      this.resource = undefined;
      this.release(resource);
    }
  }
}

class DiskPathProtection {
  private static readonly counts: Map<string, number> = new Map();

  static retain(path: string): void {
    DiskPathProtection.counts.set(path, (DiskPathProtection.counts.get(path) ?? 0) + 1);
  }

  static release(path: string): void {
    const count = DiskPathProtection.counts.get(path) ?? 0;
    if (count <= 1) DiskPathProtection.counts.delete(path);
    else DiskPathProtection.counts.set(path, count - 1);
  }

  static snapshot(): Set<string> {
    return new Set(DiskPathProtection.counts.keys());
  }

  static isExclusivelyRetained(path: string): boolean {
    return DiskPathProtection.counts.get(path) === 1;
  }
}

export class ExpoImageResource {
  readonly key: string;
  readonly uri: string;
  readonly frames: image.PixelMap[];
  readonly delays: number[];
  readonly iterations: number;
  readonly width: number;
  readonly height: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly scale: number;
  readonly mediaType: string | null;
  readonly isAnimated: boolean;
  readonly memoryBytes: number;
  readonly cacheType: CacheType;
  retainCount: number = 0;
  memoryCached: boolean = false;
  lastAccess: number = Date.now();
  private disposal?: Promise<void>;

  constructor(
    key: string,
    uri: string,
    frames: image.PixelMap[],
    delays: number[],
    width: number,
    height: number,
    scale: number,
    mediaType: string | null,
    isAnimated: boolean,
    cacheType: CacheType,
    iterations: number = -1,
  ) {
    this.key = key;
    this.uri = uri;
    this.frames = frames;
    this.delays = delays;
    this.iterations = iterations;
    this.pixelWidth = width;
    this.pixelHeight = height;
    this.scale = scale > 0 ? scale : 1;
    this.width = width / this.scale;
    this.height = height / this.scale;
    this.mediaType = mediaType;
    this.isAnimated = isAnimated;
    this.memoryBytes = frames.reduce((bytes: number, pixel: image.PixelMap): number => bytes + pixel.getPixelBytesNumber(), 0);
    this.cacheType = cacheType;
  }

  dispose(): Promise<void> {
    if (this.disposal === undefined) {
      this.disposal = Promise.all(
        this.frames.map(
          (pixel: image.PixelMap): Promise<void> =>
            pixel.release().catch((error: Object): void => {
              console.warn(`Expo Image could not release a PixelMap: ${String(error)}`);
            }),
        ),
      ).then((): void => {});
    }
    return this.disposal;
  }
}

export class ExpoImageLease {
  readonly resource: ExpoImageResource;
  readonly cacheType: CacheType;
  private repository: ExpoImageRepository | undefined;

  constructor(repository: ExpoImageRepository, resource: ExpoImageResource, cacheType?: CacheType) {
    this.repository = repository;
    this.resource = resource;
    this.cacheType = cacheType ?? resource.cacheType;
    this.repository.retain(resource);
  }

  release(): void {
    const repository = this.repository;
    if (repository === undefined) return;

    this.repository = undefined;
    repository.release(this.resource);
  }

  acquire(): ExpoImageLease {
    if (this.repository === undefined) throw new ExpoImageError('ERR_IMAGE_INVALID_REF', 'The image reference was released.');
    return new ExpoImageLease(this.repository, this.resource, this.cacheType);
  }
}

function hasMemory(policy: CachePolicy): boolean {
  return policy === 'memory' || policy === 'memory-disk';
}

function hasDisk(policy: CachePolicy): boolean {
  return policy === 'disk' || policy === 'memory-disk';
}

function normalizedPolicy(value?: string): CachePolicy {
  if (value === 'none' || value === 'disk' || value === 'memory' || value === 'memory-disk') return value;
  return 'disk';
}

function requestPriority(value?: string): number {
  if (value === 'high') return 750;
  if (value === 'low') return 250;
  return 500;
}

function finitePositive(value?: number | null): number | undefined {
  return value !== undefined && value !== null && Number.isFinite(value) && value > 0 ? value : undefined;
}

function copyHeaders(headers?: Record<string, string> | null): Record<string, string> {
  if (headers === undefined) return {};
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    throw new ExpoImageError('ERR_IMAGE_INVALID_HEADER', 'Image request headers must be an object.');
  }

  const output: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    const name = key.trim();
    const value = headers[key];
    if (typeof value !== 'string') {
      throw new ExpoImageError('ERR_IMAGE_INVALID_HEADER', 'Image request header values must be strings.');
    }
    if (name.length === 0 || /[\r\n:]/.test(name) || /[\r\n]/.test(value)) {
      throw new ExpoImageError('ERR_IMAGE_INVALID_HEADER', 'Image request headers must not contain control characters.');
    }

    Reflect.set(output, name, value);
  }

  return output;
}

function headerCacheIdentity(headers: Record<string, string>): string {
  const entries = Object.keys(headers).map((key: string): string => `${key.toLowerCase()}:${headers[key]}`);
  entries.sort();

  return JSON.stringify(entries);
}

function imageKey(identity: string, headers: Record<string, string>, source: ImageSourceRecord, options: ImageLoadOptions): string {
  const hash = source.uri?.startsWith('blurhash:/') === true;
  return JSON.stringify([
    identity,
    headerCacheIdentity(headers),
    source.scale ?? 1,
    hash ? source.width : null,
    hash ? source.height : null,
    options.maxWidth ?? null,
    options.maxHeight ?? null,
    options.tintColor ?? null,
    options.decodeFormat ?? 'argb',
    options.contentFit ?? null,
  ]);
}

function headerValue(headers: Object, name: string): string | undefined {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) return String(Reflect.get(headers, key));
  }
  return undefined;
}

function contentType(value?: string): string | undefined {
  const normalized = value?.split(';')[0].trim().toLowerCase();
  return normalized?.startsWith('image/') === true ? normalized : undefined;
}

function hashText(value: string): string {
  const digest = fileHash.createHash('sha256');
  digest.update(new util.TextEncoder('utf-8').encodeInto(value).buffer);
  return digest.digest();
}

function cachePath(directory: string, key: string): string {
  return `${directory}/${hashText(key)}.image`;
}

function temporaryPath(directory: string): string {
  return `${directory}/download-${util.generateRandomUUID(true)}.tmp`;
}

function ensureDirectory(path: string): void {
  if (!fs.accessSync(path)) fs.mkdirSync(path, true);
}

async function writeAll(path: string, buffer: ArrayBuffer): Promise<void> {
  const file = await fs.open(path, fs.OpenMode.CREATE | fs.OpenMode.READ_WRITE | fs.OpenMode.TRUNC);
  let offset = 0;

  try {
    while (offset < buffer.byteLength) {
      const chunk = buffer.slice(offset, Math.min(offset + IO_CHUNK_BYTES, buffer.byteLength));
      const written = await fs.write(file.fd, chunk);
      if (written <= 0) throw new ExpoImageError('ERR_IMAGE_FILE_WRITE', 'The image cache file could not be written.');

      offset += written;
    }
  } finally {
    await fs.close(file.fd);
  }
}

async function dataUriBuffer(uri: string): Promise<ArrayBuffer> {
  const separator = uri.indexOf(',');
  if (separator < 0) throw new ExpoImageError('ERR_IMAGE_INVALID_SOURCE', 'The image data URL has no payload.');

  const meta = uri.slice(5, separator);
  const payload = uri.slice(separator + 1);

  try {
    let buffer: ArrayBuffer;
    if (meta.toLowerCase().split(';').includes('base64')) {
      const base64 = decodeURIComponent(payload);
      assertSourceSize(Math.floor((base64.length * 3) / 4), 'data URL image');
      const bytes = await new util.Base64Helper().decode(base64);

      buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } else {
      // Percent escapes represent bytes, which need not be valid UTF-8 (e.g. JPEG).
      const encoded = new util.TextEncoder('utf-8').encodeInto(payload);
      assertSourceSize(Math.ceil(encoded.byteLength / 3), 'escaped data URL image');
      const bytes = new Uint8Array(encoded.length);
      let count = 0;

      for (let index = 0; index < encoded.length; index += 1) {
        if (encoded[index] === 0x25) {
          const pair = String.fromCharCode(encoded[index + 1], encoded[index + 2]);
          if (!/^[0-9a-f]{2}$/i.test(pair)) throw new ExpoImageError('ERR_IMAGE_INVALID_SOURCE', 'Invalid data URL escape.');
          bytes[count++] = Number.parseInt(pair, 16);
          index += 2;
        } else bytes[count++] = encoded[index];
      }

      assertSourceSize(count, 'data URL image');
      buffer = bytes.buffer.slice(0, count);
    }

    assertSourceSize(buffer.byteLength, 'data URL image');

    return buffer;
  } catch (error) {
    if (error instanceof ExpoImageError) {
      throw new ExpoImageError(error.code, error.message);
    }

    throw new ExpoImageError('ERR_IMAGE_INVALID_SOURCE', 'The image data URL could not be decoded.');
  }
}

function assertSourceSize(size: number, description: string): void {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_SOURCE_BYTES) {
    throw new ExpoImageError('ERR_IMAGE_TOO_LARGE', `The ${description} exceeds the 100 MB safety limit.`);
  }
}

async function readPackagedResource(context: common.UIAbilityContext, name: string): Promise<ArrayBuffer> {
  try {
    const descriptor = await context.resourceManager.getRawFd(name);
    try {
      assertSourceSize(descriptor.length, 'packaged image');
    } finally {
      await context.resourceManager.closeRawFd(name);
    }

    const bytes = await context.resourceManager.getRawFileContent(name);
    assertSourceSize(bytes.byteLength, 'packaged image');

    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch (error) {
    if (error instanceof ExpoImageError) {
      throw new ExpoImageError(error.code, error.message);
    }

    throw new ExpoImageError('ERR_IMAGE_RESOURCE', `The packaged image '${name}' could not be read: ${String(error)}`);
  }
}

async function readLocalFile(uri: string): Promise<ArrayBuffer> {
  let file: fileIo.File | undefined;
  try {
    file = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);
    const size = (await fileIo.stat(file.fd)).size;
    assertSourceSize(size, 'local image');

    const bytes = new Uint8Array(size);
    let offset = 0;

    while (offset < size) {
      const chunk = new ArrayBuffer(Math.min(IO_CHUNK_BYTES, size - offset));
      const read = await fileIo.read(file.fd, chunk);
      if (read <= 0) throw new ExpoImageError('ERR_IMAGE_FILE_READ', 'The local image could not be read completely.');

      bytes.set(new Uint8Array(chunk, 0, read), offset);
      offset += read;
    }

    return bytes.buffer;
  } catch (error) {
    if (error instanceof ExpoImageError) {
      throw new ExpoImageError(error.code, error.message);
    }

    throw new ExpoImageError('ERR_IMAGE_RESOURCE', `The local image could not be opened: ${String(error)}`);
  } finally {
    if (file !== undefined) {
      try {
        await fileIo.close(file.fd);
      } catch (_) {}
    }
  }
}

async function localInput(context: common.UIAbilityContext, uri: string): Promise<DecodeInput> {
  if (/^asset:\/\//i.test(uri)) {
    return await readPackagedResource(context, resolvePackagedResourceName(uri, true));
  }
  if (/^rawfile:\/\//i.test(uri)) {
    return await readPackagedResource(context, resolvePackagedResourceName(uri, false));
  }
  if (uri.startsWith('/')) return await readLocalFile(uri);
  if (/^file:\/\//i.test(uri)) {
    try {
      return await readLocalFile(filePathFromUri(uri));
    } catch (error) {
      if (error instanceof ExpoImageError) throw new ExpoImageError(error.code, error.message);
      throw new ExpoImageError('ERR_IMAGE_INVALID_SOURCE', String(error));
    }
  }
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(uri)) {
    throw new ExpoImageError('ERR_IMAGE_UNSUPPORTED_SOURCE', 'The image source uses an unsupported URI scheme.');
  }
  return await readPackagedResource(context, resolvePackagedResourceName(uri, false));
}

function resolvePackagedResourceName(uri: string, metroAsset: boolean): string {
  try {
    return packagedResourceName(uri, metroAsset);
  } catch (error) {
    throw new ExpoImageError('ERR_IMAGE_INVALID_SOURCE', String(error));
  }
}

async function download(
  uri: string,
  headers: Record<string, string>,
  priority: number,
  tracker: RequestTracker,
  progress?: ImageProgressCallback,
): Promise<DownloadResult> {
  const request = http.createHttp();
  tracker.add(request);

  request.on('dataReceiveProgress', (value: http.DataReceiveProgressInfo): void => {
    if (!tracker.isCancelled()) {
      progress?.({ loaded: value.receiveSize, total: value.totalSize < 0 ? 0 : value.totalSize });
    }
  });

  try {
    const response = await request.request(uri, {
      method: http.RequestMethod.GET,
      header: headers,
      expectDataType: http.HttpDataType.ARRAY_BUFFER,
      connectTimeout: CONNECT_TIMEOUT_MS,
      readTimeout: READ_TIMEOUT_MS,
      maxLimit: MAX_SOURCE_BYTES,
      usingCache: false,
      priority,
    });

    tracker.throwIfCancelled();
    if (response.responseCode < 200 || response.responseCode >= 300) {
      throw new ExpoImageError('ERR_IMAGE_HTTP_STATUS', `Image request failed with HTTP status ${response.responseCode}.`);
    }
    if (!(response.result instanceof ArrayBuffer)) {
      throw new ExpoImageError('ERR_IMAGE_DOWNLOAD', 'The image response did not contain binary data.');
    }
    if (response.result.byteLength > MAX_SOURCE_BYTES) {
      throw new ExpoImageError('ERR_IMAGE_TOO_LARGE', 'The downloaded image exceeds the 100 MB safety limit.');
    }

    if (!tracker.isCancelled()) {
      progress?.({ loaded: response.result.byteLength, total: response.result.byteLength });
    }

    return new DownloadResult(response.result, contentType(headerValue(response.header, 'content-type')));
  } catch (error) {
    if (error instanceof ExpoImageError) {
      throw new ExpoImageError(error.code, error.message);
    }
    if (tracker.isCancelled()) {
      tracker.throwIfCancelled();
    }

    console.error(`Expo Image download failed for '${uri}': ${String(error)}`);
    throw new ExpoImageError('ERR_IMAGE_DOWNLOAD', 'The image could not be downloaded.');
  } finally {
    tracker.remove(request);
    try {
      request.destroy();
    } catch (_) {}
  }
}

function createImageSource(input: DecodeInput): image.ImageSource {
  if (typeof input === 'string') return image.createImageSource(input);
  return image.createImageSource(input);
}

export class ExpoImageRepository {
  private readonly context: ExpoModuleContext;
  private readonly directory: string;
  private readonly memory: Map<string, ExpoImageResource> = new Map();
  private readonly pending: Map<string, PendingImageLoad> = new Map();
  private readonly resources: Set<ExpoImageResource> = new Set();
  private maxDiskSize: number = 0;
  private maxMemoryCost: number = 0;
  private maxMemoryCount: number = 0;
  private destroyed: boolean = false;

  constructor(context: ExpoModuleContext) {
    this.context = context;
    this.directory = `${context.cachePath}/expo-image`;
    ensureDirectory(this.directory);
  }

  configure(config: ImageCacheConfig): void {
    this.assertAlive();

    if (config.maxDiskSize !== undefined) this.maxDiskSize = this.cacheLimit(config.maxDiskSize, 'maxDiskSize');
    if (config.maxMemoryCost !== undefined) this.maxMemoryCost = this.cacheLimit(config.maxMemoryCost, 'maxMemoryCost');
    if (config.maxMemoryCount !== undefined) this.maxMemoryCount = this.cacheLimit(config.maxMemoryCount, 'maxMemoryCount');

    this.evictMemory();
    this.evictDisk();
  }

  async load(
    source: ImageSourceRecord,
    cachePolicy?: string,
    options: ImageLoadOptions = {},
    progress?: ImageProgressCallback,
    cancellation?: ExpoImageLoadCancellation,
  ): Promise<ExpoImageLease> {
    this.assertAlive();
    if (cancellation?.isCancelled()) {
      throw new ExpoImageError('ERR_IMAGE_LOAD_CANCELLED', 'The image load was cancelled.');
    }

    if (source.uri !== undefined && typeof source.uri !== 'string') {
      throw new ExpoImageError('ERR_IMAGE_INVALID_SOURCE', 'The image source URI must be a string.');
    }

    const uri = source.uri?.trim() ?? '';
    if (uri.length === 0) throw new ExpoImageError('ERR_IMAGE_INVALID_SOURCE', 'The image source URI is empty.');
    if (uri.startsWith('sf:/')) throw new ExpoImageError('ERR_IMAGE_UNSUPPORTED_SOURCE', 'SF Symbols are not available on HarmonyOS.');

    const policy = normalizedPolicy(cachePolicy);
    const headers = copyHeaders(source.headers);
    const identity = source.cacheKey ?? uri;
    const key = imageKey(identity, headers, source, options);

    if (hasMemory(policy)) {
      const fallback = options.contentFit !== undefined && options.tintColor == null ? imageKey(identity, headers, source, {}) : key;
      let cached = this.memory.get(key);

      if (cached === undefined) {
        const original = this.memory.get(fallback);

        // SVG prefetches contain natural-size pixels, not scalable vector data.
        if (original?.mediaType !== SVG_MEDIA_TYPE && (options.decodeFormat ?? 'argb') === 'argb') cached = original;
      }

      if (cached !== undefined) {
        cached.lastAccess = Date.now();

        return new ExpoImageLease(this, cached, 'memory');
      }
    }

    const taskKey = `${key}\u0000${policy}`;
    const subscriber = new PendingImageSubscriber(progress);
    let pending = this.pending.get(taskKey);

    if (pending === undefined || !pending.addSubscriber(subscriber)) {
      const tracker = new RequestTracker();
      let entry: PendingImageLoad | undefined;
      const promise = this.loadResource(source, uri, identity, key, policy, options, (event: ImageProgress): void => entry?.notify(event), tracker);

      entry = new PendingImageLoad(
        promise,
        tracker,
        (resource: ExpoImageResource): void => this.retain(resource),
        (resource: ExpoImageResource): void => this.release(resource),
        (): void => {
          if (entry !== undefined && this.pending.get(taskKey) === entry) {
            this.pending.delete(taskKey);
          }
        },
      );
      pending = entry;
      this.pending.set(taskKey, pending);
      pending.addSubscriber(subscriber);
    }

    const task = pending;
    let unsubscribe: (() => void) | undefined;
    let cancelled: Promise<ExpoImageResource> | undefined;

    if (cancellation !== undefined) {
      let fail: ((error: ExpoImageError) => void) | undefined;
      cancelled = new Promise<ExpoImageResource>((_: (resource: ExpoImageResource) => void, reject: (error: ExpoImageError) => void): void => {
        fail = reject;
      });

      unsubscribe = cancellation.subscribe((): void => {
        task.removeSubscriber(subscriber);
        fail?.(new ExpoImageError('ERR_IMAGE_LOAD_CANCELLED', 'The image load was cancelled.'));
      });
    }

    try {
      const resource = cancelled === undefined ? await task.promise : await Promise.race([task.promise, cancelled]);

      if (cancellation?.isCancelled()) {
        throw new ExpoImageError('ERR_IMAGE_LOAD_CANCELLED', 'The image load was cancelled.');
      }

      if (this.destroyed) {
        this.discard(resource);
        throw new ExpoImageError('ERR_IMAGE_RUNTIME_DESTROYED', 'The Expo Image repository has been destroyed.');
      }

      return new ExpoImageLease(this, resource);
    } finally {
      unsubscribe?.();
      task.removeSubscriber(subscriber);

      if (!task.hasSubscribers() && this.pending.get(taskKey) === task) {
        this.pending.delete(taskKey);
      }
    }
  }

  async pixelForHash(resource: ExpoImageResource, maxSize?: number): Promise<image.PixelMap> {
    return await copyPixelMap(resource.frames[0], maxSize);
  }

  adoptPixelMap(pixel: image.PixelMap): ExpoImageLease {
    if (this.destroyed) {
      pixel.release().catch((): void => {});
      this.assertAlive();
    }

    const info = pixel.getImageInfoSync();
    const resource = new ExpoImageResource(
      util.generateRandomUUID(),
      '',
      [pixel],
      [],
      info.size.width,
      info.size.height,
      1,
      info.mimeType || null,
      false,
      'none',
    );
    this.resources.add(resource);

    return new ExpoImageLease(this, resource);
  }

  async tintLease(lease: ExpoImageLease, color: number | string): Promise<ExpoImageLease> {
    const frames: image.PixelMap[] = [];
    try {
      const source = lease.resource;
      const tint = colorComponents(color);
      for (const frame of source.frames) frames.push(await tintPixelMap(frame, tint));

      this.assertAlive();
      const resource = new ExpoImageResource(
        util.generateRandomUUID(),
        source.uri,
        frames,
        source.delays,
        source.pixelWidth,
        source.pixelHeight,
        source.scale,
        source.mediaType,
        source.isAnimated,
        'memory',
        source.iterations,
      );
      this.resources.add(resource);
      return new ExpoImageLease(this, resource, 'memory');
    } catch (error) {
      for (const frame of frames) await frame.release();

      if (error instanceof ExpoImageError) throw new ExpoImageError(error.code, error.message);
      throw new ExpoImageError('ERR_IMAGE_TRANSFORM', String(error));
    } finally {
      lease.release();
    }
  }

  async prefetch(urls: string[], policy: string, headers?: Record<string, string>): Promise<boolean> {
    if (urls.length === 0) return true;

    return await new Promise<boolean>((resolve: (value: boolean) => void): void => {
      let remaining = urls.length;
      let resolved = false;
      for (const uri of urls) {
        this.load({ uri, headers }, policy)
          .then((lease: ExpoImageLease): void => {
            lease.release();
            remaining -= 1;
            if (!resolved && remaining === 0) {
              resolved = true;
              resolve(true);
            }
          })
          .catch((error: Object): void => {
            console.warn(`Expo Image prefetch failed for '${uri}': ${String(error)}`);
            if (!resolved) {
              resolved = true;
              resolve(false);
            }
          });
      }
    });
  }

  async clearMemory(): Promise<boolean> {
    const resources = Array.from(this.memory.values());
    for (const resource of resources) resource.memoryCached = false;

    this.memory.clear();

    const releases: Promise<void>[] = [];
    for (const resource of resources) {
      if (resource.retainCount === 0) {
        releases.push(resource.dispose());
        this.resources.delete(resource);
      }
    }

    await Promise.all(releases);

    return true;
  }

  clearDisk(): boolean {
    if (!fs.accessSync(this.directory)) return true;

    let success = true;
    const retained = this.retainedDiskPaths();
    for (const name of fs.listFileSync(this.directory)) {
      const path = `${this.directory}/${name}`;
      if (path.endsWith('.image') && !retained.has(path)) {
        try {
          fs.unlinkSync(path);
        } catch (error) {
          success = false;
          console.warn(`Expo Image could not remove cache file '${path}': ${String(error)}`);
        }
      }
    }

    return success;
  }

  getCachePath(key: string): string | null {
    const path = cachePath(this.directory, key);
    if (!fs.accessSync(path)) return null;

    try {
      fs.utimes(path, Date.now());
    } catch (_) {}

    return path;
  }

  retain(resource: ExpoImageResource): void {
    resource.retainCount += 1;
    resource.lastAccess = Date.now();
  }

  release(resource: ExpoImageResource): void {
    resource.retainCount = Math.max(0, resource.retainCount - 1);

    if (resource.retainCount === 0 && !resource.memoryCached) {
      resource.dispose();
      this.resources.delete(resource);
    }
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;

    for (const pending of this.pending.values()) {
      pending.cancel('ERR_IMAGE_RUNTIME_DESTROYED', 'The Expo Image repository has been destroyed.');
    }
    this.pending.clear();

    this.clearMemory();

    // ArkUI layers and SharedRefs retain their leases through native teardown.
    // Their final release disposes the PixelMaps, even after this module closes.
    for (const resource of this.resources) {
      if (resource.retainCount === 0) {
        resource.dispose();
        this.resources.delete(resource);
      }
    }
  }

  private discard(resource: ExpoImageResource): void {
    if (this.memory.get(resource.key) === resource) this.memory.delete(resource.key);

    resource.memoryCached = false;
    if (resource.retainCount === 0) resource.dispose();

    this.resources.delete(resource);
  }

  private async loadResource(
    source: ImageSourceRecord,
    uri: string,
    cacheKey: string,
    key: string,
    policy: CachePolicy,
    options: ImageLoadOptions,
    progress: ImageProgressCallback | undefined,
    tracker: RequestTracker,
  ): Promise<ExpoImageResource> {
    let input: DecodeInput;
    let diskPath: string | undefined;
    let cacheType: CacheType = 'none';
    let reportedType: string | undefined;

    if (uri.startsWith('blurhash:/') || uri.startsWith('thumbhash:/')) {
      let pixel: image.PixelMap | undefined;
      try {
        const blurhash = uri.startsWith('blurhash:/');
        let encoded: string;
        try {
          encoded = decodeURIComponent(uri.slice(uri.indexOf(':/') + 2));
        } catch (_) {
          throw new ExpoImageError('ERR_IMAGE_INVALID_HASH', 'The hash URI has invalid escaping.');
        }

        pixel = blurhash
          ? decodeBlurhash(encoded, finitePositive(source.width) ?? 16, finitePositive(source.height) ?? 16)
          : await decodeThumbhash(encoded.replace(/\\/g, '/'));

        const info = await pixel.getImageInfo();
        const size = this.desiredSize(
          info.size.width,
          info.size.height,
          finitePositive(options.maxWidth),
          finitePositive(options.maxHeight),
          options.contentFit,
        );
        if (size !== undefined) await pixel.scale(size.width / info.size.width, size.height / info.size.height);

        if (options.tintColor != null) {
          const tinted = await tintPixelMap(pixel, colorComponents(options.tintColor));
          const original = pixel;
          pixel = tinted;
          await original.release();
        }

        const output = await pixel.getImageInfo();
        this.assertAlive();
        tracker.throwIfCancelled();

        const resource = new ExpoImageResource(key, uri, [pixel], [], output.size.width, output.size.height, 1, null, false, 'none');
        this.maybeCache(resource, policy);
        pixel = undefined;

        return resource;
      } catch (error) {
        if (error instanceof ExpoImageError) throw new ExpoImageError(error.code, error.message);
        throw new ExpoImageError('ERR_IMAGE_INVALID_HASH', String(error));
      } finally {
        if (pixel !== undefined) await pixel.release();
      }
    }

    const remote = /^https?:\/\//i.test(uri);
    if (remote && hasDisk(policy)) {
      diskPath = cachePath(this.directory, cacheKey);
      this.retainDiskPath(diskPath);
    }

    try {
      if (diskPath !== undefined) {
        if (fs.accessSync(diskPath)) {
          input = diskPath;
          cacheType = 'disk';
          try {
            fs.utimes(diskPath, Date.now());
          } catch (_) {}
        } else {
          const result = await this.downloadToDisk(uri, source, options, progress, diskPath, tracker);
          reportedType = result.contentType;
          input = diskPath;
        }
      } else if (remote) {
        const result = await download(uri, copyHeaders(source.headers), requestPriority(options.priority), tracker, progress);
        input = result.buffer;
        reportedType = result.contentType;
      } else if (/^data:/i.test(uri)) {
        input = await dataUriBuffer(uri);
        reportedType = contentType(uri.slice(5, uri.indexOf(',')));
      } else {
        if ((uri.startsWith('/') || /^file:\/\//i.test(uri)) && this.context.services.get(ExpoFileAccessKey) !== undefined) {
          this.context.filePathForRead(uri.startsWith('/') ? fileUriFromPath(uri) : uri);
        }
        input = await localInput(this.context.uiAbilityContext, uri);
      }

      let resource: ExpoImageResource;

      try {
        resource = await this.decodeResource(key, uri, input, cacheType, reportedType, source, options);
      } catch (error) {
        tracker.throwIfCancelled();

        const canInvalidate = diskPath !== undefined && DiskPathProtection.isExclusivelyRetained(diskPath);
        if (canInvalidate && diskPath !== undefined && fs.accessSync(diskPath)) {
          try {
            fs.unlinkSync(diskPath);
          } catch (_) {}
        }

        if (remote && cacheType === 'disk' && diskPath !== undefined && canInvalidate) {
          const result = await this.downloadToDisk(uri, source, options, progress, diskPath, tracker);
          reportedType = result.contentType;

          try {
            resource = await this.decodeResource(key, uri, diskPath, 'none', reportedType, source, options);
          } catch (retryError) {
            if (DiskPathProtection.isExclusivelyRetained(diskPath) && fs.accessSync(diskPath)) {
              try {
                fs.unlinkSync(diskPath);
              } catch (_) {}
            }
            if (retryError instanceof ExpoImageError) {
              throw new ExpoImageError(retryError.code, retryError.message);
            }

            throw new ExpoImageError('ERR_IMAGE_DECODE', `The image could not be decoded: ${String(retryError)}`);
          }
        } else {
          if (error instanceof ExpoImageError) {
            throw new ExpoImageError(error.code, error.message);
          }

          throw new ExpoImageError('ERR_IMAGE_DECODE', `The image could not be decoded: ${String(error)}`);
        }
      }

      if (this.destroyed || tracker.isCancelled()) {
        resource.dispose();
        tracker.throwIfCancelled();
        throw new ExpoImageError('ERR_IMAGE_RUNTIME_DESTROYED', 'The Expo Image repository has been destroyed.');
      }

      const result = this.maybeCache(resource, policy);
      if (hasDisk(policy)) this.evictDisk(diskPath);

      return result;
    } finally {
      if (diskPath !== undefined) {
        this.releaseDiskPath(diskPath);
        this.evictDisk();
      }
    }
  }

  private async downloadToDisk(
    uri: string,
    source: ImageSourceRecord,
    options: ImageLoadOptions,
    progress: ImageProgressCallback | undefined,
    path: string,
    tracker: RequestTracker,
  ): Promise<DownloadResult> {
    const result = await download(uri, copyHeaders(source.headers), requestPriority(options.priority), tracker, progress);

    tracker.throwIfCancelled();

    const temp = temporaryPath(this.directory);

    try {
      await writeAll(temp, result.buffer);
      tracker.throwIfCancelled();
      if (fs.accessSync(path)) fs.unlinkSync(temp);
      else fs.moveFileSync(temp, path, 0);
    } catch (error) {
      if (fs.accessSync(temp)) {
        try {
          fs.unlinkSync(temp);
        } catch (_) {}
      }

      throw new ExpoImageError('ERR_IMAGE_FILE_WRITE', `The image cache file could not be committed: ${String(error)}`);
    }

    return result;
  }

  private async decodeResource(
    key: string,
    uri: string,
    input: DecodeInput,
    cache: CacheType,
    reported: string | undefined,
    source: ImageSourceRecord,
    options: ImageLoadOptions,
  ): Promise<ExpoImageResource> {
    let decoder: image.ImageSource;

    try {
      decoder = createImageSource(input);
    } catch (error) {
      console.error(`Expo Image could not open '${uri}': ${String(error)}`);
      throw new ExpoImageError('ERR_IMAGE_DECODE', 'The image source could not be opened.');
    }

    let transient: image.PixelMap[] = [];

    try {
      const info = await decoder.getImageInfo();
      const count = await decoder.getFrameCount();

      if (![info.size.width, info.size.height, count].every((value: number): boolean => Number.isSafeInteger(value) && value > 0)) {
        throw new ExpoImageError('ERR_IMAGE_DECODE', 'The image dimensions and frame count must be positive integers.');
      }

      const orientation = await readOrientation(decoder);
      const swapped = orientation >= ExifOrientation.Transpose;
      const width = swapped ? info.size.height : info.size.width;
      const height = swapped ? info.size.width : info.size.height;
      const animated = count > 1;
      const mime = contentType(info.mimeType) ?? reported ?? null;
      const maxWidth = finitePositive(options.maxWidth);
      const maxHeight = finitePositive(options.maxHeight);
      const bounds = this.desiredSize(width, height, maxWidth, maxHeight, options.contentFit, mime === SVG_MEDIA_TYPE);
      const size: image.Size | undefined = swapped && bounds !== undefined ? { width: bounds.height, height: bounds.width } : bounds;
      const tint = options.tintColor == null ? undefined : colorComponents(options.tintColor);
      const decoded = size ?? info.size;

      if (decoded.width * decoded.height * 4 * count > MAX_DECODED_BYTES) {
        throw new ExpoImageError('ERR_IMAGE_TOO_LARGE', 'Decoded image frames exceed the 256 MiB memory limit.');
      }

      const scale = finitePositive(source.scale) ?? 1;

      if (animated) {
        const delays = await decoder.getDelayTimeList();
        const iterations = await animationIterations(decoder, mime);

        let frames = await decoder.createPixelMapList({
          editable: orientation !== ExifOrientation.Normal,
          desiredSize: size,
          desiredPixelFormat: image.PixelMapFormat.RGBA_8888,
        });
        transient = frames.slice();

        for (const frame of frames) await orientPixelMap(frame, orientation);

        if (frames.length === 0) {
          throw new ExpoImageError('ERR_IMAGE_DECODE', 'The animated image did not contain any decodable frames.');
        }

        if (tint !== undefined) {
          const tinted: image.PixelMap[] = [];

          for (const frame of frames) {
            const pixel = await tintPixelMap(frame, tint);
            tinted.push(pixel);
            transient.push(pixel);
          }

          for (const frame of frames) {
            try {
              await frame.release();
            } catch (_) {}
          }

          frames = tinted;
          transient = tinted.slice();
        }

        const output: image.Size = options.contentFit === undefined ? frames[0].getImageInfoSync().size : { width, height };
        const resource = new ExpoImageResource(key, uri, frames, delays, output.width, output.height, scale, mime, true, cache, iterations);

        transient = [];

        return resource;
      }

      let pixel = await decoder.createPixelMap({
        editable: orientation !== ExifOrientation.Normal,
        desiredSize: size,
        desiredPixelFormat: options.decodeFormat === 'rgb' && tint === undefined ? image.PixelMapFormat.RGB_565 : image.PixelMapFormat.RGBA_8888,
      });
      transient = [pixel];

      await orientPixelMap(pixel, orientation);

      if (tint !== undefined) {
        const tinted = await tintPixelMap(pixel, tint);

        try {
          await pixel.release();
        } catch (_) {}

        pixel = tinted;
        transient = [tinted];
      }

      // Only view requests set contentFit; ImageRef needs the decoded layout size.
      const output: image.Size = options.contentFit === undefined ? pixel.getImageInfoSync().size : { width, height };
      const resource = new ExpoImageResource(key, uri, [pixel], [], output.width, output.height, scale, mime, false, cache);

      transient = [];

      return resource;
    } catch (error) {
      console.error(`Expo Image decode failed for '${uri}': ${String(error)}`);

      if (error instanceof ExpoImageError) {
        throw new ExpoImageError(error.code, error.message);
      }

      throw new ExpoImageError('ERR_IMAGE_DECODE', 'The image could not be decoded.');
    } finally {
      for (const pixel of transient) {
        try {
          await pixel.release();
        } catch (_) {}
      }

      try {
        await decoder.release();
      } catch (_) {}
    }
  }

  private desiredSize(
    width: number,
    height: number,
    maxWidth?: number,
    maxHeight?: number,
    fit?: string,
    vector: boolean = false,
  ): image.Size | undefined {
    if (maxWidth === undefined && maxHeight === undefined) return undefined;

    const horizontal = maxWidth === undefined ? undefined : maxWidth / width;
    const vertical = maxHeight === undefined ? undefined : maxHeight / height;
    let ratio: number;

    if (horizontal === undefined) ratio = vertical as number;
    else if (vertical === undefined) ratio = horizontal;
    else ratio = fit === 'cover' ? Math.max(horizontal, vertical) : Math.min(horizontal, vertical);

    const scale = vector && fit !== 'scale-down' ? ratio : Math.min(1, ratio);
    if (scale === 1) return undefined;

    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  }

  private maybeCache(resource: ExpoImageResource, policy: CachePolicy): ExpoImageResource {
    this.resources.add(resource);

    if (hasMemory(policy)) {
      const previous = this.memory.get(resource.key);
      if (previous !== undefined && previous !== resource) {
        previous.memoryCached = false;
        if (previous.retainCount === 0) {
          previous.dispose();
          this.resources.delete(previous);
        }
      }

      resource.memoryCached = true;
      resource.lastAccess = Date.now();
      this.memory.set(resource.key, resource);
      this.evictMemory(resource);
      const cached = this.memory.get(resource.key);
      if (cached !== undefined) return cached;
    }

    return resource;
  }

  private evictMemory(protectedResource?: ExpoImageResource): void {
    let cost = 0;
    for (const resource of this.memory.values()) cost += resource.memoryBytes;

    const ordered = Array.from(this.memory.values()).sort(
      (left: ExpoImageResource, right: ExpoImageResource): number => left.lastAccess - right.lastAccess,
    );

    while ((this.maxMemoryCount > 0 && this.memory.size > this.maxMemoryCount) || (this.maxMemoryCost > 0 && cost > this.maxMemoryCost)) {
      const resource = ordered.shift();
      if (resource === undefined) break;
      if (this.memory.get(resource.key) !== resource) continue;
      this.memory.delete(resource.key);
      resource.memoryCached = false;
      cost -= resource.memoryBytes;
      if (resource === protectedResource) continue;
      if (resource.retainCount === 0) resource.dispose();
      if (resource.retainCount === 0) this.resources.delete(resource);
    }
  }

  private evictDisk(protectedPath?: string): void {
    if (this.maxDiskSize <= 0 || !fs.accessSync(this.directory)) return;

    const retained = this.retainedDiskPaths();
    const files = fs
      .listFileSync(this.directory)
      .map((name: string): string => `${this.directory}/${name}`)
      .filter((path: string): boolean => path.endsWith('.image'));

    let total = 0;
    const stats: Array<[string, number, number]> = [];

    for (const path of files) {
      try {
        const stat = fs.statSync(path);
        total += stat.size;
        if (!retained.has(path) && path !== protectedPath) stats.push([path, stat.size, stat.mtime]);
      } catch (_) {}
    }

    stats.sort((left: [string, number, number], right: [string, number, number]): number => left[2] - right[2]);

    for (const entry of stats) {
      if (total <= this.maxDiskSize) break;
      try {
        fs.unlinkSync(entry[0]);
        total -= entry[1];
      } catch (_) {}
    }
  }

  private retainedDiskPaths(): Set<string> {
    return DiskPathProtection.snapshot();
  }

  private retainDiskPath(path: string): void {
    DiskPathProtection.retain(path);
  }

  private releaseDiskPath(path: string): void {
    DiskPathProtection.release(path);
  }

  private cacheLimit(value: number | undefined, name: string): number {
    if (value === undefined) return 0;

    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
      throw new ExpoImageError('ERR_IMAGE_INVALID_CACHE_CONFIG', `${name} must be a non-negative integer.`);
    }

    return value;
  }

  private assertAlive(): void {
    if (this.destroyed) throw new ExpoImageError('ERR_IMAGE_RUNTIME_DESTROYED', 'The Expo Image repository has been destroyed.');
  }
}
