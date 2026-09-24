import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { dataSharePredicates } from '@kit.ArkData';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { effectiveCreationTime, memberNumber } from './MediaLibraryAssets';

const MEDIA_TYPE_AUDIO: string = 'audio';
const MEDIA_TYPE_PHOTO: string = 'photo';
const MEDIA_TYPE_VIDEO: string = 'video';
const MEDIA_TYPE_UNKNOWN: string = 'unknown';
const MEDIA_TYPE_ALL: string = 'all';
const SORT_ASCENDING: string = 'ASC';
const SORT_DESCENDING: string = 'DESC';
const SORT_DEFAULT: string = 'default';
const SORT_MEDIA_TYPE: string = 'mediaType';
const SORT_WIDTH: string = 'width';
const SORT_HEIGHT: string = 'height';
const SORT_CREATION_TIME: string = 'creationTime';
const SORT_MODIFICATION_TIME: string = 'modificationTime';
const SORT_DURATION: string = 'duration';

export interface AssetQueryOptions {
  first: number;
  after?: string;
  album?: string;
  sortBy: string[];
  mediaType: string[];
  createdAfter?: number;
  createdBefore?: number;
  resolveWithFullInfo: boolean;
}

export interface AlbumQueryOptions {
  includeSmartAlbums: boolean;
}

export class AssetSortDescriptor {
  key: string;
  ascending: boolean;

  constructor(key: string, ascending: boolean) {
    this.key = key;
    this.ascending = ascending;
  }
}

export function readAssetQueryOptions(value: ESObject): AssetQueryOptions {
  const record = optionalRecord(value);

  return {
    first: optionalNonNegativeInteger(record?.['first'], 20, 'first'),
    after: optionalString(record?.['after'], 'after'),
    album: optionalString(record?.['album'], 'albumId'),
    sortBy: optionalStringArray(record?.['sortBy'], 'sortBy'),
    mediaType:
      record?.['mediaType'] === undefined || record?.['mediaType'] === null ? ['photo'] : optionalStringArray(record?.['mediaType'], 'mediaType'),
    createdAfter: optionalFiniteNumber(record?.['createdAfter'], 'createdAfter'),
    createdBefore: optionalFiniteNumber(record?.['createdBefore'], 'createdBefore'),
    resolveWithFullInfo: optionalBoolean(record?.['resolveWithFullInfo'], false, 'resolveWithFullInfo'),
  };
}

export function readAlbumQueryOptions(value: ESObject): AlbumQueryOptions {
  const record = optionalRecord(value);

  return {
    includeSmartAlbums: optionalBoolean(record?.['includeSmartAlbums'], false, 'includeSmartAlbums'),
  };
}

export function optionalRecord(value: ESObject): Record<string, ESObject> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_ARGUMENT', 'Expected an options object.');
  }

  return value as Record<string, ESObject>;
}

export function requireString(value: ESObject, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_ARGUMENT', `'${name}' must be a non-empty string.`);
  }

  return value;
}

function optionalString(value: ESObject, name: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requireString(value, name);
}

function requireStringArray(value: ESObject, name: string): string[] {
  if (!Array.isArray(value)) {
    throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_ARGUMENT', `'${name}' must be an array of strings.`);
  }

  const items: string[] = [];
  value.forEach((entry: ESObject): void => {
    items.push(requireString(entry, name));
  });

  return items;
}

function optionalStringArray(value: ESObject, name: string): string[] {
  if (value === undefined || value === null) return [];
  return requireStringArray(value, name);
}

function optionalBoolean(value: ESObject, fallback: boolean, name: string): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') {
    throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_ARGUMENT', `'${name}' must be a boolean.`);
  }

  return value;
}

function optionalNonNegativeInteger(value: ESObject, fallback: number, name: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_ARGUMENT', `'${name}' must be a non-negative integer.`);
  }

  return value;
}

function optionalFiniteNumber(value: ESObject, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_ARGUMENT', `'${name}' must be a finite number.`);
  }

  return value;
}

export function applyMediaTypeFilter(predicates: dataSharePredicates.DataSharePredicates, requested: string[]): boolean {
  if (requested.length === 0) return true;

  const types: number[] = [];
  let all: boolean = false;

  requested.forEach((type: string): void => {
    if (type === MEDIA_TYPE_ALL) {
      all = true;
    } else if (type === MEDIA_TYPE_PHOTO && !types.includes(photoAccessHelper.PhotoType.IMAGE)) {
      types.push(photoAccessHelper.PhotoType.IMAGE);
    } else if (type === MEDIA_TYPE_VIDEO && !types.includes(photoAccessHelper.PhotoType.VIDEO)) {
      types.push(photoAccessHelper.PhotoType.VIDEO);
    } else if (type !== MEDIA_TYPE_AUDIO && type !== MEDIA_TYPE_UNKNOWN && type !== MEDIA_TYPE_PHOTO && type !== MEDIA_TYPE_VIDEO) {
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_MEDIA_TYPE', `Unsupported Expo media type '${type}'.`);
    }
  });

  if (all) return true;
  if (types.length === 0) return false;

  predicates.in(photoAccessHelper.PhotoKeys.PHOTO_TYPE, types);

  return true;
}

export async function materializedAssets(
  fetch: photoAccessHelper.FetchResult<photoAccessHelper.PhotoAsset>,
  options: AssetQueryOptions,
  sorts: AssetSortDescriptor[],
  materialize: boolean,
): Promise<photoAccessHelper.PhotoAsset[] | undefined> {
  const filter = options.createdAfter !== undefined || options.createdBefore !== undefined;
  if (!filter && !materialize) return undefined;

  let items = await fetch.getAllObjects();

  if (filter) {
    items = items.filter((asset: photoAccessHelper.PhotoAsset): boolean => {
      const created = effectiveCreationTime(asset);

      if (options.createdAfter !== undefined && created <= options.createdAfter) return false;
      if (options.createdBefore !== undefined && created >= options.createdBefore) return false;

      return true;
    });
  }

  if (materialize) {
    items.sort((left: photoAccessHelper.PhotoAsset, right: photoAccessHelper.PhotoAsset): number => compareAssets(left, right, sorts));
  }

  return items;
}

export function readSortDescriptors(expressions: string[]): AssetSortDescriptor[] {
  const sorts: AssetSortDescriptor[] = [];

  expressions.forEach((expression: string): void => {
    const parts = expression.trim().split(/\s+/);

    if (parts.length !== 2 || (parts[1] !== SORT_ASCENDING && parts[1] !== SORT_DESCENDING)) {
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_SORT', `Invalid Expo media sort expression '${expression}'.`);
    }

    if (parts[0] === SORT_DEFAULT) return;
    sortColumn(parts[0]);

    sorts.push(new AssetSortDescriptor(parts[0], parts[1] === SORT_ASCENDING));
  });

  return sorts;
}

export function applyNativeSort(predicates: dataSharePredicates.DataSharePredicates, sorts: AssetSortDescriptor[]): void {
  sorts.forEach((sort: AssetSortDescriptor): void => {
    const column = sortColumn(sort.key);

    if (sort.ascending) predicates.orderByAsc(column);
    else predicates.orderByDesc(column);
  });
}

function compareAssets(left: photoAccessHelper.PhotoAsset, right: photoAccessHelper.PhotoAsset, sorts: AssetSortDescriptor[]): number {
  for (let i = 0; i < sorts.length; i += 1) {
    const sort = sorts[i];
    const a = assetSortValue(left, sort.key);
    const b = assetSortValue(right, sort.key);
    if (a === b) continue;

    const order: number = a < b ? -1 : 1;
    return sort.ascending ? order : -order;
  }

  return 0;
}

function assetSortValue(asset: photoAccessHelper.PhotoAsset, key: string): number {
  if (key === SORT_MEDIA_TYPE) return asset.photoType;
  if (key === SORT_WIDTH) return memberNumber(asset, photoAccessHelper.PhotoKeys.WIDTH);
  if (key === SORT_HEIGHT) return memberNumber(asset, photoAccessHelper.PhotoKeys.HEIGHT);
  if (key === SORT_CREATION_TIME) return effectiveCreationTime(asset);
  if (key === SORT_MODIFICATION_TIME) return memberNumber(asset, photoAccessHelper.PhotoKeys.DATE_MODIFIED_MS);
  if (key === SORT_DURATION) return memberNumber(asset, photoAccessHelper.PhotoKeys.DURATION);

  throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_SORT', `Unsupported Expo media sort key '${key}'.`);
}

function sortColumn(key: string): string {
  if (key === SORT_MEDIA_TYPE) return photoAccessHelper.PhotoKeys.PHOTO_TYPE;
  if (key === SORT_WIDTH) return photoAccessHelper.PhotoKeys.WIDTH;
  if (key === SORT_HEIGHT) return photoAccessHelper.PhotoKeys.HEIGHT;
  if (key === SORT_CREATION_TIME) return photoAccessHelper.PhotoKeys.DATE_TAKEN;
  if (key === SORT_MODIFICATION_TIME) return photoAccessHelper.PhotoKeys.DATE_MODIFIED;
  if (key === SORT_DURATION) return photoAccessHelper.PhotoKeys.DURATION;

  throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_SORT', `Unsupported Expo media sort key '${key}'.`);
}

export async function cursorStart(fetch: photoAccessHelper.FetchResult<photoAccessHelper.PhotoAsset>, after: string | undefined): Promise<number> {
  if (after === undefined) return 0;

  const count = fetch.getCount();
  for (let i = 0; i < count; i += 1) {
    if ((await fetch.getObjectByPosition(i)).uri === after) return i + 1;
  }

  throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_CURSOR', `The pagination cursor '${after}' is not present in this media query.`);
}

export function cursorStartInAssets(items: photoAccessHelper.PhotoAsset[], after: string | undefined): number {
  if (after === undefined) return 0;

  const index = items.findIndex((asset: photoAccessHelper.PhotoAsset): boolean => asset.uri === after);
  if (index >= 0) return index + 1;

  throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_CURSOR', `The pagination cursor '${after}' is not present in this media query.`);
}
