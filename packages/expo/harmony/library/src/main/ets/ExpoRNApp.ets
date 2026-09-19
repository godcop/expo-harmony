import { ExpoReactRootViewFactory } from './ExpoReactRootViewFactory';
import { ExpoReactHost } from './ExpoReactHost';
import { JSBundleProvider, RNApp, RNInstance, RNOHCoreContext, RNOHError } from '@rnoh/react-native-openharmony';
import type { RNInstanceConfig } from '@rnoh/react-native-openharmony/src/main/ets/RNApp';
import type { WrappedCustomRNComponentBuilder } from '@rnoh/react-native-openharmony/src/main/ets/RNOH';
import {
  ReactNativeRuntime,
  ReactRuntimeListener,
  ExpoModuleError,
  ReactRootViewBuilder,
  ReactRootViewContext,
  ReactActivityHandler,
  ModulePriorities,
} from '@expo-harmony/expo-modules-core';

interface ExpoUnmanagedRNInstanceConfig {
  rnInstance: RNInstance;
}

class ExpoRootGestureModifier implements GestureModifier {
  private handlers: ReactActivityHandler[];
  private context: ReactRootViewContext;
  constructor(handlers: ReactActivityHandler[], context: ReactRootViewContext) {
    this.handlers = handlers;
    this.context = context;
  }
  applyGesture(event: UIGestureEvent): void {
    event.clearGestures();
    this.handlers.forEach((handler: ReactActivityHandler): void => handler.applyRootViewGestures?.(this.context, event));
  }
}

export type ExpoRNInstanceReplacement = (reason: string) => Promise<RNInstance>;
@Builder
export function buildExpoDefaultRoot(context: ReactRootViewContext): void {
  if (context.ready) {
    RNApp({
      rnInstanceConfig: context.instanceConfig,
      appKey: context.appKey,
      initialProps: context.initialProps,
      jsBundleProvider: context.jsBundleProvider,
      wrappedCustomRNComponentBuilder: context.wrappedCustomRNComponentBuilder,
      onSetUp: context.onSetUp,
    });
  }
}

@Component
struct ExpoReactRootView {
  @Require public builder!: ReactRootViewBuilder;
  @Require public context!: ReactRootViewContext;
  @Prop public ready: boolean = false;
  public handlers: ReactActivityHandler[] = [];
  private readonly rootToken: Object = new Object();

  aboutToAppear(): void {
    this.handlers.forEach((handler: ReactActivityHandler): void => handler.onRootViewMounted?.(this.context, this.getUIContext(), this.rootToken));
  }

  aboutToDisappear(): void {
    this.handlers.forEach((handler: ReactActivityHandler): void => handler.onRootViewUnmounted?.(this.context, this.rootToken));
  }

  build(): void {
    // Keep this literal at the call site so ArkUI tracks ready changes.
    this.builder.builder({
      owner: this.context.owner,
      core: this.context.core,
      host: this.context.host,
      instanceConfig: this.context.instanceConfig,
      appKey: this.context.appKey,
      initialProps: this.context.initialProps,
      jsBundleProvider: this.context.jsBundleProvider,
      wrappedCustomRNComponentBuilder: this.context.wrappedCustomRNComponentBuilder,
      onSetUp: this.context.onSetUp,
      ready: this.ready,
      isCustomRoot: this.context.isCustomRoot,
      defaultRoot: this.context.defaultRoot,
    });
  }
}
@Component
export struct ExpoRNApp {
  @Require public rnInstanceConfig!: RNInstanceConfig;
  @Require public appKey: string = '';
  @Require public reactHost!: ExpoReactHost;
  public initialProps: Record<string, string> = {};
  public jsBundleProvider: JSBundleProvider | undefined = undefined;
  public wrappedCustomRNComponentBuilder: WrappedCustomRNComponentBuilder | undefined = undefined;
  public rootViewBuilder: ReactRootViewBuilder | undefined = undefined;
  public onDelayLoadError: ((error: Object) => void) | undefined = undefined;
  public onSetUp: (rnInstance: RNInstance) => Promise<void> | void = (): void => {};
  public replaceRNInstance: ExpoRNInstanceReplacement | undefined = undefined;
  @StorageLink('RNOHCoreContext') private core?: RNOHCoreContext = undefined;
  @State private generation: number = 0;
  @State private ready: boolean = false;
  private instance: RNInstance | undefined = undefined;
  private runtime: ReactNativeRuntime | undefined = undefined;
  private unregister: (() => void) | undefined = undefined;
  private mounted: boolean = false;
  private preparationSerial: number = 0;
  private selectedRoot: ReactRootViewBuilder | undefined = undefined;
  private activityHandlers: ReactActivityHandler[] = [];

  aboutToAppear(): void {
    this.mounted = true;
    this.prepareRoot();
  }

  private async prepareRoot(): Promise<void> {
    const preparation: number = ++this.preparationSerial;
    if (this.core === undefined) {
      this.reportDelayError(new ExpoModuleError('ERR_REACT_HOST_CONTEXT', 'The RNOH context is not available.') as Object);
      return;
    }

    const context: ReactRootViewContext = this.rootContext(false);
    try {
      const handlers: ReactActivityHandler[] = this.reactHost.activityHandlers
        .slice()
        .sort((left, right) => ModulePriorities.get(right.packageName) - ModulePriorities.get(left.packageName))
        .map((registration) => registration.create(context.core.uiAbilityContext));
      this.activityHandlers = handlers;
      this.selectedRoot = this.rootViewBuilder ?? ExpoReactRootViewFactory.create(handlers, context);
      const delay = ExpoReactRootViewFactory.getDelayLoadAppHandler(handlers, context);
      if (delay !== undefined) await delay;
      if (!this.mounted || preparation !== this.preparationSerial) return;
      const runtime = this.reactHost.createRuntime(context.core, this.rnInstanceConfig, this.jsBundleProvider, this.replaceRNInstance);
      this.runtime = runtime;
      const listener: ReactRuntimeListener = {
        prepare: async (instance: RNInstance): Promise<void> => {
          await this.onSetUp(instance);
        },
        changed: (instance: RNInstance | undefined): void => {
          if (!this.mounted || preparation !== this.preparationSerial) return;
          this.instance = instance;
          this.ready = instance !== undefined;
          this.generation += 1;
        },
        failed: (error: Error): void => {
          if (this.mounted && preparation === this.preparationSerial) this.reportDelayError(error as Object);
        },
      };
      this.unregister = runtime.subscribe(listener);
      await runtime.start().catch((): void => {});
    } catch (error) {
      if (this.mounted && preparation === this.preparationSerial) this.reportDelayError(error as Object);
    }
  }

  private reportDelayError(error: Object): void {
    const callback = this.onDelayLoadError;
    if (callback !== undefined) callback(error);
    else if (this.core !== undefined) {
      this.core.reportRNOHError(
        new RNOHError({
          whatHappened: 'Unable to prepare the Expo React root.',
          howCanItBeFixed: [],
          extraData: error,
        }),
      );
    } else {
      throw new ExpoModuleError('ERR_REACT_HOST_CONTEXT', 'The RNOH context is not available.', error);
    }
  }

  aboutToDisappear(): void {
    this.mounted = false;
    this.preparationSerial += 1;
    this.ready = false;
    this.unregister?.();
    this.unregister = undefined;
  }

  private rootContext(ready: boolean): ReactRootViewContext {
    if (this.core === undefined) throw new ExpoModuleError('ERR_REACT_HOST_CONTEXT', 'The RNOH context is not available.');
    return {
      owner: this,
      core: this.core,
      host: this.reactHost,
      instanceConfig: this.instanceConfig(),
      appKey: this.appKey,
      initialProps: this.initialProps,
      jsBundleProvider: this.runtime?.bundle ?? this.jsBundleProvider,
      wrappedCustomRNComponentBuilder: this.wrappedCustomRNComponentBuilder,
      onSetUp: (_instance: RNInstance): void => {},
      ready,
      isCustomRoot: this.selectedRoot !== undefined,
      defaultRoot: wrapBuilder(buildExpoDefaultRoot),
    };
  }

  private instanceConfig(): RNInstanceConfig {
    if (this.instance !== undefined) {
      const config: ExpoUnmanagedRNInstanceConfig = { rnInstance: this.instance };
      return config;
    }
    return this.rnInstanceConfig;
  }

  @Builder
  private renderRoot(): void {
    if (this.selectedRoot !== undefined) {
      ExpoReactRootView({ builder: this.selectedRoot, context: this.rootContext(this.ready), ready: this.ready, handlers: this.activityHandlers });
    } else {
      ExpoReactRootView({
        builder: wrapBuilder(buildExpoDefaultRoot),
        context: this.rootContext(this.ready),
        ready: this.ready,
        handlers: this.activityHandlers,
      });
    }
  }

  build(): void {
    Stack() {
      ForEach(
        [this.generation],
        (_generation: number): void => this.renderRoot(),
        (generation: number): string => `${generation}`,
      )
    }
    .width('100%')
    .height('100%')
    .gestureModifier(new ExpoRootGestureModifier(this.activityHandlers, this.rootContext(this.ready)))
    .onKeyEvent((event: KeyEvent): void => {
      for (const handler of this.activityHandlers) {
        if (handler.onRootViewKeyEvent?.(this.rootContext(this.ready), event)) {
          event.stopPropagation();
          return;
        }
      }
    });
  }
}
