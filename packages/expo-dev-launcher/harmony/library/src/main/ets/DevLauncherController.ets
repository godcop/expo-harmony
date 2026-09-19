import { scanBarcode, scanCore } from '@kit.ScanKit';
import { bundleManager } from '@kit.AbilityKit';
import type { common } from '@kit.AbilityKit';
import type { BusinessError } from '@kit.BasicServicesKit';
import type { JSBundleProvider } from '@rnoh/react-native-openharmony';
import { FileJSBundleProvider } from '@rnoh/react-native-openharmony';
import { Manifest } from '@expo-harmony/expo-manifests';
import { DevMenuAppMetadata } from '@expo-harmony/expo-dev-menu';
import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import type { DevToolsController } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/DevToolsController';
import { UpdatesControllerRegistry, UpdatesDevLauncherInterface, UpdatesInterfaceCallbacks } from '@expo-harmony/expo-updates-interface';
import { DevLauncherManifestLoader, LaunchSelection } from './DevLauncherManifestLoader';
import { DevLauncherError, displayError, LAUNCH_MODE_METADATA, resolveDevelopmentURL } from './DevLauncherProtocol';
import { DevServerDiscovery, DiscoveredServer } from './DevServerDiscovery';
import { RecentApp, RecentApps } from './RecentApps';
import { sendRuntimeError } from './DevLauncherRemoteLogs';

const SCAN_CAPABILITY = 'SystemCapability.Multimedia.Scan.ScanBarcode';
const SCANNER_CANCELLED_ERROR_CODE = 1000500002;

export class DevLauncherViewState {
  readonly loading: boolean;
  readonly progress: number;
  readonly error?: string;
  readonly recent: RecentApp[];
  readonly servers: DiscoveredServer[];

  constructor(loading: boolean, progress: number, error: string | undefined, recent: RecentApp[], servers: DiscoveredServer[]) {
    this.loading = loading;
    this.progress = progress;
    this.error = error;
    this.recent = recent;
    this.servers = servers;
  }
}

type StateListener = (state: DevLauncherViewState) => void;

export class DevLauncherController {
  private static readonly controllers = new Map<string, DevLauncherController>();

  static get(context: common.ApplicationContext): DevLauncherController {
    const info = bundleManager.getBundleInfoForSelfSync(bundleManager.BundleFlag.GET_BUNDLE_INFO_WITH_APPLICATION);
    let controller = DevLauncherController.controllers.get(info.name);
    if (controller === undefined) {
      controller = new DevLauncherController(context, info.name);
      DevLauncherController.controllers.set(info.name, controller);
    }
    return controller;
  }

  private selectionReady: Promise<void>;
  private resolveReady?: () => void;
  private homeTransition?: Promise<void>;
  private readonly history: RecentApps;
  private readonly listeners = new Set<StateListener>();
  private ability?: common.UIAbilityContext;
  private discovery?: DevServerDiscovery;
  private detachDiscovery?: () => void;
  private manager?: DevToolsController;
  private updatesCallbacks?: UpdatesInterfaceCallbacks;
  private provider?: JSBundleProvider;
  private selection?: LaunchSelection;
  private active = false;
  private foregrounded = false;
  private loading = false;
  private loadingURL?: string;
  private progress = 0;
  private error?: string;
  private recoveryChecked = false;
  private recoveredFailure = false;
  private recent: RecentApp[] = [];
  private servers: DiscoveredServer[] = [];
  private loadSerial = 0;
  private settledInitialSelection = false;
  private pendingURL?: string;
  private pendingReloadReason?: string;
  private readonly context: common.ApplicationContext;
  private readonly bundleName: string;

  private constructor(context: common.ApplicationContext, bundleName: string) {
    this.context = context;
    this.bundleName = bundleName;
    this.history = new RecentApps(context);
    this.recent = this.history.all();
    this.selectionReady = new Promise<void>((resolve: () => void): void => {
      this.resolveReady = resolve;
    });
  }

  get enabled(): boolean {
    return this.active;
  }
  get ready(): Promise<void> {
    return this.selectionReady;
  }
  get selectedProvider(): JSBundleProvider | undefined {
    return this.provider;
  }
  get useDeveloperSupport(): boolean | undefined {
    return this.active ? (this.selection?.useDeveloperSupport ?? true) : undefined;
  }
  get manifestString(): string | null {
    return this.selection?.manifest === undefined ? null : JSON.stringify(this.selection.manifest);
  }
  get manifestURL(): string | null {
    return this.selection?.manifestURL ?? null;
  }

  getDevMenuAppInfo(): DevMenuAppMetadata {
    const result = new DevMenuAppMetadata();
    const selection = this.selection;
    if (selection === undefined) return result;
    if (selection.provider instanceof FileJSBundleProvider) result.localBundlePath = selection.provider.getURL();
    if (selection.manifest === undefined) return result;
    try {
      const manifest = Manifest.fromManifestJson(selection.manifest);
      result.appName = manifest.getName() ?? undefined;
      result.appVersion = manifest.getVersion() ?? undefined;
      const config = manifest.getExpoClientConfigRootObject();
      const runtimeVersion: ESObject = selection.manifest.runtimeVersion ?? config?.runtimeVersion;
      if (typeof runtimeVersion === 'string') result.runtimeVersion = runtimeVersion;
      if (typeof config?.sdkVersion === 'string') result.sdkVersion = config.sdkVersion;
    } catch (error) {
      console.warn(`Unable to read optional Dev Menu manifest information: ${String(error)}`);
    }

    return result;
  }

  activate(debug: boolean): void {
    this.active = debug;
    if (!debug) {
      this.discovery?.stop();
      return;
    }
    UpdatesControllerRegistry.requestDevelopmentLauncherInitialization(this.bundleName);
    if (!this.recoveryChecked) {
      this.recoveryChecked = true;
      const failure = this.history.takeFailure();
      if (failure !== undefined) {
        this.recoveredFailure = true;
        this.error = `The previous runtime failed. Choose a project to try again.\n${failure}`;
        this.publish();
      }
    }
    if (this.foregrounded) this.discovery?.start();
  }

  attachAbility(ability: common.UIAbilityContext): void {
    if (this.ability === ability) return;
    this.detachAbility();
    this.ability = ability;
    this.discovery = new DevServerDiscovery(ability);
    this.detachDiscovery = this.discovery.subscribe((servers: DiscoveredServer[]): void => {
      this.servers = servers;
      this.publish();
    });
    if (this.active && this.foregrounded) this.discovery.start();
  }

  detachAbility(ability?: common.UIAbilityContext): void {
    if (ability !== undefined && this.ability !== ability) return;
    if (this.loadingURL !== undefined && this.pendingURL === undefined) this.pendingURL = this.loadingURL;
    this.loadSerial += 1;
    this.loading = false;
    this.loadingURL = undefined;
    this.progress = 0;
    this.manager = undefined;
    this.discovery?.stop();
    this.detachDiscovery?.();
    this.detachDiscovery = undefined;
    this.discovery = undefined;
    this.ability = undefined;
    this.servers = [];
    this.publish();
  }

  foreground(): void {
    this.foregrounded = true;
    if (this.active) this.discovery?.start();
  }

  background(): void {
    this.foregrounded = false;
    this.discovery?.stop();
  }

  setDevToolsManager(manager: DevToolsController): void {
    this.manager = manager;
    this.connectUpdates();
    const reason = this.pendingReloadReason;
    if (reason !== undefined) {
      this.pendingReloadReason = undefined;
      manager.reload(reason);
    }
  }

  connectUpdates(): void {
    const updates = UpdatesControllerRegistry.controller as UpdatesDevLauncherInterface | undefined;
    if (updates !== undefined && typeof updates.fetchUpdateWithConfiguration === 'function') {
      if (this.updatesCallbacks === undefined) {
        this.updatesCallbacks = {
          onRequestRelaunch: (): void => this.manager?.reload('Expo Updates requested a development-client reload.'),
        };
      }
      updates.updatesInterfaceCallbacks = this.updatesCallbacks;
    }
  }

  startInitialSelection(): void {
    if (!this.active || this.loading) return;

    const pending = this.pendingURL;
    if (pending !== undefined) {
      this.pendingURL = undefined;
      this.load(pending).catch((): void => {});
      return;
    }
    if (this.settledInitialSelection || this.recoveredFailure) return;

    const metadata = this.ability?.currentHapModuleInfo.metadata;
    const mode = metadata?.find((entry): boolean => entry.name === LAUNCH_MODE_METADATA)?.value;
    if (mode === 'launcher') return;

    const recent = this.recent[0];
    if (recent !== undefined) this.load(recent.url).catch((): void => {});
  }

  receiveLink(value: string): void {
    this.pendingURL = value;
    if (this.active && !this.loading) {
      this.pendingURL = undefined;
      this.load(value).catch((): void => {});
    }
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.state());
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  async showLauncher(suspend: () => Promise<void>): Promise<void> {
    if (!this.active || !this.settledInitialSelection) return;
    if (this.homeTransition !== undefined) return await this.homeTransition;

    const pending = this.returnToLauncher(suspend);
    this.homeTransition = pending;
    try {
      await pending;
    } finally {
      if (this.homeTransition === pending) this.homeTransition = undefined;
    }
  }

  private async returnToLauncher(suspend: () => Promise<void>): Promise<void> {
    // Invalidate in-flight manifest/history results before releasing the running app.
    ++this.loadSerial;
    this.loading = false;
    this.loadingURL = undefined;
    this.pendingURL = undefined;
    this.pendingReloadReason = undefined;
    this.progress = 0;
    this.error = undefined;
    try {
      await suspend();
      // A queued reload may still need the current selection to complete before
      // suspend can run. Install the new gate only after that queue has drained.
      this.selectionReady = new Promise<void>((resolve: () => void): void => {
        this.resolveReady = resolve;
      });
      this.selection = undefined;
      this.provider = undefined;
      this.publish();
    } catch (error) {
      this.error = displayError(error as Object);
      this.publish();
      throw new DevLauncherError(
        error instanceof DevLauncherError || error instanceof ExpoModuleError ? error.code : 'ERR_DEV_LAUNCHER_RUNTIME',
        displayError(error as Object),
      );
    }
  }

  async load(value: string): Promise<void> {
    if (this.homeTransition !== undefined) await this.homeTransition;
    if (!this.active) throw new DevLauncherError('ERR_DEV_LAUNCHER_UNAVAILABLE', 'Expo Dev Launcher is available only in debug builds.');
    if (this.loading) {
      this.pendingURL = value;
      return;
    }

    const serial = ++this.loadSerial;

    try {
      const url = resolveDevelopmentURL(value);
      this.loading = true;
      this.loadingURL = url;
      this.progress = 0;
      this.error = undefined;
      this.publish();
      this.connectUpdates();

      const selection = await new DevLauncherManifestLoader(this.context, []).load(url, (progress: number): void => {
        if (serial !== this.loadSerial) return;
        this.progress = progress;
        this.publish();
      });
      if (serial !== this.loadSerial) return;

      const pending = this.pendingURL;
      if (pending !== undefined) {
        this.pendingURL = undefined;
        this.loading = false;
        this.loadingURL = undefined;
        // Let the next load own its error; this load's serial is now obsolete.
        return this.load(pending);
      }
      try {
        await this.history.remember(url, selection.name);
        this.recent = this.history.all();
      } catch (error) {
        console.warn(`Unable to save Expo Dev Launcher history: ${String(error)}`);
      }
      if (serial !== this.loadSerial) return;

      const queued = this.pendingURL;
      if (queued !== undefined) {
        this.pendingURL = undefined;
        this.loading = false;
        this.loadingURL = undefined;
        return this.load(queued);
      }
      this.selection = selection;
      this.recoveredFailure = false;
      this.history.clearFailure();
      this.provider = selection.provider;
      this.loading = false;
      this.loadingURL = undefined;
      this.progress = 1;
      this.error = undefined;
      this.publish();

      const first = !this.settledInitialSelection;
      this.resolveReady?.();
      this.resolveReady = undefined;
      if (first) {
        this.settledInitialSelection = true;
      } else {
        const reason = `Opened ${selection.name} from Expo Dev Launcher.`;
        if (this.manager === undefined) this.pendingReloadReason = reason;
        else this.manager.reload(reason);
      }
    } catch (error) {
      if (serial !== this.loadSerial) return;

      const pending = this.pendingURL;
      if (pending !== undefined) {
        this.pendingURL = undefined;
        this.loading = false;
        this.loadingURL = undefined;
        return this.load(pending);
      }
      this.loading = false;
      this.loadingURL = undefined;
      this.progress = 0;
      this.error = displayError(error as Object);
      this.publish();
      throw new DevLauncherError(
        error instanceof DevLauncherError || error instanceof ExpoModuleError ? error.code : 'ERR_DEV_LAUNCHER_RUNTIME',
        displayError(error as Object),
      );
    }
  }

  async scan(): Promise<void> {
    try {
      const ability = this.ability;
      if (ability === undefined) throw new DevLauncherError('ERR_DEV_LAUNCHER_ABILITY', 'No foreground UIAbility is available for QR scanning.');
      if (!canIUse(SCAN_CAPABILITY))
        throw new DevLauncherError('ERR_DEV_LAUNCHER_SCANNER_UNAVAILABLE', 'QR scanning is not supported on this device.');
      const result = await scanBarcode.startScanForResult(ability, { scanTypes: [scanCore.ScanType.QR_CODE] });
      if (result.originalValue.length === 0) throw new DevLauncherError('ERR_DEV_LAUNCHER_INVALID_QR', 'The QR code is empty.');
      await this.load(result.originalValue);
    } catch (error) {
      if (error !== null && typeof error === 'object' && (error as BusinessError).code === SCANNER_CANCELLED_ERROR_CODE) return;

      const code = error instanceof DevLauncherError ? error.code : 'ERR_DEV_LAUNCHER_SCANNER';
      const message = error instanceof DevLauncherError ? error.message : `The QR scanner could not complete. ${String(error)}`;
      this.error = message;
      this.publish();

      throw new DevLauncherError(code, message);
    }
  }

  async clearHistory(): Promise<void> {
    await this.history.clear();
    this.recent = [];
    this.publish();
  }

  reportReactError(error: Error): void {
    if (!this.active) return;
    this.history.rememberFailure(error);
    if (this.selection?.useDeveloperSupport && this.provider !== undefined) sendRuntimeError(this.provider.getURL(), error);
    this.error = error.message;
    this.publish();
  }

  private state(): DevLauncherViewState {
    return new DevLauncherViewState(this.loading, this.progress, this.error, this.recent.slice(), this.servers.slice());
  }

  private publish(): void {
    const state = this.state();
    this.listeners.forEach((listener: StateListener): void => listener(state));
  }
}
