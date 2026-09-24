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
  /** The provider actually used to load this instance, when owned by this runtime. */
  readonly sourceBundle?: JSBundleProvider;
  start(): Promise<void>;
  reload(reason: string): Promise<void>;
  /** Releases an owned app instance while retaining the runtime for a later start/reload. */
  suspend(): Promise<void>;
  destroy(): Promise<void>;
  subscribe(listener: ReactRuntimeListener): () => void;
}
