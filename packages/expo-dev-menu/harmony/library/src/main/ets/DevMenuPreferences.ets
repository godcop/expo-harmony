import { common, bundleManager } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import { FabPoint } from './DevMenuFabGeometry';

const STORE_NAME: string = 'expo.modules.devmenu.preferences';
const FAB_METADATA: string = 'EXDevMenuShowFloatingActionButton';
const FAST_REFRESH: string = 'hotLoadingEnabled';
const PREFERENCES_TYPE = ExpoValueTypes.custom<Record<string, ESObject>>(
  'DevMenuPreferences',
  (value: ESObject): Record<string, ESObject> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Preferences must be an object.');
    return value as Record<string, ESObject>;
  },
  (value: Record<string, ESObject>): ESObject => value,
);

export enum DevMenuPreference {
  MotionGesture = 'motionGestureEnabled',
  TouchGesture = 'touchGestureEnabled',
  KeyCommands = 'keyCommandsEnabled',
  ShowsAtLaunch = 'showsAtLaunch',
  OnboardingFinished = 'isOnboardingFinished',
  ShowFab = 'showFloatingActionButton',
}

export class DevMenuPreferences {
  private readonly store?: preferences.Preferences;
  private readonly values: Map<string, boolean> = new Map<string, boolean>();
  private readonly defaults: Map<string, boolean>;
  private readonly listeners: Set<() => void> = new Set<() => void>();
  private readonly onChange = (): void => this.listeners.forEach((listener: () => void): void => listener());
  private position?: FabPoint;

  constructor(context: common.Context) {
    try {
      this.store = preferences.getPreferencesSync(context.getApplicationContext(), { name: STORE_NAME });
    } catch (error) {
      console.warn(`Expo Dev Menu preferences are unavailable; using session defaults: ${String(error)}`);
    }
    this.defaults = new Map<string, boolean>([
      [DevMenuPreference.MotionGesture, true],
      [DevMenuPreference.TouchGesture, true],
      [DevMenuPreference.KeyCommands, true],
      [DevMenuPreference.ShowsAtLaunch, false],
      [DevMenuPreference.OnboardingFinished, false],
      [DevMenuPreference.ShowFab, this.fabDefault()],
    ]);
    this.store?.on('change', this.onChange);
  }

  get(key: DevMenuPreference): boolean {
    const fallback = this.defaults.get(key) ?? false;
    const value = this.store?.getSync(key, fallback) ?? this.values.get(key) ?? fallback;
    return typeof value === 'boolean' ? value : fallback;
  }

  async set(key: DevMenuPreference, value: boolean): Promise<void> {
    await this.setBoolean(key, value);
  }

  getFastRefreshEnabled(): boolean {
    const value = this.store?.getSync(FAST_REFRESH, true) ?? this.values.get(FAST_REFRESH) ?? true;
    return typeof value === 'boolean' ? value : true;
  }

  async setFastRefreshEnabled(value: boolean): Promise<void> {
    await this.setBoolean(FAST_REFRESH, value);
  }

  private async setBoolean(key: string, value: boolean): Promise<void> {
    const store = this.store;
    if (store === undefined) {
      this.values.set(key, value);
      this.onChange();

      throw new Error('Preferences storage is unavailable. This change applies only to the current session.');
    }

    if (store.getSync(key, !value) === value) {
      await store.flush();
      return;
    }

    store.putSync(key, value);
    // Notify locally before flush; storage events synchronize other runtimes.
    this.onChange();
    await store.flush();
  }

  snapshot(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    this.defaults.forEach((_value: boolean, key: string): void => {
      result[key] = this.get(key as DevMenuPreference);
    });
    return result;
  }

  getFabPosition(): FabPoint | undefined {
    const x = this.store?.getSync('fabPositionX', -1) ?? this.position?.x;
    const y = this.store?.getSync('fabPositionY', -1) ?? this.position?.y;
    return typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0
      ? new FabPoint(x, y)
      : undefined;
  }

  async saveFabPosition(position: FabPoint): Promise<void> {
    this.position = position;

    const store = this.store;
    if (store === undefined) throw new Error('FAB position storage is unavailable; keeping the position for this session.');

    store.putSync('fabPositionX', position.x);
    store.putSync('fabPositionY', position.y);
    await store.flush();
  }

  async setPreferences(values: Record<string, ESObject>): Promise<void> {
    for (const key of this.defaults.keys()) {
      if (key !== DevMenuPreference.OnboardingFinished && typeof values[key] === 'boolean') {
        await this.set(key as DevMenuPreference, values[key] as boolean);
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.store?.off('change', this.onChange);
    this.listeners.clear();
  }

  private fabDefault(): boolean {
    try {
      const flags = bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION | bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_METADATA;
      const info = bundleManager.getBundleInfoForSelfSync(flags);
      for (const module of info.appInfo.metadataArray ?? []) {
        for (const entry of module.metadata) {
          if (entry.name === FAB_METADATA) return entry.value !== 'false';
        }
      }
    } catch (error) {
      console.warn(`Unable to read Expo Dev Menu FAB default; using true: ${String(error)}`);
    }

    return true;
  }
}

export class DevMenuPreferencesModule extends ExpoModule {
  private preferences?: DevMenuPreferences;

  definition(): ExpoModuleDefinition {
    if (!this.context.isDebug) return new ExpoModuleDefinition().name('DevMenuPreferencesStub');
    return new ExpoModuleDefinition()
      .name('DevMenuPreferences')
      .asyncFunction(
        'getPreferencesAsync',
        ExpoFunction.typed0(async (): Promise<Record<string, boolean>> => this.requirePreferences().snapshot()),
      )
      .asyncFunction(
        'setPreferencesAsync',
        ExpoFunction.typed1(PREFERENCES_TYPE, async (values: Record<string, ESObject>): Promise<void> => {
          await this.requirePreferences().setPreferences(values);
        }),
      )
      .onDestroy((): void => {
        this.preferences?.dispose();
        this.preferences = undefined;
      });
  }

  private requirePreferences(): DevMenuPreferences {
    if (this.preferences === undefined) this.preferences = new DevMenuPreferences(this.context.uiAbilityContext);
    return this.preferences;
  }
}
