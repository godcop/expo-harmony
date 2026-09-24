import {
  ExpoFunction,
  ExpoModule,
  ExpoModuleContext,
  ExpoModuleDefinition,
  ExpoModuleError,
  ExpoSharedObjectClassDefinition,
  ExpoSharedObjectTypes,
  ExpoSharedRef,
  ExpoValueTypes,
} from '@expo-harmony/expo-modules-core';
import { image } from '@kit.ImageKit';

import {
  CROP_RECT,
  CropRect,
  FINITE_NUMBER,
  FLIP_TYPE,
  FlipType,
  RESIZE_OPTIONS,
  ResizeOptions,
  SAVE_OPTIONS,
  SaveOptions,
} from './ImageManipulatorArguments';
import { ImageManipulatorContext } from './ImageManipulatorContext';
import { releasePixelMap } from './ImageManipulatorPixels';
import { ImageRef, ImageResult } from './ImageRef';

const SOURCE = ExpoValueTypes.string().or(ExpoSharedObjectTypes.sharedRef<ExpoSharedRef<image.PixelMap>>('image'));

export class ExpoImageManipulatorModule extends ExpoModule {
  override definition(): ExpoModuleDefinition {
    const reference = new ExpoSharedObjectClassDefinition<ImageRef>('Image')
      .sharedRef('image')
      .property('width', ExpoValueTypes.number(), (ref: ImageRef): number => ref.value.getImageInfoSync().size.width)
      .property('height', ExpoValueTypes.number(), (ref: ImageRef): number => ref.value.getImageInfoSync().size.height)
      .asyncFunction(
        'saveAsync',
        ExpoFunction.ownedTyped1(
          SAVE_OPTIONS.nullable().optional(),
          (ref: ImageRef, options?: SaveOptions | null): Promise<ImageResult> => ref.save(options ?? new SaveOptions()),
        ),
      );

    const context = new ExpoSharedObjectClassDefinition<ImageManipulatorContext>('Context');
    context
      .construct(
        ExpoFunction.ownedTyped1(
          ExpoValueTypes.string(),
          (module: ExpoModuleContext, uri: string): ImageManipulatorContext => new ImageManipulatorContext(module, uri),
        ),
      )
      .syncFunction(
        'resize',
        ExpoFunction.ownedTyped1(
          RESIZE_OPTIONS,
          (object: ImageManipulatorContext, options: ResizeOptions): ImageManipulatorContext => object.resize(options),
        ).returns(context.valueType()),
      )
      .syncFunction(
        'rotate',
        ExpoFunction.ownedTyped1(
          FINITE_NUMBER,
          (object: ImageManipulatorContext, degrees: number): ImageManipulatorContext => object.rotate(degrees),
        ).returns(context.valueType()),
      )
      .syncFunction(
        'flip',
        ExpoFunction.ownedTyped1(FLIP_TYPE, (object: ImageManipulatorContext, type: FlipType): ImageManipulatorContext => object.flip(type)).returns(
          context.valueType(),
        ),
      )
      .syncFunction(
        'crop',
        ExpoFunction.ownedTyped1(CROP_RECT, (object: ImageManipulatorContext, rect: CropRect): ImageManipulatorContext => object.crop(rect)).returns(
          context.valueType(),
        ),
      )
      .syncFunction(
        'reset',
        ExpoFunction.ownedTyped0((object: ImageManipulatorContext): ImageManipulatorContext => object.reset()).returns(context.valueType()),
      )
      .asyncFunction(
        'renderAsync',
        ExpoFunction.ownedTyped0(async (object: ImageManipulatorContext): Promise<ImageRef> => {
          const pixel = await object.render();

          try {
            this.context.assertActive();

            return reference.instance(new ImageRef(this.context, pixel));
          } catch (error) {
            releasePixelMap(pixel);

            throw new ExpoModuleError(
              error instanceof ExpoModuleError ? error.code : 'ERR_IMAGE_MANIPULATOR',
              (error as Error).message,
              error as Object,
            );
          }
        }).returns(reference.valueType()),
      );

    return new ExpoModuleDefinition()
      .name('ExpoImageManipulator')
      .sharedObjectClass(context)
      .sharedObjectClass(reference)
      .syncFunction(
        'manipulate',
        ExpoFunction.typed1(
          SOURCE,
          (source: string | ExpoSharedRef<image.PixelMap>): ImageManipulatorContext =>
            context.instance(new ImageManipulatorContext(this.context, source)),
        ).returns(context.valueType()),
      );
  }
}
