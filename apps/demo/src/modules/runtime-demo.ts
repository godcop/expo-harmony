import { requireOptionalNativeModule, type NativeModule } from 'expo-modules-core';

type Events = { onUpdatesStateChange: (value: { event: string }) => void };

export declare class RuntimeDemoModule extends NativeModule<Events> {
  readImage(uri: string, editing: boolean, callback: boolean): Promise<string>;
  checkImages(): Promise<string>;
  readManifest(input: string): string;
  readJSON(input: string, key: string, type: 'raw' | 'string' | 'number' | 'boolean' | 'array' | 'object', nullable: boolean): string;
  checkJSON(): string;
  serializeHeader(format: 'dictionary' | 'list' | 'item', input: string): string;
  readUpdates(): string;
}

export const runtimeDemo = requireOptionalNativeModule<RuntimeDemoModule>('RuntimeDemo');
