import { ExpoModuleError, ExpoRecordShape, ExpoValueType, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

export enum FlipType {
  VERTICAL = 'vertical',
  HORIZONTAL = 'horizontal',
}

export enum ImageFormat {
  JPEG = 'jpeg',
  JPG = 'jpg',
  PNG = 'png',
  WEBP = 'webp',
}

export class ResizeOptions {
  width?: number | null;
  height?: number | null;
}

export class CropRect {
  originX: number = 0;
  originY: number = 0;
  width: number = 0;
  height: number = 0;
}

export class SaveOptions {
  base64: boolean = false;
  compress: number = 1;
  format: ImageFormat = ImageFormat.JPEG;
}

export const FINITE_NUMBER = new ExpoValueType<number>(
  'finite number',
  (value: ESObject, path: string): number => {
    const result = ExpoValueTypes.number().decode(value, path);
    if (!Number.isFinite(result)) throw new ExpoModuleError('ERR_IMAGE_INVALID_ARGUMENT', `${path} must be finite.`);
    return result;
  },
  (value: number): ESObject => value,
);

export const FLIP_TYPE = ExpoValueTypes.enumerable<FlipType>('FlipType', {
  vertical: FlipType.VERTICAL,
  horizontal: FlipType.HORIZONTAL,
});

const IMAGE_FORMAT = ExpoValueTypes.enumerable<ImageFormat>('ImageFormat', {
  jpeg: ImageFormat.JPEG,
  jpg: ImageFormat.JPG,
  png: ImageFormat.PNG,
  webp: ImageFormat.WEBP,
});

export const RESIZE_OPTIONS = ExpoValueTypes.shapedRecord<ResizeOptions>(
  'ResizeOptions',
  new ExpoRecordShape().field('width', FINITE_NUMBER.nullable().optional()).field('height', FINITE_NUMBER.nullable().optional()),
  (fields: Record<string, ESObject>): ResizeOptions => ({ width: fields.width, height: fields.height }),
  (value: ResizeOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields.width = value.width;
    fields.height = value.height;

    return fields;
  },
);

export const CROP_RECT = ExpoValueTypes.shapedRecord<CropRect>(
  'CropRect',
  new ExpoRecordShape()
    .field('originX', FINITE_NUMBER.optional())
    .field('originY', FINITE_NUMBER.optional())
    .field('width', FINITE_NUMBER.optional())
    .field('height', FINITE_NUMBER.optional()),
  (fields: Record<string, ESObject>): CropRect => ({
    originX: fields.originX ?? 0,
    originY: fields.originY ?? 0,
    width: fields.width ?? 0,
    height: fields.height ?? 0,
  }),
  (value: CropRect): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields.originX = value.originX;
    fields.originY = value.originY;
    fields.width = value.width;
    fields.height = value.height;

    return fields;
  },
);

export const SAVE_OPTIONS = ExpoValueTypes.shapedRecord<SaveOptions>(
  'SaveOptions',
  new ExpoRecordShape()
    .field('base64', ExpoValueTypes.boolean().optional())
    .field('compress', FINITE_NUMBER.optional())
    .field('format', IMAGE_FORMAT.optional()),
  (fields: Record<string, ESObject>): SaveOptions => ({
    base64: fields.base64 ?? false,
    compress: fields.compress ?? 1,
    format: fields.format ?? ImageFormat.JPEG,
  }),
  (value: SaveOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields.base64 = value.base64;
    fields.compress = value.compress;
    fields.format = value.format;

    return fields;
  },
);
