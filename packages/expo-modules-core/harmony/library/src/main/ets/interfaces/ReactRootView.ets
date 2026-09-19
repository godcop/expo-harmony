import type { RNInstanceConfig } from '@rnoh/react-native-openharmony/src/main/ets/RNApp';
import type { JSBundleProvider, RNInstance, RNOHCoreContext } from '@rnoh/react-native-openharmony';
import type { WrappedCustomRNComponentBuilder } from '@rnoh/react-native-openharmony/src/main/ets/RNOH';
import type { ReactNativeHost } from './ReactNativeHostHandler';

export interface ReactRootViewContext {
  readonly owner: Object;
  readonly core: RNOHCoreContext;
  readonly host: ReactNativeHost;
  readonly instanceConfig: RNInstanceConfig;
  readonly appKey: string;
  readonly initialProps: Record<string, string>;
  readonly jsBundleProvider?: JSBundleProvider;
  readonly wrappedCustomRNComponentBuilder?: WrappedCustomRNComponentBuilder;
  readonly onSetUp: (instance: RNInstance) => Promise<void> | void;
  readonly ready: boolean;
  /** A native replacement root is mounted while React is not ready. */
  readonly isCustomRoot?: boolean;
  readonly defaultRoot: WrappedBuilder<[ReactRootViewContext]>;
}

export type ReactRootViewBuilder = WrappedBuilder<[ReactRootViewContext]>;
