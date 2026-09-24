import { common } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import {
  ExpoAbilityLifecycleSubscriber,
  ExpoFunction,
  ExpoModule,
  ExpoModuleContext,
  ExpoModuleDefinition,
  ExpoModuleError,
  ExpoValueTypes,
} from '@expo-harmony/expo-modules-core';

const ERROR_DESTROYED: string = 'ERR_KEEP_AWAKE_DESTROYED';
const ERROR_WINDOW: string = 'ERR_KEEP_AWAKE_WINDOW';

type WindowResolver = () => window.Window;

class ExpoKeepAwakeError extends ExpoModuleError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'ExpoKeepAwakeError';
  }
}

class AbilityKeepAwakeController {
  private readonly owners: Map<string, Set<string>> = new Map<string, Set<string>>();
  private window: window.Window | null = null;
  private foreground: boolean = false;
  private generation: number = 0;
  private activated: boolean = false;
  private known: boolean = false;
  private pending: Promise<void> = Promise.resolve();
  private resolver: WindowResolver | null = null;
  private destroyed: boolean = false;

  retain(owner: string): void {
    if (!this.owners.has(owner)) this.owners.set(owner, new Set<string>());
  }

  async activate(owner: string, tag: string): Promise<void> {
    await this.mutateTag(owner, tag, true);
  }

  async deactivate(owner: string, tag: string): Promise<void> {
    await this.mutateTag(owner, tag, false);
  }

  hasTags(owner: string): boolean {
    return (this.owners.get(owner)?.size ?? 0) > 0;
  }

  setForeground(foreground: boolean): void {
    if (this.destroyed) return;

    this.foreground = foreground;
    this.refresh();
  }

  setStage(stage: window.WindowStage): void {
    this.windowWillDestroy();
    this.resolver = (): window.Window => stage.getMainWindowSync();
  }

  async prepareWindow(): Promise<void> {
    await this.serialize(async (): Promise<void> => this.applyDesiredState());
  }

  private refresh(): void {
    this.prepareWindow().catch((error: Object): void => {
      if (!this.destroyed) console.warn(`Unable to reconcile Expo KeepAwake: ${String(error)}`);
    });
  }

  windowWillDestroy(): void {
    const target: window.Window | null = this.window;

    this.generation += 1;
    this.resolver = null;
    this.window = null;
    this.known = false;
    this.activated = false;

    // A restored Stage can leave the old window alive; release it after pending writes.
    if (target !== null) {
      this.serialize(async (): Promise<void> => {
        try {
          await target.setWindowKeepScreenOn(false);
        } finally {
          // A restored Stage may return the same underlying window.
          this.known = false;
        }
      }).catch((error: Object): void => {
        console.warn(`Unable to release Expo KeepAwake window: ${String(error)}`);
      });
    }
  }

  async release(owner: string): Promise<void> {
    if (!this.owners.has(owner)) return;

    await this.serialize(async (): Promise<void> => {
      this.owners.delete(owner);
      await this.applyDesiredState();
    });
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.foreground = false;
    this.owners.clear();

    this.windowWillDestroy();
  }

  private async mutateTag(owner: string, tag: string, adding: boolean): Promise<void> {
    await this.serialize(async (): Promise<void> => {
      this.assertActive();

      const tags: Set<string> = this.owners.get(owner) ?? new Set<string>();
      const present: boolean = tags.has(tag);

      this.owners.set(owner, tags);
      if (adding) tags.add(tag);
      else tags.delete(tag);

      try {
        await this.applyDesiredState();
      } catch (error) {
        if (present) tags.add(tag);
        else tags.delete(tag);

        try {
          await this.applyDesiredState();
        } catch (_) {
          this.known = false;
        }

        throw new ExpoKeepAwakeError(ERROR_WINDOW, `Unable to update the Harmony keep-screen-on state: ${String(error)}`);
      }
    });
  }

  private async applyDesiredState(): Promise<void> {
    if (this.destroyed) return;

    const generation: number = this.generation;

    if (this.window === null && this.hasAnyTags()) {
      const resolver: WindowResolver | null = this.resolver;
      if (resolver === null) {
        throw new ExpoKeepAwakeError(ERROR_WINDOW, 'The UIAbility main window is not available.');
      }

      this.window = resolver();
      this.known = false;
    }

    const target: window.Window | null = this.window;
    if (target === null) return;

    const desired: boolean = this.foreground && this.hasAnyTags();
    if (this.known && this.activated === desired) return;

    this.known = false;
    try {
      await target.setWindowKeepScreenOn(desired);
    } catch (error) {
      throw new ExpoKeepAwakeError(ERROR_WINDOW, `Unable to set keep-screen-on to ${String(desired)}: ${String(error)}`);
    }

    this.assertActive();
    if (generation !== this.generation) {
      throw new ExpoKeepAwakeError(ERROR_WINDOW, 'The UIAbility main window changed during the keep-awake request.');
    }

    this.activated = desired;
    this.known = true;
  }

  private hasAnyTags(): boolean {
    for (const tags of this.owners.values()) {
      if (tags.size > 0) return true;
    }

    return false;
  }

  private async serialize(task: () => Promise<void>): Promise<void> {
    const next: Promise<void> = this.pending.catch((): void => {}).then(task);
    this.pending = next;

    await next;
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new ExpoKeepAwakeError(ERROR_DESTROYED, 'The Expo KeepAwake Ability has already been destroyed.');
    }
  }
}

const controllers: WeakMap<common.UIAbilityContext, AbilityKeepAwakeController> = new WeakMap<common.UIAbilityContext, AbilityKeepAwakeController>();

export class ExpoKeepAwakeLifecycleSubscriber extends ExpoAbilityLifecycleSubscriber {
  private readonly controller: AbilityKeepAwakeController = new AbilityKeepAwakeController();

  constructor(context: common.UIAbilityContext) {
    super(context);
    controllers.set(context, this.controller);
  }

  override onForeground(): void {
    this.controller.setForeground(true);
  }

  override onBackground(): void {
    this.controller.setForeground(false);
  }

  override onWindowStageCreate(stage: window.WindowStage): void {
    this.controller.setStage(stage);
  }

  override onWindowStageRestore(stage: window.WindowStage): void {
    this.controller.setStage(stage);
  }

  override async onWindowStageSetup(): Promise<void> {
    await this.controller.prepareWindow();
  }

  override onWindowStageWillDestroy(): void {
    this.controller.windowWillDestroy();
  }

  override onWindowStageDestroy(): void {
    this.controller.windowWillDestroy();
  }

  override onDestroy(): void {
    controllers.delete(this.context);
    this.controller.destroy();
  }
}

export class ExpoKeepAwakeModule extends ExpoModule {
  private readonly controller?: AbilityKeepAwakeController;
  private readonly owner: string;
  private released: boolean = false;
  private destroyed: boolean = false;

  constructor(context: ExpoModuleContext) {
    super(context);

    const controller = controllers.get(context.uiAbilityContext);

    if (controller === undefined && !context.isHeadless) {
      throw new ExpoKeepAwakeError(ERROR_DESTROYED, 'Expo KeepAwake requires its autolinked Ability lifecycle subscriber.');
    }

    this.controller = controller;
    this.owner = context.runtimeEpoch;
    this.controller?.retain(this.owner);
  }

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoKeepAwake')
      .asyncFunction(
        'activate',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (tag: string): Promise<void> => {
          this.assertActive();
          await this.controller?.activate(this.owner, tag);
        }),
      )
      .asyncFunction(
        'deactivate',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (tag: string): Promise<void> => {
          this.assertActive();
          await this.controller?.deactivate(this.owner, tag);
        }),
      )
      .asyncFunction('isActivated', async (): Promise<boolean> => {
        if (this.context.isHeadless) return false;
        this.assertActive();

        return this.controller?.hasTags(this.owner) ?? false;
      })
      .asyncFunction('isAvailableAsync', async (): Promise<boolean> => !this.context.isHeadless)
      .onPrepareForReload(async (): Promise<void> => this.release())
      .onDestroy((): void => {
        this.destroyed = true;
        this.release().catch((error: Object): void => {
          console.warn(`Unable to release Expo KeepAwake runtime: ${String(error)}`);
        });
      });
  }

  private async release(): Promise<void> {
    if (this.released) return;

    this.released = true;
    await this.controller?.release(this.owner);
  }

  private assertActive(): void {
    if (this.context.isHeadless) throw new ExpoKeepAwakeError(ERROR_WINDOW, 'KeepAwake requires a foreground UIAbility window.');

    if (this.destroyed || this.released || !this.context.isValid) {
      throw new ExpoKeepAwakeError(ERROR_DESTROYED, 'The Expo KeepAwake runtime has already been destroyed.');
    }
  }
}
