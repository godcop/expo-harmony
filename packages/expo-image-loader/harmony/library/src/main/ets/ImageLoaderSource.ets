import { util } from '@kit.ArkTS';

export enum ImageLoaderSourceType {
  HTTP,
  DATA,
  RAW_RESOURCE,
  FILE,
}

export class ImageLoaderSource {
  readonly type: ImageLoaderSourceType;
  readonly value: string;

  constructor(type: ImageLoaderSourceType, value: string) {
    this.type = type;
    this.value = value;
  }
}

export function resolveImageLoaderSource(url: string): ImageLoaderSource {
  if (url.length === 0 || url.includes('\0')) throw new Error('The image source is empty or contains a null character.');

  if (/^https?:\/\//i.test(url)) return new ImageLoaderSource(ImageLoaderSourceType.HTTP, url);
  if (/^data:/i.test(url)) return new ImageLoaderSource(ImageLoaderSourceType.DATA, url);
  if (url.startsWith('/')) return new ImageLoaderSource(ImageLoaderSourceType.FILE, url);
  if (/^file:\/\//i.test(url)) {
    return new ImageLoaderSource(ImageLoaderSourceType.FILE, `file://${url.slice('file://'.length)}`);
  }

  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  if (scheme !== null && !/^(?:asset|rawfile):\/\//i.test(url)) throw new Error('The image URI scheme is unsupported.');

  const encoded = url
    .replace(/^(?:asset|rawfile):\/\//i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/, 1)[0];
  if (/%(?:00|2f|5c)/i.test(encoded) || encoded.includes('\\')) throw new Error('The packaged image path is invalid.');

  const path = decodeURIComponent(encoded);
  if (path.split('/').some((part: string): boolean => part.length === 0 || part === '.' || part === '..')) {
    throw new Error('The packaged image path is invalid.');
  }

  // RNOH's Metro asset destination is rawfile/assets; rawfile:// names are relative to rawfile itself.
  return new ImageLoaderSource(ImageLoaderSourceType.RAW_RESOURCE, /^asset:\/\//i.test(url) ? `assets/${path}` : path);
}

export function decodeImageDataURL(url: string): ArrayBuffer {
  const comma = url.indexOf(',');

  if (comma < 0 || !url.startsWith('data:image') || !url.slice(0, comma).endsWith(';base64')) {
    throw new Error('Expected a base64-encoded image data URI.');
  }

  const bytes = new util.Base64Helper().decodeSync(url.slice(comma + 1).replace(/\s/g, ''));

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
