import { util } from '@kit.ArkTS';
import { uniformTypeDescriptor } from '@kit.ArkData';
import { deviceInfo } from '@kit.BasicServicesKit';
import { fileUriFromPath } from '@expo-harmony/expo-modules-core';
import { fileIo, fileUri } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { media } from '@kit.MediaKit';

import { EXIF_KEYS, decodeExifProperties, orientationCode } from './ExpoImagePickerExif';
import { ExpoImagePickerError } from './ExpoImagePickerError';

const CACHE_DIRECTORY: string = 'expo-image-picker';
const AV_METADATA_CAPABILITY: string = 'SystemCapability.Multimedia.Media.AVMetadataExtractor';
const READ_CHUNK_SIZE: number = 64 * 1024;
const JPEG_MIME_TYPE: string = 'image/jpeg';
const VIDEO_MP4_MIME_TYPE: string = 'video/mp4';
const PNG_MIME_TYPE: string = 'image/png';
const GIF_MIME_TYPE: string = 'image/gif';
const BMP_MIME_TYPE: string = 'image/bmp';
const WEBP_MIME_TYPE: string = 'image/webp';
const FILE_URI_PREFIX: string = 'file://';
const ROTATED_ORIENTATIONS: number[] = [5, 6, 7, 8];
const CODE_CAPTURE_FILE: string = 'ERR_IMAGE_PICKER_CAPTURE_FILE';
const CODE_MEDIA_PROCESSING: string = 'ERR_IMAGE_PICKER_MEDIA_PROCESSING';
const CODE_FILE_READ: string = 'ERR_IMAGE_PICKER_FILE_READ';
const CODE_CACHE: string = 'ERR_IMAGE_PICKER_CACHE';
const CODE_UNAVAILABLE: string = 'ERR_IMAGE_PICKER_UNAVAILABLE';

export type PickerMediaType = 'image' | 'video';

export interface ProcessingOptions {
  quality: number;
  base64: boolean;
  exif: boolean;
}

interface ImageInfo {
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  fileName?: string;
}

interface VideoInfo {
  width: number;
  height: number;
  duration: number | null;
  rotation: number | null;
  mimeType: string;
  fileSize: number;
  fileName?: string;
}

export class ImagePickerAsset {
  assetId: string | null = null;
  type: PickerMediaType;
  uri: string;
  width: number;
  height: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  base64?: string;
  exif?: Record<string, ESObject>;
  duration?: number | null;
  rotation?: number | null;

  constructor(type: PickerMediaType, uri: string, width: number, height: number, fileName: string, fileSize: number, mimeType: string) {
    this.type = type;
    this.uri = uri;
    this.width = width;
    this.height = height;
    this.fileName = fileName;
    this.fileSize = fileSize;
    this.mimeType = mimeType;
  }
}

export interface CaptureFile {
  path: string;
  uri: string;
}

export async function createCapture(cache: string, type: PickerMediaType): Promise<CaptureFile> {
  const dir = `${cache}/${CACHE_DIRECTORY}`;
  await ensureDirectory(dir);

  const mime = type === 'video' ? VIDEO_MP4_MIME_TYPE : JPEG_MIME_TYPE;
  const path = `${dir}/${uniqueFilename('capture', extensionForMime(mime, 'tmp'))}`;
  let file: fileIo.File | undefined;

  try {
    file = await fileIo.open(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);

    return { path, uri: fileUri.getUriFromPath(path) };
  } catch (cause) {
    await removeFile(path);

    if (cause instanceof ExpoImagePickerError) {
      throw new ExpoImagePickerError(cause.code, cause.message, cause);
    }

    throw new ExpoImagePickerError(CODE_CAPTURE_FILE, `Failed to prepare the camera output file: ${String(cause)}`, cause as Object);
  } finally {
    await closeFile(file);
  }
}

export async function removeCapture(file: CaptureFile): Promise<void> {
  await removeFile(file.path);
}

export async function exportImage(uri: string, cache: string, options: ProcessingOptions, name?: string): Promise<ImagePickerAsset> {
  let path: string | undefined;

  try {
    const source = await inspectImage(uri);

    const compress = options.quality < 1;
    const mime = compress ? compressionMimeType(source.mimeType) : source.mimeType;

    const dir = `${cache}/${CACHE_DIRECTORY}`;
    await ensureDirectory(dir);

    const filename = uniqueFilename('image', extensionForMime(mime, 'img'));
    path = `${dir}/${filename}`;

    if (compress) {
      await packImage(uri, path, mime, options.quality);
    } else {
      await copyFile(uri, path);
    }

    const output = await inspectImage(path);
    const original = name ?? source.fileName ?? filename;
    const display = mime === source.mimeType ? original : replaceExtension(original, filename);
    const asset = new ImagePickerAsset('image', fileUriFromPath(path), output.width, output.height, display, output.fileSize, output.mimeType);

    if (options.base64) {
      asset.base64 = compress && mime !== JPEG_MIME_TYPE ? await encodeJpegBase64(path, options.quality) : await readBase64(path);
    }

    if (options.exif) asset.exif = await readExif(path);

    return asset;
  } catch (cause) {
    if (path !== undefined) await removeFile(path);

    if (cause instanceof ExpoImagePickerError) {
      throw new ExpoImagePickerError(cause.code, cause.message, cause);
    }

    throw new ExpoImagePickerError(CODE_MEDIA_PROCESSING, `Failed to process the selected image: ${String(cause)}`, cause as Object);
  }
}

export async function exportVideo(uri: string, cache: string, name?: string): Promise<ImagePickerAsset> {
  let path: string | undefined;

  try {
    const info = await inspectVideo(uri);

    const dir = `${cache}/${CACHE_DIRECTORY}`;
    await ensureDirectory(dir);

    const filename = uniqueFilename('video', extensionForMime(info.mimeType, 'video'));
    path = `${dir}/${filename}`;

    await copyFile(uri, path);

    const asset = new ImagePickerAsset(
      'video',
      fileUriFromPath(path),
      info.width,
      info.height,
      name ?? info.fileName ?? filename,
      checkedFileSize((await fileIo.stat(path)).size),
      info.mimeType,
    );
    asset.duration = info.duration;
    asset.rotation = info.rotation;

    return asset;
  } catch (cause) {
    if (path !== undefined) await removeFile(path);

    if (cause instanceof ExpoImagePickerError) {
      throw new ExpoImagePickerError(cause.code, cause.message, cause);
    }

    throw new ExpoImagePickerError(CODE_MEDIA_PROCESSING, `Failed to process the selected video: ${String(cause)}`, cause as Object);
  }
}

export async function removeAssets(assets: ImagePickerAsset[]): Promise<void> {
  for (const asset of assets) {
    if (asset.uri.startsWith(FILE_URI_PREFIX)) {
      await removeFile(new fileUri.FileUri(asset.uri).path);
    }
  }
}

async function inspectImage(uri: string): Promise<ImageInfo> {
  let file: fileIo.File | undefined;
  let source: image.ImageSource | undefined;

  try {
    file = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);
    const stat = await fileIo.stat(file.fd);
    source = image.createImageSource(file.fd);

    const info = await source.getImageInfo();
    const orientation = await readOrientation(source);
    const rotated = orientation !== undefined && ROTATED_ORIENTATIONS.includes(orientation);

    return {
      width: rotated ? info.size.height : info.size.width,
      height: rotated ? info.size.width : info.size.height,
      mimeType: requireMimeType(info.mimeType, 'image/'),
      fileSize: checkedFileSize(stat.size),
      fileName: file.name.length > 0 ? file.name : undefined,
    };
  } finally {
    await releaseImageSource(source);
    await closeFile(file);
  }
}

async function readOrientation(source: image.ImageSource): Promise<number | undefined> {
  try {
    const data = await source.getImageProperties([image.PropertyKey.ORIENTATION]);
    const value = data[image.PropertyKey.ORIENTATION];
    if (value === null || value === undefined) return undefined;

    return orientationCode(value);
  } catch (_) {
    return undefined;
  }
}

async function inspectVideo(uri: string): Promise<VideoInfo> {
  if (!canIUse(AV_METADATA_CAPABILITY)) {
    throw new ExpoImagePickerError(CODE_UNAVAILABLE, 'The HarmonyOS AVMetadataExtractor capability is unavailable on this device.');
  }

  let file: fileIo.File | undefined;
  let extractor: media.AVMetadataExtractor | undefined;

  try {
    file = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);
    const stat = await fileIo.stat(file.fd);
    extractor = await media.createAVMetadataExtractor();
    extractor.fdSrc = { fd: file.fd, offset: 0, length: stat.size };

    const data = await extractor.fetchMetadata();
    let width = nonNegativeInteger(data.videoWidth) ?? 0;
    let height = nonNegativeInteger(data.videoHeight) ?? 0;
    const rotation = integerValue(data.videoOrientation);
    if (rotation !== undefined && Math.abs(rotation) % 180 !== 0) {
      const previous = width;
      width = height;
      height = previous;
    }

    return {
      width,
      height,
      duration: nonNegativeInteger(data.duration) ?? null,
      rotation: rotation ?? null,
      mimeType: requireMimeType(data.mimeType, 'video/'),
      fileSize: checkedFileSize(stat.size),
      fileName: file.name.length > 0 ? file.name : undefined,
    };
  } finally {
    await releaseMetadataExtractor(extractor);
    await closeFile(file);
  }
}

async function packImage(uri: string, path: string, mime: string, quality: number): Promise<void> {
  let input: fileIo.File | undefined;
  let output: fileIo.File | undefined;
  let source: image.ImageSource | undefined;
  let packer: image.ImagePacker | undefined;

  try {
    input = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);
    output = await fileIo.open(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);
    source = image.createImageSource(input.fd);
    packer = image.createImagePacker();

    await packer.packToFile(source, output.fd, {
      format: mime,
      quality: Math.floor(quality * 100),
      needsPackProperties: true,
    });
  } finally {
    await releaseImagePacker(packer);
    await releaseImageSource(source);
    await closeFile(output);
    await closeFile(input);
  }
}

async function readExif(path: string): Promise<Record<string, ESObject>> {
  let source: image.ImageSource | undefined;

  try {
    source = image.createImageSource(path);
    const mime = (await source.getImageInfo()).mimeType;
    // ImageKit's EXIF APIs support JPEG/PNG/HEIF at the minimum SDK; WebP and
    // DNG are added at API 23. Missing EXIF must not fail an otherwise valid GIF.
    const supported =
      [JPEG_MIME_TYPE, PNG_MIME_TYPE, 'image/heif', 'image/heic'].includes(mime) ||
      (deviceInfo.sdkApiVersion >= 23 && [WEBP_MIME_TYPE, 'image/x-adobe-dng'].includes(mime));
    if (!supported) return {};

    const data = await source.getImageProperties(EXIF_KEYS);

    return data == null ? {} : decodeExifProperties(data);
  } catch (_) {
    // ImageKit can reject the entire batch when the image has no EXIF fields.
    return {};
  } finally {
    await releaseImageSource(source);
  }
}

async function encodeJpegBase64(uri: string, quality: number): Promise<string> {
  // File encoding has no ImagePacker.packToData 25 MB buffer ceiling.
  const path = `${uri}.${util.generateRandomUUID(true)}.jpg`;
  try {
    await packImage(uri, path, JPEG_MIME_TYPE, quality);
    return await readBase64(path);
  } finally {
    await removeFile(path);
  }
}

async function readBase64(path: string): Promise<string> {
  const data = await readBuffer(path);
  return await new util.Base64Helper().encodeToString(new Uint8Array(data));
}

async function readBuffer(path: string): Promise<ArrayBuffer> {
  const stat = await fileIo.stat(path);
  if (!Number.isSafeInteger(stat.size) || stat.size < 0) {
    throw new ExpoImagePickerError(CODE_FILE_READ, 'The selected image has an invalid file size.');
  }

  const data = new ArrayBuffer(stat.size);
  const view = new Uint8Array(data);
  let file: fileIo.File | undefined;
  let offset = 0;

  try {
    file = await fileIo.open(path, fileIo.OpenMode.READ_ONLY);
    while (offset < data.byteLength) {
      const chunk = new ArrayBuffer(Math.min(READ_CHUNK_SIZE, data.byteLength - offset));
      const count = await fileIo.read(file.fd, chunk, { length: chunk.byteLength });
      if (count <= 0) break;

      view.set(new Uint8Array(chunk, 0, count), offset);
      offset += count;
    }
  } finally {
    await closeFile(file);
  }

  if (offset !== data.byteLength) {
    throw new ExpoImagePickerError(CODE_FILE_READ, 'The selected image could not be read completely.');
  }

  return data;
}

async function copyFile(uri: string, path: string): Promise<void> {
  let source: fileIo.File | undefined;

  try {
    source = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);

    await fileIo.copyFile(source.fd, path, 0);
  } finally {
    await closeFile(source);
  }
}

async function ensureDirectory(path: string): Promise<void> {
  if (await fileIo.access(path)) {
    const info = await fileIo.stat(path);
    if (!info.isDirectory()) {
      throw new ExpoImagePickerError(CODE_CACHE, `The image picker cache path '${path}' is not a directory.`);
    }

    return;
  }

  await fileIo.mkdir(path, true);
}

function checkedFileSize(size: number): number {
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new ExpoImagePickerError(CODE_FILE_READ, 'The selected media has an invalid file size.');
  }
  return size;
}

async function removeFile(path: string): Promise<void> {
  try {
    await fileIo.unlink(path);
  } catch (_) {}
}

async function closeFile(file: fileIo.File | undefined): Promise<void> {
  if (file === undefined) return;
  try {
    await fileIo.close(file.fd);
  } catch (_) {}
}

async function releaseImageSource(source: image.ImageSource | undefined): Promise<void> {
  if (source === undefined) return;
  try {
    await source.release();
  } catch (_) {}
}

async function releaseImagePacker(packer: image.ImagePacker | undefined): Promise<void> {
  if (packer === undefined) return;
  try {
    await packer.release();
  } catch (_) {}
}

async function releaseMetadataExtractor(extractor: media.AVMetadataExtractor | undefined): Promise<void> {
  if (extractor === undefined) return;
  try {
    await extractor.release();
  } catch (_) {}
}

function compressionMimeType(mime: string): string {
  return mime === PNG_MIME_TYPE || mime === GIF_MIME_TYPE || mime === BMP_MIME_TYPE || mime === WEBP_MIME_TYPE ? PNG_MIME_TYPE : JPEG_MIME_TYPE;
}

function uniqueFilename(prefix: string, ext: string): string {
  return `${prefix}-${util.generateRandomUUID(true)}.${ext}`;
}

function replaceExtension(name: string, output: string): string {
  const index = name.lastIndexOf('.');
  const stem = index > 0 ? name.slice(0, index) : name;
  return `${stem}${output.slice(output.lastIndexOf('.'))}`;
}

function extensionForMime(mime: string, fallback: string): string {
  const type = uniformTypeDescriptor.getUniformDataTypeByMIMEType(mime);
  const extensions = uniformTypeDescriptor.getTypeDescriptor(type)?.filenameExtensions ?? [];
  const extension = extensions.find((value: string): boolean => /^\.[a-zA-Z0-9]+$/.test(value));
  return extension === undefined ? fallback : extension.slice(1);
}

function requireMimeType(value: string | undefined, prefix: string): string {
  const mime = normalizedMimeType(value);
  if (mime === undefined || !mime.startsWith(prefix)) {
    throw new ExpoImagePickerError(CODE_MEDIA_PROCESSING, 'The selected media has no supported MIME type.');
  }
  return mime;
}

function normalizedMimeType(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const mime = value.split(';')[0].trim().toLowerCase();
  return mime.length > 0 ? mime : undefined;
}

function integerValue(value?: string): number | undefined {
  if (value === undefined) return undefined;
  if (value.trim().length === 0) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function nonNegativeInteger(value?: string): number | undefined {
  const parsed = integerValue(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}
