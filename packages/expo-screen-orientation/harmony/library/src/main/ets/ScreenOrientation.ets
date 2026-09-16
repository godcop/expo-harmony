import { display, window } from '@kit.ArkUI';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { ExpoModuleError } from '@expo-harmony/expo-modules-core';

export enum Orientation {
  UNKNOWN = 0,
  PORTRAIT_UP = 1,
  PORTRAIT_DOWN = 2,
  LANDSCAPE_LEFT = 3,
  LANDSCAPE_RIGHT = 4,
}

export enum OrientationLock {
  DEFAULT = 0,
  ALL = 1,
  PORTRAIT = 2,
  PORTRAIT_UP = 3,
  PORTRAIT_DOWN = 4,
  LANDSCAPE = 5,
  LANDSCAPE_LEFT = 6,
  LANDSCAPE_RIGHT = 7,
  OTHER = 8,
  UNKNOWN = 9,
}

const LOCKS: Map<number, window.Orientation> = new Map([
  [OrientationLock.DEFAULT, window.Orientation.UNSPECIFIED],
  [OrientationLock.ALL, window.Orientation.AUTO_ROTATION],
  [OrientationLock.PORTRAIT, window.Orientation.AUTO_ROTATION_PORTRAIT],
  [OrientationLock.PORTRAIT_UP, window.Orientation.PORTRAIT],
  [OrientationLock.PORTRAIT_DOWN, window.Orientation.PORTRAIT_INVERTED],
  [OrientationLock.LANDSCAPE, window.Orientation.AUTO_ROTATION_LANDSCAPE],
  // Harmony Window and Display use opposite landscape names.
  [OrientationLock.LANDSCAPE_LEFT, window.Orientation.LANDSCAPE],
  [OrientationLock.LANDSCAPE_RIGHT, window.Orientation.LANDSCAPE_INVERTED],
]);

const ORIENTATION_CONVERSION_API_LEVEL: number = 23;
const CAPABILITY_NOT_SUPPORTED: number = 801;

// These SDK results are numbers, not window.Orientation values. See
// Window.convertOrientationAndRotation and RotationChangeInfo.orientation.
enum WindowDirection {
  PORTRAIT = 0,
  LANDSCAPE_INVERTED = 1,
  PORTRAIT_INVERTED = 2,
  LANDSCAPE = 3,
}

// Display.rotation is a numeric quarter-turn value; the SDK has no rotation enum.
enum DisplayRotation {
  ROTATION_0 = 0,
  ROTATION_90 = 1,
  ROTATION_180 = 2,
  ROTATION_270 = 3,
}

export function supportsOrientationLock(value: number): boolean {
  return LOCKS.has(value);
}

export function toPreferredOrientation(value: number): window.Orientation {
  const orientation = LOCKS.get(value);
  if (orientation === undefined) {
    throw new ExpoModuleError('ERR_SCREEN_ORIENTATION_INVALID_LOCK', `Unsupported orientation lock: ${value}.`);
  }

  return orientation;
}

export function fromPreferredOrientation(value: window.Orientation): OrientationLock {
  for (const entry of LOCKS) {
    if (entry[1] === value) return entry[0];
  }

  return OrientationLock.OTHER;
}

export function requirePlatformOrientation(value: number): window.Orientation {
  switch (value) {
    case window.Orientation.UNSPECIFIED:
    case window.Orientation.PORTRAIT:
    case window.Orientation.LANDSCAPE:
    case window.Orientation.PORTRAIT_INVERTED:
    case window.Orientation.LANDSCAPE_INVERTED:
    case window.Orientation.AUTO_ROTATION:
    case window.Orientation.AUTO_ROTATION_PORTRAIT:
    case window.Orientation.AUTO_ROTATION_LANDSCAPE:
    case window.Orientation.AUTO_ROTATION_RESTRICTED:
    case window.Orientation.AUTO_ROTATION_PORTRAIT_RESTRICTED:
    case window.Orientation.AUTO_ROTATION_LANDSCAPE_RESTRICTED:
    case window.Orientation.LOCKED:
    case window.Orientation.AUTO_ROTATION_UNSPECIFIED:
    case window.Orientation.USER_ROTATION_PORTRAIT:
    case window.Orientation.USER_ROTATION_LANDSCAPE:
    case window.Orientation.USER_ROTATION_PORTRAIT_INVERTED:
    case window.Orientation.USER_ROTATION_LANDSCAPE_INVERTED:
    case window.Orientation.FOLLOW_DESKTOP:
      return value;
    default:
      throw new ExpoModuleError('ERR_SCREEN_ORIENTATION_INVALID_PLATFORM_LOCK', `Unsupported HarmonyOS orientation: ${value}.`);
  }
}

export function readOrientation(win: window.Window): Orientation {
  const props = win.getWindowProperties();
  const screen = props.displayId === undefined ? display.getDefaultDisplaySync() : display.getDisplayByIdSync(props.displayId);
  const rect = props.windowRect;

  if (rect.width <= 0 || rect.height <= 0) return Orientation.UNKNOWN;

  if (deviceInfo.sdkApiVersion >= ORIENTATION_CONVERSION_API_LEVEL) {
    try {
      const direction = win.convertOrientationAndRotation(
        window.RotationInfoType.DISPLAY_ORIENTATION,
        window.RotationInfoType.WINDOW_ORIENTATION,
        screen.orientation,
      );

      const orientation = fromWindowDirection(direction);
      // Floating windows may not share the display's orientation.
      const portrait = orientation === Orientation.PORTRAIT_UP || orientation === Orientation.PORTRAIT_DOWN;
      if (orientation === Orientation.UNKNOWN || (rect.width !== rect.height && portrait !== rect.height > rect.width)) {
        return Orientation.UNKNOWN;
      }

      return orientation;
    } catch (error) {
      if ((error as BusinessError).code !== CAPABILITY_NOT_SUPPORTED) {
        throw new ExpoModuleError('ERR_SCREEN_ORIENTATION_CONVERSION', `Unable to convert the current screen orientation: ${String(error)}`);
      }
    }
  }

  // Expo Android's fallback cannot disambiguate every foldable before API 23.
  return fromRotationAndSize(screen.rotation, rect);
}

function fromWindowDirection(value: number): Orientation {
  switch (value) {
    case WindowDirection.PORTRAIT:
      return Orientation.PORTRAIT_UP;
    case WindowDirection.PORTRAIT_INVERTED:
      return Orientation.PORTRAIT_DOWN;
    case WindowDirection.LANDSCAPE:
      return Orientation.LANDSCAPE_LEFT;
    case WindowDirection.LANDSCAPE_INVERTED:
      return Orientation.LANDSCAPE_RIGHT;
    default:
      return Orientation.UNKNOWN;
  }
}

function fromRotationAndSize(rotation: number, rect: window.Rect): Orientation {
  const portrait =
    ((rotation === DisplayRotation.ROTATION_0 || rotation === DisplayRotation.ROTATION_180) && rect.height > rect.width) ||
    ((rotation === DisplayRotation.ROTATION_90 || rotation === DisplayRotation.ROTATION_270) && rect.width > rect.height);

  switch (rotation) {
    case DisplayRotation.ROTATION_0:
      return portrait ? Orientation.PORTRAIT_UP : Orientation.LANDSCAPE_RIGHT;
    case DisplayRotation.ROTATION_90:
      return portrait ? Orientation.LANDSCAPE_RIGHT : Orientation.PORTRAIT_DOWN;
    case DisplayRotation.ROTATION_180:
      return portrait ? Orientation.PORTRAIT_DOWN : Orientation.LANDSCAPE_LEFT;
    case DisplayRotation.ROTATION_270:
      return portrait ? Orientation.LANDSCAPE_LEFT : Orientation.PORTRAIT_UP;
    default:
      return Orientation.UNKNOWN;
  }
}
