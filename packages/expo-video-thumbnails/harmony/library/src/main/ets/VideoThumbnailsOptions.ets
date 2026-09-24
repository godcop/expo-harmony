import { ExpoModuleError, ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

export interface VideoThumbnailsOptions {
  quality: number;
  time: number;
  headers: Record<string, string>;
}

const MICROSECONDS_PER_MILLISECOND = 1000;

export const VIDEO_THUMBNAILS_OPTIONS = ExpoValueTypes.shapedRecord<VideoThumbnailsOptions>(
  'VideoThumbnailsOptions',
  new ExpoRecordShape()
    .field('quality', ExpoValueTypes.number().optional())
    .field('time', ExpoValueTypes.number().optional())
    .field('headers', ExpoValueTypes.record(ExpoValueTypes.string()).optional()),
  (fields: Record<string, ESObject>): VideoThumbnailsOptions => {
    const quality: number = fields.quality ?? 1;
    const time: number = Math.trunc(fields.time ?? 0);

    if (!Number.isFinite(quality) || quality < 0 || quality > 1) {
      throw new ExpoModuleError('ERR_VIDEO_THUMBNAILS_INVALID_ARGUMENT', 'quality must be a finite number between 0 and 1.');
    }
    if (!Number.isSafeInteger(time * MICROSECONDS_PER_MILLISECOND)) {
      throw new ExpoModuleError('ERR_VIDEO_THUMBNAILS_INVALID_ARGUMENT', 'time must be finite and within the safe microsecond range.');
    }

    return { quality, time, headers: fields.headers ?? {} };
  },
  (options: VideoThumbnailsOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields.quality = options.quality;
    fields.time = options.time;
    fields.headers = options.headers;

    return fields;
  },
);

export function timeInMicroseconds(options: VideoThumbnailsOptions): number {
  return options.time * MICROSECONDS_PER_MILLISECOND;
}
