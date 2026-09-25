import { ExpoModuleContext, ExpoModuleError, fileUriFromPath } from '@expo-harmony/expo-modules-core';
import { ImageLoaderInterfaceKey, ImageLoaderResultListener } from '@expo-harmony/expo-image-loader';
import { util } from '@kit.ArkTS';
import { fileIo } from '@kit.CoreFileKit';
import { image } from '@kit.ImageKit';

interface Check {
  name: string;
  passed: boolean;
  error: string;
}

async function load(context: ExpoModuleContext, uri: string, editing: boolean, callback: boolean): Promise<image.PixelMap> {
  const loader = context.services.require(ImageLoaderInterfaceKey);

  if (!callback) {
    return editing ? loader.loadImageForManipulationFromURL(uri) : loader.loadImageForDisplayFromURL(uri);
  }

  return new Promise<image.PixelMap>((resolve, reject): void => {
    const listener = new PromiseResultListener(resolve, reject);
    if (editing) loader.loadImageForManipulationFromURL(uri, listener);
    else loader.loadImageForDisplayFromURL(uri, listener);
  });
}

class PromiseResultListener implements ImageLoaderResultListener {
  private readonly resolve: (pixel: image.PixelMap) => void;
  private readonly reject: (cause: Error) => void;

  constructor(resolve: (pixel: image.PixelMap) => void, reject: (cause: Error) => void) {
    this.resolve = resolve;
    this.reject = reject;
  }

  onSuccess(pixel: image.PixelMap): void {
    this.resolve(pixel);
  }

  onFailure(cause: Error): void {
    this.reject(cause);
  }
}

export async function readImage(context: ExpoModuleContext, uri: string, editing: boolean, callback: boolean): Promise<string> {
  const pixel = await load(context, uri, editing, callback);

  try {
    const info = await pixel.getImageInfo();
    const packer = image.createImagePacker();

    try {
      const data = await packer.packing(pixel, { format: 'image/png', quality: 100 });

      return JSON.stringify({
        width: info.size.width,
        height: info.size.height,
        editable: pixel.isEditable,
        bytes: pixel.getPixelBytesNumber(),
        preview: `data:image/png;base64,${new util.Base64Helper().encodeToStringSync(new Uint8Array(data))}`,
      });
    } finally {
      await packer.release();
    }
  } finally {
    await pixel.release();
  }
}

export async function checkImages(context: ExpoModuleContext): Promise<string> {
  context.services.require(ImageLoaderInterfaceKey);

  const checks: Check[] = [];
  const bytes = await context.uiAbilityContext.resourceManager.getRawFileContent('image-loader-fixture.png');
  const uri = `data:image/png;base64,${new util.Base64Helper().encodeToStringSync(bytes)}`;
  const path = `${context.uiAbilityContext.tempDir}/image-loader-${util.generateRandomUUID()}.png`;

  try {
    const file = await fileIo.open(path, fileIo.OpenMode.CREATE | fileIo.OpenMode.READ_WRITE | fileIo.OpenMode.TRUNC);

    try {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = await fileIo.write(file.fd, bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + bytes.byteLength));
        if (written <= 0) throw new Error('Unable to write the image fixture.');

        offset += written;
      }
    } finally {
      await fileIo.close(file);
    }

    for (const editing of [false, true]) {
      for (const callback of [false, true]) {
        await check(checks, `${editing ? '编辑' : '展示'} · ${callback ? '回调' : 'Promise'}`, async (): Promise<void> => {
          await verify(await load(context, uri, editing, callback));
        });
      }
    }

    for (const source of [path, fileUriFromPath(path), 'rawfile://image-loader-fixture.png', 'image-loader-fixture.png']) {
      await check(checks, source.startsWith('/') ? '沙箱路径' : source.startsWith('file:') ? '文件 URI' : source, async (): Promise<void> => {
        await verify(await load(context, source, true, false));
      });
    }

    await check(checks, '编辑副本互不影响', async (): Promise<void> => {
      const first = await load(context, uri, true, false);

      try {
        const second = await load(context, uri, true, false);

        try {
          await first.scale(2, 2);
          const resized = await first.getImageInfo();
          const original = await second.getImageInfo();
          if (resized.size.width !== 6 || resized.size.height !== 4 || original.size.width !== 3 || original.size.height !== 2) {
            throw new Error('Mutating one image changed another load.');
          }
        } finally {
          await second.release();
        }
      } finally {
        await first.release();
      }
    });

    for (const source of ['', 'data:image/png;base64,AAAA', 'content://unsupported', 'rawfile://../invalid.png']) {
      for (const callback of [false, true]) {
        await check(checks, `${callback ? '回调' : 'Promise'} 拒绝 ${source || '空 URI'}`, async (): Promise<void> => {
          let pixel: image.PixelMap;

          try {
            pixel = await load(context, source, true, callback);
          } catch (error) {
            if (error instanceof ExpoModuleError && error.code === 'ERR_IMAGE_LOADER') return;

            throw new Error(`Unexpected error: ${String(error)}`);
          }

          await pixel.release();

          throw new Error('An invalid source unexpectedly succeeded.');
        });
      }
    }

    return JSON.stringify(checks);
  } finally {
    await fileIo.unlink(path);
  }
}

async function verify(pixel: image.PixelMap): Promise<void> {
  try {
    const info = await pixel.getImageInfo();
    if (info.size.width !== 3 || info.size.height !== 2 || !pixel.isEditable) {
      throw new Error(`Unexpected image: ${JSON.stringify(info.size)}, editable=${pixel.isEditable}`);
    }

    const data = new ArrayBuffer(pixel.getPixelBytesNumber());
    await pixel.readPixelsToBuffer(data);

    const bytes = new Uint8Array(data);
    if (bytes[0] !== 255 || bytes[1] !== 0 || bytes[2] !== 0 || bytes[3] !== 255) {
      throw new Error('The fixture did not decode into the expected RGBA pixels.');
    }
  } finally {
    await pixel.release();
  }
}

async function check(checks: Check[], name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
    checks.push({ name, passed: true, error: '' });
  } catch (error) {
    checks.push({ name, passed: false, error: String(error) });
  }
}
