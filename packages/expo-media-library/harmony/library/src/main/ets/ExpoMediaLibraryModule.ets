import {
  ExpoAppLifecycleState,
  ExpoFunction,
  ExpoModule,
  ExpoModuleContext,
  ExpoModuleDefinition,
  ExpoModuleError,
  ExpoPermissionStatus,
  ExpoValueTypes,
} from '@expo-harmony/expo-modules-core';
import { dataSharePredicates, uniformTypeDescriptor } from '@kit.ArkData';
import { BusinessError } from '@kit.BasicServicesKit';
import { fileIo, fileUri } from '@kit.CoreFileKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { AlbumRecord, AssetRecord, ASSET_FETCH_COLUMNS, mapAsset, MediaLibraryChangeEvent, PagedAssetResult } from './MediaLibraryAssets';
import {
  AlbumQueryOptions,
  AssetQueryOptions,
  AssetSortDescriptor,
  applyMediaTypeFilter,
  applyNativeSort,
  cursorStart,
  cursorStartInAssets,
  materializedAssets,
  readAlbumQueryOptions,
  readAssetQueryOptions,
  readSortDescriptors,
  requireString,
  optionalRecord,
} from './MediaLibraryQuery';
import { MediaLibraryPermissionResponse, MediaLibraryPermissions, READ_PERMISSION, WRITE_PERMISSION } from './MediaLibraryPermissions';

const CHANGE_EVENT_NAME: string = 'mediaLibraryDidChange';
// The public deleteAssets API accepts at most 300 URIs per system confirmation.
const DELETE_BATCH_LIMIT: number = 300;
const ASSET_OPTIONS = ExpoValueTypes.custom<AssetQueryOptions>('AssetsOptions', readAssetQueryOptions, (value: AssetQueryOptions): ESObject => value);
const ALBUM_OPTIONS = ExpoValueTypes.custom<AlbumQueryOptions>('AlbumsOptions', readAlbumQueryOptions, (value: AlbumQueryOptions): ESObject => value);
const INFO_OPTIONS = ExpoValueTypes.custom<Record<string, ESObject>>(
  'asset info options',
  (value: ESObject): Record<string, ESObject> => optionalRecord(value) ?? {},
  (value: Record<string, ESObject>): ESObject => value,
);
const IDENTIFIER = ExpoValueTypes.custom<string>(
  'non-empty identifier',
  (value: ESObject, path: string): string => requireString(value, path),
  (value: string): ESObject => value,
);

interface LocalMediaSource {
  fileUri: string;
  mediaType: photoAccessHelper.PhotoType;
}

export class ExpoMediaLibraryModule extends ExpoModule {
  private readonly permissions: MediaLibraryPermissions;
  private library?: photoAccessHelper.PhotoAccessHelper;
  private observing: boolean = false;
  private registered: boolean = false;
  private foreground: boolean;
  private destroyed: boolean = false;
  private pending: number = 0;
  private idle?: () => void;
  private release?: Promise<void>;
  private readonly changed = (_change: photoAccessHelper.ChangeData): void => {
    if (!this.destroyed && this.observing && this.foreground && this.context.isValid) {
      this.sendEvent(CHANGE_EVENT_NAME, new MediaLibraryChangeEvent());
    }
  };

  constructor(context: ExpoModuleContext) {
    super(context);
    this.permissions = new MediaLibraryPermissions(context);
    this.foreground = context.appLifecycleState === ExpoAppLifecycleState.FOREGROUND;
  }

  definition(): ExpoModuleDefinition {
    const definition = new ExpoModuleDefinition()
      .name('ExpoMediaLibrary')
      .constant('MediaType', { audio: 'audio', photo: 'photo', video: 'video', unknown: 'unknown' })
      .constant('SortBy', {
        default: 'default',
        mediaType: 'mediaType',
        width: 'width',
        height: 'height',
        creationTime: 'creationTime',
        modificationTime: 'modificationTime',
        duration: 'duration',
      })
      .constant('CHANGE_LISTENER_NAME', CHANGE_EVENT_NAME)
      .events([CHANGE_EVENT_NAME]);
    if (!canIUse('SystemCapability.FileManagement.PhotoAccessHelper.Core')) return definition;

    return definition
      .asyncFunction(
        'getPermissionsAsync',
        ExpoFunction.typed1(
          ExpoValueTypes.boolean().optional(),
          (write?: boolean): Promise<MediaLibraryPermissionResponse> =>
            this.run(async (): Promise<MediaLibraryPermissionResponse> => await this.permissions.get(write ?? false)),
        ),
      )
      .asyncFunction(
        'requestPermissionsAsync',
        ExpoFunction.typed1(
          ExpoValueTypes.boolean().optional(),
          (write?: boolean): Promise<MediaLibraryPermissionResponse> =>
            this.run(async (): Promise<MediaLibraryPermissionResponse> => {
              const result = await this.permissions.request(write ?? false);
              this.startSystemObservation();
              return result;
            }),
        ),
      )
      .asyncFunction(
        'getAssetsAsync',
        ExpoFunction.typed1(
          ASSET_OPTIONS,
          (options: AssetQueryOptions): Promise<PagedAssetResult> =>
            this.run(async (): Promise<PagedAssetResult> => {
              this.permissions.ensureGranted([READ_PERMISSION]);

              return await this.getAssets(options);
            }),
        ),
      )
      .asyncFunction(
        'getAssetInfoAsync',
        ExpoFunction.typed2(
          IDENTIFIER,
          INFO_OPTIONS.optional(),
          (id: string, _options?: Record<string, ESObject>): Promise<AssetRecord | null> =>
            this.run(async (): Promise<AssetRecord | null> => {
              this.permissions.ensureGranted([READ_PERMISSION]);

              return await this.getAssetInfo(id);
            }),
        ),
      )
      .asyncFunction(
        'getAlbumsAsync',
        ExpoFunction.typed1(
          ALBUM_OPTIONS,
          (options: AlbumQueryOptions): Promise<AlbumRecord[]> =>
            this.run(async (): Promise<AlbumRecord[]> => {
              this.permissions.ensureGranted([READ_PERMISSION]);

              return await this.getAlbums(options);
            }),
        ),
      )
      .asyncFunction(
        'getAlbumAsync',
        ExpoFunction.typed1(
          ExpoValueTypes.string(),
          (title: string): Promise<AlbumRecord | null> =>
            this.run(async (): Promise<AlbumRecord | null> => {
              this.permissions.ensureGranted([READ_PERMISSION]);

              return await this.getAlbum(title);
            }),
        ),
      )
      .asyncFunction(
        'createAssetAsync',
        ExpoFunction.typed2(
          IDENTIFIER,
          IDENTIFIER.nullable().optional(),
          (uri: string, album?: string | null): Promise<AssetRecord | null> =>
            this.run(async (): Promise<AssetRecord | null> => {
              this.permissions.ensureGranted([READ_PERMISSION, WRITE_PERMISSION]);

              return await this.createAsset(uri, album ?? undefined, true);
            }),
        ),
      )
      .asyncFunction(
        'saveToLibraryAsync',
        ExpoFunction.typed1(
          IDENTIFIER,
          (uri: string): Promise<void> =>
            this.run(async (): Promise<void> => {
              this.permissions.ensureGranted([WRITE_PERMISSION]);

              await this.createAsset(uri, undefined, false);
            }),
        ),
      )
      .asyncFunction(
        'addAssetsToAlbumAsync',
        ExpoFunction.typed3(
          ExpoValueTypes.array(IDENTIFIER),
          IDENTIFIER,
          ExpoValueTypes.boolean().optional(),
          (ids: string[], album: string, copy?: boolean): Promise<boolean> =>
            this.run(async (): Promise<boolean> => {
              this.permissions.ensureGranted([READ_PERMISSION, WRITE_PERMISSION]);

              return await this.addAssetsToAlbum(ids, album, copy ?? true);
            }),
        ),
      )
      .asyncFunction(
        'removeAssetsFromAlbumAsync',
        ExpoFunction.typed2(
          ExpoValueTypes.array(IDENTIFIER),
          IDENTIFIER,
          (ids: string[], album: string): Promise<boolean> =>
            this.run(async (): Promise<boolean> => {
              this.permissions.ensureGranted([READ_PERMISSION, WRITE_PERMISSION]);

              return await this.removeAssetsFromAlbum(ids, album);
            }),
        ),
      )
      .asyncFunction(
        'deleteAssetsAsync',
        ExpoFunction.typed1(
          ExpoValueTypes.array(IDENTIFIER),
          (ids: string[]): Promise<boolean> =>
            this.run(async (): Promise<boolean> => {
              this.permissions.ensureGranted([WRITE_PERMISSION]);

              return await this.deleteAssets(ids);
            }),
        ),
      )
      .asyncFunction(
        'createAlbumAsync',
        ExpoFunction.typed4(
          ExpoValueTypes.string(),
          IDENTIFIER.nullable().optional(),
          ExpoValueTypes.boolean().optional(),
          IDENTIFIER.nullable().optional(),
          async (_name: string, _asset?: string | null, _copy?: boolean, _uri?: string | null): Promise<void> => {
            throw new ExpoModuleError(
              'ERR_MEDIA_LIBRARY_UNSUPPORTED_ALBUM_OPERATION',
              'HarmonyOS exposes no public third-party API to create albums.',
            );
          },
        ),
      )
      .asyncFunction(
        'deleteAlbumsAsync',
        ExpoFunction.typed2(
          ExpoValueTypes.array(IDENTIFIER),
          ExpoValueTypes.boolean().optional(),
          async (_albums: string[], _remove?: boolean): Promise<void> => {
            throw new ExpoModuleError(
              'ERR_MEDIA_LIBRARY_UNSUPPORTED_ALBUM_OPERATION',
              'HarmonyOS exposes no public third-party API to delete albums.',
            );
          },
        ),
      )
      .onStartObserving((): void => {
        this.observing = true;
        this.startSystemObservation();
      })
      .onStopObserving((): void => {
        this.observing = false;
        this.stopSystemObservation();
      })
      .onForeground((): void => {
        this.foreground = true;
        this.startSystemObservation();
      })
      .onBackground((): void => {
        this.foreground = false;
        this.stopSystemObservation();
      })
      .onPrepareForReload((): Promise<void> => this.destroy())
      .onDestroy((): void => {
        this.destroy().catch((error: BusinessError): void => this.context.logger.warn(`Unable to release MediaLibrary: ${error.message}`));
      });
  }

  private assertActive(): void {
    if (this.destroyed || !this.context.isValid)
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_DESTROYED', 'The media library module has been destroyed.');
  }

  private get helper(): photoAccessHelper.PhotoAccessHelper {
    this.assertActive();

    if (this.library === undefined) this.library = photoAccessHelper.getPhotoAccessHelper(this.context.uiAbilityContext);

    return this.library;
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.assertActive();
    this.pending++;

    try {
      const result = await operation();
      this.assertActive();

      return result;
    } catch (error) {
      if (error instanceof ExpoModuleError) throw new ExpoModuleError(error.code, error.message, error.cause);

      const cause = error as BusinessError;
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_OPERATION', `HarmonyOS media library operation failed (${cause.code}): ${cause.message}`, error);
    } finally {
      this.pending--;
      if (this.pending === 0) this.idle?.();
    }
  }

  private destroy(): Promise<void> {
    if (this.release !== undefined) return this.release;

    this.destroyed = true;
    this.permissions.destroy();
    this.observing = false;
    this.stopSystemObservation();

    this.release = this.releaseWhenIdle();

    return this.release;
  }

  private async releaseWhenIdle(): Promise<void> {
    // FetchResult and ImageSource cleanup finishes before releasing their helper.
    if (this.pending > 0)
      await new Promise<void>((resolve): void => {
        this.idle = resolve;
      });

    await this.library?.release();
    this.library = undefined;
  }

  private startSystemObservation(): void {
    if (this.destroyed || !this.foreground || !this.observing || this.registered) return;
    if (this.context.permissionStatus(READ_PERMISSION) !== ExpoPermissionStatus.GRANTED) return;

    try {
      this.helper.registerChange(photoAccessHelper.DefaultChangeUri.DEFAULT_PHOTO_URI, true, this.changed);
      this.registered = true;
    } catch (error) {
      this.context.logger.warn(`Unable to observe media library changes: ${(error as BusinessError).message}`);
    }
  }

  private stopSystemObservation(): void {
    if (!this.registered) return;

    try {
      this.library?.unRegisterChange(photoAccessHelper.DefaultChangeUri.DEFAULT_PHOTO_URI, this.changed);
      this.registered = false;
    } catch (error) {
      this.context.logger.warn(`Unable to stop observing media library changes: ${(error as BusinessError).message}`);
    }
  }

  private async localMediaSource(input: string): Promise<LocalMediaSource> {
    const path = this.context.filePathForRead(input);
    const name = path.slice(path.lastIndexOf('/') + 1);
    const dot = name.lastIndexOf('.');
    if (dot <= 0 || dot === name.length - 1)
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_MISSING_EXTENSION', 'The local media file must have a filename extension.');

    const type = uniformTypeDescriptor.getUniformDataTypeByFilenameExtension(name.slice(dot).toLowerCase());
    const descriptor = uniformTypeDescriptor.getTypeDescriptor(type);
    let mediaType: photoAccessHelper.PhotoType;
    if (descriptor.belongsTo(uniformTypeDescriptor.UniformDataType.IMAGE)) mediaType = photoAccessHelper.PhotoType.IMAGE;
    else if (descriptor.belongsTo(uniformTypeDescriptor.UniformDataType.VIDEO)) mediaType = photoAccessHelper.PhotoType.VIDEO;
    else throw new ExpoModuleError('ERR_MEDIA_LIBRARY_UNSUPPORTED_MEDIA_TYPE', 'HarmonyOS Media Library Kit imports only images and videos.');

    const stat = await fileIo.stat(path);
    if (!stat.isFile()) throw new ExpoModuleError('ERR_MEDIA_LIBRARY_INVALID_URI', 'The local media source must be a regular file.');

    return { fileUri: fileUri.getUriFromPath(path), mediaType };
  }

  private async getAssets(options: AssetQueryOptions): Promise<PagedAssetResult> {
    const predicates = new dataSharePredicates.DataSharePredicates();
    const matches = applyMediaTypeFilter(predicates, options.mediaType);
    const sorts = readSortDescriptors(options.sortBy);

    if (!matches) {
      return new PagedAssetResult([], options.after ?? null, false, 0);
    }

    const materialize = sorts.some((sort: AssetSortDescriptor): boolean => sort.key === 'creationTime');
    if (!materialize) applyNativeSort(predicates, sorts);

    const query: photoAccessHelper.FetchOptions = {
      fetchColumns: ASSET_FETCH_COLUMNS,
      predicates,
    };
    const fetch = options.album === undefined ? await this.helper.getAssets(query) : await (await this.requireAlbum(options.album)).getAssets(query);

    try {
      const items = await materializedAssets(fetch, options, sorts, materialize);
      const total = items === undefined ? fetch.getCount() : items.length;
      const start = items === undefined ? await cursorStart(fetch, options.after) : cursorStartInAssets(items, options.after);
      const end = Math.min(start + options.first, total);

      const assets: AssetRecord[] = [];
      for (let i = start; i < end; i += 1) {
        const asset = items === undefined ? await fetch.getObjectByPosition(i) : items[i];
        assets.push(await mapAsset(asset, options.resolveWithFullInfo));
      }

      const cursor = assets.length > 0 ? assets[assets.length - 1].id : (options.after ?? null);

      return new PagedAssetResult(assets, cursor, end < total, total);
    } finally {
      fetch.close();
    }
  }

  private async getAssetInfo(id: string): Promise<AssetRecord | null> {
    const asset = await this.findAsset(id);
    if (asset === undefined) return null;

    return await mapAsset(asset, true);
  }

  private async getAlbums(options: AlbumQueryOptions): Promise<AlbumRecord[]> {
    const albums = await this.queryAlbums(photoAccessHelper.AlbumType.USER, photoAccessHelper.AlbumSubtype.USER_GENERIC);
    if (options.includeSmartAlbums) {
      const smart = await this.queryAlbums(photoAccessHelper.AlbumType.SYSTEM, photoAccessHelper.AlbumSubtype.ANY);
      smart.forEach((album: photoAccessHelper.Album): void => {
        albums.push(album);
      });
    }

    return albums.map((album: photoAccessHelper.Album): AlbumRecord => new AlbumRecord(album));
  }

  private async getAlbum(title: string): Promise<AlbumRecord | null> {
    const album = await this.findAlbum(photoAccessHelper.AlbumKeys.ALBUM_NAME, title, false);
    return album === undefined ? null : new AlbumRecord(album);
  }

  private async createAsset(input: string, id: string | undefined, details: boolean): Promise<AssetRecord | null> {
    const album = id === undefined ? undefined : await this.requireWritableAlbum(id);
    const source = await this.localMediaSource(input);

    const request =
      source.mediaType === photoAccessHelper.PhotoType.IMAGE
        ? photoAccessHelper.MediaAssetChangeRequest.createImageAssetRequest(this.context.uiAbilityContext, source.fileUri)
        : photoAccessHelper.MediaAssetChangeRequest.createVideoAssetRequest(this.context.uiAbilityContext, source.fileUri);

    await this.helper.applyChanges(request);

    if (!details && album === undefined) return null;

    const created = request.getAsset();
    if (created === undefined || created === null) {
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_OPERATION', 'HarmonyOS did not return the newly created media asset.');
    }

    const uri = created.uri;

    try {
      const asset = await this.findAsset(uri);
      if (asset === undefined) {
        throw new ExpoModuleError('ERR_MEDIA_LIBRARY_OPERATION', `HarmonyOS could not query the newly created media asset '${uri}'.`);
      }

      const result = details ? await mapAsset(asset, false) : null;

      if (album !== undefined) {
        const change = new photoAccessHelper.MediaAlbumChangeRequest(album);
        change.addAssets([asset]);

        await this.helper.applyChanges(change);
      }

      return result;
    } catch (error) {
      // The save has committed. Do not open another deletion dialog as implicit rollback.
      throw new ExpoModuleError(
        'ERR_MEDIA_LIBRARY_OPERATION',
        `Created media asset '${uri}', but could not finish reading it or adding it to the album: ${(error as BusinessError).message}`,
        error,
      );
    }
  }

  private async addAssetsToAlbum(identifiers: string[], id: string, _copy: boolean): Promise<boolean> {
    if (identifiers.length === 0) return true;

    const album = await this.requireWritableAlbum(id);
    const assets = await this.requireAssets(identifiers);

    const change = new photoAccessHelper.MediaAlbumChangeRequest(album);
    change.addAssets(assets);

    await this.helper.applyChanges(change);

    return true;
  }

  private async removeAssetsFromAlbum(identifiers: string[], id: string): Promise<boolean> {
    if (identifiers.length === 0) return true;

    const album = await this.requireWritableAlbum(id);
    const assets = await this.requireAssets(identifiers);

    const change = new photoAccessHelper.MediaAlbumChangeRequest(album);
    change.removeAssets(assets);

    await this.helper.applyChanges(change);

    return true;
  }

  private async deleteAssets(identifiers: string[]): Promise<boolean> {
    const ids = uniqueStrings(identifiers);

    for (let start = 0; start < ids.length; start += DELETE_BATCH_LIMIT) {
      this.assertActive();
      await photoAccessHelper.MediaAssetChangeRequest.deleteAssets(this.context.uiAbilityContext, ids.slice(start, start + DELETE_BATCH_LIMIT));
    }

    return true;
  }

  private async requireAssets(identifiers: string[]): Promise<photoAccessHelper.PhotoAsset[]> {
    const assets: photoAccessHelper.PhotoAsset[] = [];
    const ids = uniqueStrings(identifiers);

    for (let i = 0; i < ids.length; i += 1) {
      assets.push(await this.requireAsset(ids[i]));
    }

    return assets;
  }

  private async requireAsset(id: string): Promise<photoAccessHelper.PhotoAsset> {
    const asset = await this.findAsset(id);
    if (asset === undefined) {
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_ASSET_NOT_FOUND', `No media asset exists for identifier '${id}'.`);
    }

    return asset;
  }

  private async findAsset(id: string): Promise<photoAccessHelper.PhotoAsset | undefined> {
    const predicates = new dataSharePredicates.DataSharePredicates();
    predicates.equalTo(photoAccessHelper.PhotoKeys.URI, id);

    const fetch = await this.helper.getAssets({ fetchColumns: ASSET_FETCH_COLUMNS, predicates });

    try {
      if (fetch.getCount() !== 1) return undefined;

      return await fetch.getFirstObject();
    } finally {
      fetch.close();
    }
  }

  private async requireAlbum(id: string): Promise<photoAccessHelper.Album> {
    const album = await this.findAlbum(photoAccessHelper.AlbumKeys.URI, id, true);
    if (album === undefined) {
      throw new ExpoModuleError('ERR_MEDIA_LIBRARY_ALBUM_NOT_FOUND', `No media album exists for identifier '${id}'.`);
    }

    return album;
  }

  private async requireWritableAlbum(id: string): Promise<photoAccessHelper.Album> {
    const album = await this.requireAlbum(id);

    if (album.albumType !== photoAccessHelper.AlbumType.USER) {
      throw new ExpoModuleError(
        'ERR_MEDIA_LIBRARY_UNSUPPORTED_ALBUM_OPERATION',
        'HarmonyOS system albums are read-only for third-party applications.',
      );
    }

    return album;
  }

  private async findAlbum(key: photoAccessHelper.AlbumKeys, value: string, system: boolean): Promise<photoAccessHelper.Album | undefined> {
    const types: photoAccessHelper.AlbumType[] = system
      ? [photoAccessHelper.AlbumType.USER, photoAccessHelper.AlbumType.SYSTEM]
      : [photoAccessHelper.AlbumType.USER];

    for (let i = 0; i < types.length; i += 1) {
      const predicates = new dataSharePredicates.DataSharePredicates();
      predicates.equalTo(key, value);

      const fetch = await this.helper.getAlbums(types[i], photoAccessHelper.AlbumSubtype.ANY, {
        fetchColumns: [],
        predicates,
      });

      try {
        if (fetch.getCount() > 0) return await fetch.getFirstObject();
      } finally {
        fetch.close();
      }
    }

    return undefined;
  }

  private async queryAlbums(type: photoAccessHelper.AlbumType, subtype: photoAccessHelper.AlbumSubtype): Promise<photoAccessHelper.Album[]> {
    const fetch = await this.helper.getAlbums(type, subtype, {
      fetchColumns: [],
      predicates: new dataSharePredicates.DataSharePredicates(),
    });

    try {
      return await fetch.getAllObjects();
    } finally {
      fetch.close();
    }
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set<string>(values));
}
