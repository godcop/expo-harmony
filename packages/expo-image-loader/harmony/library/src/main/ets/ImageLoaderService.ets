import { ExpoFileAccessKey, ExpoModuleError, ExpoService, ExpoServiceContext, ExpoServiceKey } from '@expo-harmony/expo-modules-core';
import { fileIo } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';
import { http } from '@kit.NetworkKit';

import { ImageLoaderInterface, ImageLoaderInterfaceKey, ImageLoaderResultListener } from './ImageLoaderInterface';
import { applyImageOrientation } from './ImageLoaderOrientation';
import { decodeImageDataURL, ImageLoaderSourceType, resolveImageLoaderSource } from './ImageLoaderSource';

// Network Kit HttpRequestOptions.maxLimit has a documented maximum of 100 MiB.
const MAX_HTTP_RESPONSE_BYTES: number = 100 * 1024 * 1024;

export class ImageLoaderService extends ExpoService implements ImageLoaderInterface {
  static readonly key = new ExpoServiceKey<ImageLoaderService>('ImageLoaderService');
  readonly identity = ImageLoaderService.key.bind(this);
  readonly interfaces = [ImageLoaderInterfaceKey.bind(this)];
  private readonly context: ExpoServiceContext;

  constructor(context: ExpoServiceContext) {
    super(context);
    this.context = context;
  }

  loadImageForDisplayFromURL(url: string): Promise<image.PixelMap>;
  loadImageForDisplayFromURL(url: string, listener: ImageLoaderResultListener): void;
  loadImageForDisplayFromURL(url: string, listener?: ImageLoaderResultListener): Promise<image.PixelMap> | void {
    const result = this.load(url, true);

    if (listener === undefined) return result;
    notify(result, listener);
  }

  loadImageForManipulationFromURL(url: string): Promise<image.PixelMap>;
  loadImageForManipulationFromURL(url: string, listener: ImageLoaderResultListener): void;
  loadImageForManipulationFromURL(url: string, listener?: ImageLoaderResultListener): Promise<image.PixelMap> | void {
    const result = this.load(url, false);

    if (listener === undefined) return result;
    notify(result, listener);
  }

  private async load(url: string, cache: boolean): Promise<image.PixelMap> {
    let file: fileIo.File | undefined;
    let decoder: image.ImageSource | undefined;
    let pixel: image.PixelMap | undefined;

    try {
      try {
        this.context.assertActive();
        const source = resolveImageLoaderSource(url);

        switch (source.type) {
          case ImageLoaderSourceType.HTTP:
            decoder = image.createImageSource(await this.download(source.value, cache));
            break;
          case ImageLoaderSourceType.DATA:
            decoder = image.createImageSource(decodeImageDataURL(source.value));
            break;
          case ImageLoaderSourceType.RAW_RESOURCE: {
            const bytes = await this.context.uiAbilityContext.resourceManager.getRawFileContent(source.value);

            decoder = image.createImageSource(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            break;
          }
          case ImageLoaderSourceType.FILE:
            file = await fileIo.open(source.value, fileIo.OpenMode.READ_ONLY);

            this.context.services.get(ExpoFileAccessKey)?.assertAccess(file.path, 'read');
            decoder = image.createImageSource(file.fd);
            break;
        }

        this.context.assertActive();
        if (decoder === undefined || decoder === null) throw new Error('Unable to create an image decoder.');

        pixel = await decoder.createPixelMap({ editable: true, desiredPixelFormat: image.PixelMapFormat.RGBA_8888 });
        this.context.assertActive();

        await applyImageOrientation(decoder, pixel);
        this.context.assertActive();
      } finally {
        if (decoder !== undefined && decoder !== null) {
          try {
            await decoder.release();
          } catch (error) {
            console.warn(`ImageLoader could not release its decoder: ${String(error)}`);
          }
        }

        if (file !== undefined) {
          try {
            await fileIo.close(file);
          } catch (error) {
            console.warn(`ImageLoader could not close its source: ${String(error)}`);
          }
        }
      }

      this.context.assertActive();

      const result = pixel;
      pixel = undefined;

      return result;
    } catch (error) {
      throw new ExpoModuleError('ERR_IMAGE_LOADER', 'Loading bitmap failed.', error as Object);
    } finally {
      if (pixel !== undefined) {
        try {
          await pixel.release();
        } catch (error) {
          console.warn(`ImageLoader could not release a failed image: ${String(error)}`);
        }
      }
    }
  }

  private async download(url: string, cache: boolean): Promise<ArrayBuffer> {
    this.context.assertActive();

    const request = http.createHttp();
    let remove: (() => void) | undefined;

    try {
      const response = await new Promise<http.HttpResponse>((resolve, reject): void => {
        // Reject explicitly: destroy() alone does not promise to settle an in-flight request.
        remove = this.context.session?.onClose((): void => reject(new Error('The Expo runtime session is closed.')));
        request
          .request(url, {
            method: http.RequestMethod.GET,
            expectDataType: http.HttpDataType.ARRAY_BUFFER,
            usingCache: cache,
            maxLimit: MAX_HTTP_RESPONSE_BYTES,
          })
          .then(resolve, reject);
      });

      if (response.responseCode < http.ResponseCode.OK || response.responseCode >= http.ResponseCode.MULT_CHOICE) {
        throw new Error(`The image request failed with HTTP status ${response.responseCode}.`);
      }
      if (!(response.result instanceof ArrayBuffer)) throw new Error('The image response did not contain binary data.');

      return response.result;
    } finally {
      remove?.();
      request.destroy();
    }
  }
}

function notify(result: Promise<image.PixelMap>, listener: ImageLoaderResultListener): void {
  result
    .then(
      (pixel: image.PixelMap): void => listener.onSuccess(pixel),
      (cause: Error): void => listener.onFailure(cause),
    )
    .catch((error: Object): void => {
      // Ownership transfers at onSuccess, even when the consumer throws.
      console.error(`ImageLoader result listener failed: ${String(error)}`);
    });
}
