import type { DevToolsController } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/DevToolsController';
import type { common } from '@kit.AbilityKit';
import type { JSBundleProvider, RNInstance, RNOHCoreContext } from '@rnoh/react-native-openharmony';

import type { RNInstanceConfig } from '@rnoh/react-native-openharmony/src/main/ets/RNApp';
import type { ReactNativeRuntime } from './ReactNativeRuntime';

export interface ReactNativeHost {
  createRuntime(core: RNOHCoreContext, config: RNInstanceConfig, bundle?: JSBundleProvider, replace?: (reason: string) => Promise<RNInstance>): ReactNativeRuntime;
  createJSBundleProvider(context: common.Context, debug?: boolean): JSBundleProvider;
  load(context: common.Context): Promise<void>;
  unload(): Promise<void>;
}

export interface ReactNativeHostHandler {
  getUseDeveloperSupport?(): boolean | undefined;
  // ArkTS must await bundle selection instead of blocking its UI thread.
  getJSBundleFile?(debug: boolean): string | undefined | Promise<string | undefined>;
  getBundleAssetName?(debug: boolean): string | undefined | Promise<string | undefined>;
  onWillCreateReactInstance?(debug: boolean): void;
  onDidCreateReactHost?(context: common.Context, host: ReactNativeHost): void;
  onDidCreateDevSupportManager?(manager: DevToolsController): void;
  onDidCreateReactInstance?(debug: boolean, instance: RNInstance): void;
  onReactInstanceException?: (debug: boolean, instance: RNInstance, error: Error) => void;
}

export interface ReactNativeHostHandlerRegistration {
  readonly packageName?: string;
  readonly registrationId: string;
  readonly create: (context: common.Context) => ReactNativeHostHandler;
}
