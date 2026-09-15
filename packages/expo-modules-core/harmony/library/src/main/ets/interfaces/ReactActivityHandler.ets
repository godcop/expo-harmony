import type { common } from '@kit.AbilityKit';
import type { ReactRootViewBuilder, ReactRootViewContext } from './ReactRootView';

export interface ReactActivityHandler {
  createReactRootViewContainer?(context: ReactRootViewContext): ReactRootViewBuilder | undefined;
  getDelayLoadAppHandler?(context: ReactRootViewContext): Promise<void> | undefined;
}

export interface ReactActivityHandlerRegistration {
  readonly packageName?: string;
  readonly registrationId: string;
  readonly create: (context: common.Context) => ReactActivityHandler;
}
