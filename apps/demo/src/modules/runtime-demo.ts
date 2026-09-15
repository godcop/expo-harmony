import { requireOptionalNativeModule, type NativeModule } from 'expo-modules-core';

type Events = { onUpdatesStateChange: (value: { event: string }) => void };

export declare class RuntimeDemoModule extends NativeModule<Events> {
  readManifest(input: string): string;
  serializeHeader(format: 'dictionary' | 'list' | 'item', input: string): string;
  readUpdates(): string;
}

export const runtimeDemo = requireOptionalNativeModule<RuntimeDemoModule>('RuntimeDemo');
