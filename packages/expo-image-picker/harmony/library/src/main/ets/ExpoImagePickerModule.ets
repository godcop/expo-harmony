import { ExpoAppLifecycleState, ExpoFunction, ExpoModule, ExpoModuleContext, ExpoModuleDefinition, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import { common } from '@kit.AbilityKit';
import { dataSharePredicates } from '@kit.ArkData';
import { camera, cameraPicker } from '@kit.CameraKit';
import { photoAccessHelper } from '@kit.MediaLibraryKit';
import { ExpoImagePickerError } from './ExpoImagePickerError';
import { IMAGE_PICKER_OPTIONS, ImagePickerOptions, selectsImages, selectsVideos, validateEditing } from './ImagePickerOptions';
import { ImagePickerPermissions, PermissionResponse, mediaLibraryPermission } from './ImagePickerPermissions';
import { ImagePickerAsset, CaptureFile, removeAssets, removeCapture, createCapture, exportImage, exportVideo } from './ExpoImagePickerMedia';

const PHOTO_PICKER_MAX_SELECTION: number = 500;
const CAMERA_RESULT_OK: number = 0;
const CAMERA_RESULT_CANCELLED: number = -1;

// Keep the lock until the system picker settles, including across RN reloads.
const pickers: WeakSet<common.UIAbilityContext> = new WeakSet();

class ImagePickerResult {
  canceled: boolean;
  assets: ImagePickerAsset[] | null;

  constructor(assets: ImagePickerAsset[] = []) {
    this.canceled = assets.length === 0;
    this.assets = this.canceled ? null : assets;
  }
}

export class ExpoImagePickerModule extends ExpoModule {
  private readonly permissions: ImagePickerPermissions;
  private destroyed: boolean = false;

  constructor(context: ExpoModuleContext) {
    super(context);
    this.permissions = new ImagePickerPermissions(context);
  }

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExponentImagePicker')
      .asyncFunction('getCameraPermissionsAsync', async (): Promise<PermissionResponse> => await this.permissions.getCamera())
      .asyncFunction('requestCameraPermissionsAsync', async (): Promise<PermissionResponse> => await this.permissions.requestCamera())
      .asyncFunction(
        'getMediaLibraryPermissionsAsync',
        ExpoFunction.typed1(
          ExpoValueTypes.boolean().defaulted(false),
          async (_writeOnly: boolean): Promise<PermissionResponse> => mediaLibraryPermission(),
        ),
      )
      .asyncFunction(
        'requestMediaLibraryPermissionsAsync',
        ExpoFunction.typed1(
          ExpoValueTypes.boolean().defaulted(false),
          async (_writeOnly: boolean): Promise<PermissionResponse> => mediaLibraryPermission(),
        ),
      )
      .asyncFunction('getPendingResultAsync', async (): Promise<null> => null)
      .asyncFunction(
        'launchCameraAsync',
        ExpoFunction.typed1(
          IMAGE_PICKER_OPTIONS,
          async (options: ImagePickerOptions): Promise<ImagePickerResult> => await this.launch(options, true),
        ),
      )
      .asyncFunction(
        'launchImageLibraryAsync',
        ExpoFunction.typed1(
          IMAGE_PICKER_OPTIONS,
          async (options: ImagePickerOptions): Promise<ImagePickerResult> => await this.launch(options, false),
        ),
      )
      .onPrepareForReload(async (): Promise<void> => {
        this.destroyed = true;
      })
      .onDestroy((): void => {
        this.destroyed = true;
      });
  }

  private async launch(options: ImagePickerOptions, capture: boolean): Promise<ImagePickerResult> {
    this.assertActive();

    const ability = this.context.uiAbilityContext;
    if (pickers.has(ability)) return new ImagePickerResult();

    this.assertActive(true);
    validateEditing(options, capture);

    pickers.add(ability);
    const assets: ImagePickerAsset[] = [];
    let file: CaptureFile | undefined;

    try {
      if (capture) {
        if (!canIUse('SystemCapability.Multimedia.Camera.Core')) {
          throw new ExpoImagePickerError('ERR_IMAGE_PICKER_UNAVAILABLE', 'CameraPicker is unavailable on this device.');
        }

        if (!(await this.permissions.requestCamera()).granted) {
          throw new ExpoImagePickerError('ERR_MISSING_PERMISSION', 'Camera permission was denied.');
        }
        this.assertActive(true);

        const video = selectsVideos(options) && !selectsImages(options);
        file = await createCapture(this.context.cachePath, video ? 'video' : 'image');
        this.assertActive(true);

        const result = await cameraPicker.pick(ability, [video ? cameraPicker.PickerMediaType.VIDEO : cameraPicker.PickerMediaType.PHOTO], {
          cameraPosition: options.cameraType === 'front' ? camera.CameraPosition.CAMERA_POSITION_FRONT : camera.CameraPosition.CAMERA_POSITION_BACK,
          saveUri: file.uri,
          videoDuration: options.videoMaxDuration,
        });

        this.assertActive();
        if (result == null) {
          throw new ExpoImagePickerError('ERR_IMAGE_PICKER_CAMERA', 'CameraPicker did not return a capture result.');
        }

        // CameraPicker reports back/cancel and an unsuccessful capture with -1.
        if (result.resultCode === CAMERA_RESULT_CANCELLED) return new ImagePickerResult();

        if (
          result.resultCode !== CAMERA_RESULT_OK ||
          !result.resultUri ||
          result.mediaType !== (video ? cameraPicker.PickerMediaType.VIDEO : cameraPicker.PickerMediaType.PHOTO)
        ) {
          throw new ExpoImagePickerError('ERR_IMAGE_PICKER_CAMERA', 'CameraPicker returned an invalid capture result.');
        }

        assets.push(
          video ? await exportVideo(result.resultUri, this.context.cachePath) : await exportImage(result.resultUri, this.context.cachePath, options),
        );
      } else {
        if (!canIUse('SystemCapability.FileManagement.PhotoAccessHelper.Core')) {
          throw new ExpoImagePickerError('ERR_IMAGE_PICKER_UNAVAILABLE', 'PhotoViewPicker is unavailable on this device.');
        }

        const config = new photoAccessHelper.PhotoSelectOptions();
        config.MIMEType = selectsVideos(options)
          ? selectsImages(options)
            ? photoAccessHelper.PhotoViewMIMETypes.IMAGE_VIDEO_TYPE
            : photoAccessHelper.PhotoViewMIMETypes.VIDEO_TYPE
          : photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
        config.maxSelectNumber = options.allowsMultipleSelection
          ? Math.min(options.selectionLimit || PHOTO_PICKER_MAX_SELECTION, PHOTO_PICKER_MAX_SELECTION)
          : 1;
        config.isEditSupported = options.allowsEditing && !options.allowsMultipleSelection && selectsImages(options);
        config.isPhotoTakingSupported = false;
        config.isOriginalSupported = true;

        const result = await new photoAccessHelper.PhotoViewPicker().select(config);
        this.assertActive();

        for (const uri of result.photoUris) {
          assets.push(await this.readAsset(uri, options));
          this.assertActive();
        }
      }

      this.assertActive();

      return new ImagePickerResult(assets);
    } catch (cause) {
      await removeAssets(assets);

      if (cause instanceof ExpoImagePickerError) {
        throw new ExpoImagePickerError(cause.code, cause.message, cause);
      }

      throw new ExpoImagePickerError('ERR_IMAGE_PICKER', `Unable to ${capture ? 'capture' : 'select'} media: ${String(cause)}`, cause as Object);
    } finally {
      if (file !== undefined) await removeCapture(file);
      pickers.delete(ability);
    }
  }

  private async readAsset(uri: string, options: ImagePickerOptions): Promise<ImagePickerAsset> {
    const helper = photoAccessHelper.getPhotoAccessHelper(this.context.uiAbilityContext);
    let fetch: photoAccessHelper.FetchResult<photoAccessHelper.PhotoAsset> | undefined;
    let source: string;
    let name: string;
    let type: photoAccessHelper.PhotoType;

    try {
      const predicates = new dataSharePredicates.DataSharePredicates();
      predicates.equalTo(photoAccessHelper.PhotoKeys.URI, uri);

      fetch = await helper.getAssets({ fetchColumns: [photoAccessHelper.PhotoKeys.DISPLAY_NAME], predicates });
      const selected = await fetch.getFirstObject();

      source = selected.uri;
      name = selected.displayName;
      type = selected.photoType;
    } finally {
      try {
        fetch?.close();
      } finally {
        await helper.release();
      }
    }

    this.assertActive();

    let asset: ImagePickerAsset;
    if (type === photoAccessHelper.PhotoType.IMAGE) {
      asset = await exportImage(source, this.context.cachePath, options, name);
    } else if (type === photoAccessHelper.PhotoType.VIDEO) {
      asset = await exportVideo(source, this.context.cachePath, name);
    } else {
      throw new ExpoImagePickerError('ERR_IMAGE_PICKER_MEDIA_TYPE', 'The selected asset is neither an image nor a video.');
    }

    asset.assetId = source;

    return asset;
  }

  private assertActive(foreground: boolean = false): void {
    if (this.destroyed || !this.context.isValid || this.context.isHeadless) {
      throw new ExpoImagePickerError('ERR_IMAGE_PICKER_CONTEXT', 'ImagePicker requires an active UIAbility and Expo runtime.');
    }

    // A picker can background its host while delivering a result; only launching needs the foreground.
    if (foreground && this.context.appLifecycleState !== ExpoAppLifecycleState.FOREGROUND) {
      throw new ExpoImagePickerError('ERR_IMAGE_PICKER_CONTEXT', 'ImagePicker requires a foreground UIAbility to launch.');
    }
  }
}
