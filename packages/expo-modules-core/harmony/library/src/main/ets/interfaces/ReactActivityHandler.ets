import type { common } from '@kit.AbilityKit';
import type { UIContext } from '@kit.ArkUI';
import type { ReactRootViewBuilder, ReactRootViewContext } from './ReactRootView';

export interface ReactActivityHandler {
  createReactRootViewContainer?(context: ReactRootViewContext): ReactRootViewBuilder | undefined;
  getDelayLoadAppHandler?(context: ReactRootViewContext): Promise<void> | undefined;
  /** Adds native gestures without replacing another package's root container. */
  applyRootViewGestures?(context: ReactRootViewContext, event: UIGestureEvent): void;
  /** Receives unconsumed, bubbling root key events. */
  onRootViewKeyEvent?(context: ReactRootViewContext, event: KeyEvent): boolean;
  /** The root token identifies one mount, including across runtime replacement. */
  onRootViewMounted?(context: ReactRootViewContext, uiContext: UIContext, root: Object): void;
  onRootViewUnmounted?(context: ReactRootViewContext, root: Object): void;
}

export interface ReactActivityHandlerRegistration {
  readonly packageName?: string;
  readonly registrationId: string;
  readonly create: (context: common.Context) => ReactActivityHandler;
}
