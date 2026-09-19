import type { common } from '@kit.AbilityKit';
import type { RNInstance, RNOHCoreContext } from '@rnoh/react-native-openharmony';
import type { ReactNativeHost } from './ReactNativeHostHandler';

export interface ReactRuntimeContext {
  readonly instance: RNInstance;
  readonly host: ReactNativeHost;
  // A logical runtime family, independent of mounted roots.
  readonly owner: Object;
  readonly isHeadless: boolean;
  readonly core: RNOHCoreContext;
  readonly reload: (reason: string) => Promise<void>;
  /** Returns a development host to its native UI without leaving its app running. */
  readonly suspend: () => Promise<void>;
}

export interface ReactRuntimeBinding {
  bind(context: ReactRuntimeContext): Promise<(() => void) | void> | (() => void) | void;
}

export interface ReactRuntimeBindingRegistration {
  readonly packageName?: string;
  readonly registrationId: string;
  readonly create: (context: common.Context) => ReactRuntimeBinding;
}
