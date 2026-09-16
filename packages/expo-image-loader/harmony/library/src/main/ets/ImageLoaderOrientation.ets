import { image } from '@kit.ImageKit';

// PropertyKey.ORIENTATION returns these documented EXIF names on API 13.
// image.Orientation is only available from API 23.
enum ExifOrientation {
  TOP_LEFT = 'Top-left',
  TOP_RIGHT = 'Top-right',
  BOTTOM_RIGHT = 'Bottom-right',
  BOTTOM_LEFT = 'Bottom-left',
  LEFT_TOP = 'Left-top',
  RIGHT_TOP = 'Right-top',
  RIGHT_BOTTOM = 'Right-bottom',
  LEFT_BOTTOM = 'Left-bottom',
}

export async function applyImageOrientation(source: image.ImageSource, pixel: image.PixelMap): Promise<void> {
  let orientation: string;

  try {
    orientation = await source.getImageProperty(image.PropertyKey.ORIENTATION, { defaultValue: ExifOrientation.TOP_LEFT });
  } catch (_) {
    return;
  }

  switch (orientation) {
    case ExifOrientation.TOP_RIGHT:
      await pixel.flip(true, false);
      break;
    case ExifOrientation.BOTTOM_RIGHT:
      await pixel.rotate(180);
      break;
    case ExifOrientation.BOTTOM_LEFT:
      await pixel.flip(false, true);
      break;
    case ExifOrientation.LEFT_TOP:
      await pixel.flip(true, false);
      await pixel.rotate(270);
      break;
    case ExifOrientation.RIGHT_TOP:
      await pixel.rotate(90);
      break;
    case ExifOrientation.RIGHT_BOTTOM:
      await pixel.flip(true, false);
      await pixel.rotate(90);
      break;
    case ExifOrientation.LEFT_BOTTOM:
      await pixel.rotate(270);
      break;
  }
}
