import { ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import { DevMenuCallback } from './DevMenuTypes';
import { ExpoDevMenuRuntime } from './ExpoDevMenuRuntime';

const CALLBACK_TYPE = ExpoValueTypes.shapedRecord<DevMenuCallback>(
  'DevMenuCallback',
  new ExpoRecordShape().field('name', ExpoValueTypes.string(), { required: true }).field('shouldCollapse', ExpoValueTypes.boolean().optional()),
  (fields: Record<string, ESObject>): DevMenuCallback => new DevMenuCallback(fields.name, fields.shouldCollapse ?? true),
  (callback: DevMenuCallback): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields.name = callback.name;
    fields.shouldCollapse = callback.shouldCollapse;
    return fields;
  },
);

export class ExpoDevMenuModule extends ExpoModule {
  definition(): ExpoModuleDefinition {
    if (!this.context.isDebug) return new ExpoModuleDefinition().name('DevMenuModule');

    return new ExpoModuleDefinition()
      .name('ExpoDevMenu')
      .asyncFunction(
        'openMenu',
        ExpoFunction.typed0(async (): Promise<void> => {
          await ExpoDevMenuRuntime.require(this.context.runtimeId).open();
        }),
      )
      .asyncFunction(
        'closeMenu',
        ExpoFunction.typed0(async (): Promise<void> => {
          await ExpoDevMenuRuntime.require(this.context.runtimeId).close();
        }),
      )
      .asyncFunction(
        'hideMenu',
        ExpoFunction.typed0(async (): Promise<void> => {
          await ExpoDevMenuRuntime.require(this.context.runtimeId).close();
        }),
      )
      .asyncFunction(
        'addDevMenuCallbacks',
        ExpoFunction.typed1(ExpoValueTypes.array(CALLBACK_TYPE), async (callbacks: DevMenuCallback[]): Promise<void> => {
          ExpoDevMenuRuntime.require(this.context.runtimeId).updateCallbacks(callbacks);
        }),
      )
      .onDestroy((): void => {
        const runtime = ExpoDevMenuRuntime.find(this.context.runtimeId);
        if (runtime === undefined) return;
        runtime.updateCallbacks([]);
        runtime.close().catch((error: Error): void => runtime.reportActionError(error));
      });
  }
}
