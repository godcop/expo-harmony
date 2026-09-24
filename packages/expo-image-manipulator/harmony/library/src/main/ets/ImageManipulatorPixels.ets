import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { drawing } from '@kit.ArkGraphics2D';
import { image } from '@kit.ImageKit';

export function copyPixelMap(source: image.PixelMap): image.PixelMap {
  // Copy synchronously: the source SharedRef can be released as soon as manipulate() returns.
  let pixel: image.PixelMap | undefined;

  try {
    pixel = image.createPixelMapSync({
      size: source.getImageInfoSync().size,
      pixelFormat: image.PixelMapFormat.RGBA_8888,
      alphaType: image.AlphaType.PREMUL,
      editable: true,
    });
    if (pixel === undefined || pixel === null) throw new Error('Could not allocate an image bitmap.');

    const canvas = new drawing.Canvas(pixel);
    const brush = new drawing.Brush();
    brush.setBlendMode(drawing.BlendMode.SRC);
    canvas.attachBrush(brush);
    canvas.drawImage(source, 0, 0);
    canvas.detachBrush();

    return pixel;
  } catch (error) {
    if (pixel !== undefined && pixel !== null) releasePixelMap(pixel);

    throw new ExpoModuleError('ERR_IMAGE_MANIPULATOR', 'Could not copy the image bitmap.', error as Object);
  }
}

export function releasePixelMap(pixel: image.PixelMap): void {
  pixel.release().catch((error: Object): void => {
    console.warn(`ImageManipulator could not release a bitmap: ${String(error)}`);
  });
}
