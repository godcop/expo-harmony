import type { JSBundleProvider, RNInstance, RNOHCoreContext } from '@rnoh/react-native-openharmony';

export interface ReactRuntimeListener {
  prepare: (instance: RNInstance) => Promise<void>;
  changed: (instance: RNInstance | undefined) => void;
  failed: (error: Error) => void;
}

export interface ReactNativeRuntime {
  readonly core: RNOHCoreContext;
  readonly instance: RNInstance | undefined;
  readonly ready: Promise<void>;
  readonly isReloading: boolean;
  readonly bundle: JSBundleProvider | undefined;
  start(): Promise<void>;
  reload(reason: string): Promise<void>;
  /** Releases an owned app instance while retaining the runtime for a later start/reload. */
  suspend(): Promise<void>;
  destroy(): Promise<void>;
  subscribe(listener: ReactRuntimeListener): () => void;
}
