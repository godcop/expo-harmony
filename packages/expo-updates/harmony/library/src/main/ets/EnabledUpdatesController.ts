import type common from '@ohos.app.ability.common';
import { UpdatesConfiguration } from './UpdatesConfiguration';
import { UpdatesConfigurationOverride } from './UpdatesConfigurationOverride';
import { UpdatesState } from './UpdatesState';
import { UpdatesStorage } from './UpdatesStorage';
import { clientIdentity } from './UpdatesClientIdentity';
import { UpdatesSelectionPolicy } from './selectionpolicy/UpdatesSelectionPolicy';
import { StartupProcedure } from './procedures/StartupProcedure';
import { CheckForUpdateProcedure } from './procedures/CheckForUpdateProcedure';
import { SelectionPolicyFactory } from './selectionpolicy/SelectionPolicyFactory';
import { UpdatesLogReader } from './logging/UpdatesLogReader';
import { ExpoUpdatesError, Headers, Json, UpdateRecord,
  serializeHeaders } from './UpdatesProtocol';

import { IUpdatesController } from './IUpdatesController';


export class EnabledUpdatesController implements IUpdatesController {
  readonly state = new UpdatesState();
  readonly storage: UpdatesStorage;
  readonly ready: Promise<void>;
  private finish!: () => void;
  private started = false;
  readonly development: boolean;
  private readonly original: UpdatesConfiguration;
  configuration: UpdatesConfiguration;
  private selection?: UpdatesSelectionPolicy;
  private readonly startup: StartupProcedure;
  private initialized = false;
  private overrides?: UpdatesConfigurationOverride;

  constructor(private readonly context: common.ApplicationContext, original: UpdatesConfiguration, development: boolean,
    private readonly disable: (error: Error) => void) {
    this.original = original;
    this.configuration = original;
    this.development = development;
    this.ready = new Promise<void>(resolve => { this.finish = resolve; });
    this.storage = new UpdatesStorage(context);
    const controller = this;
    this.startup = new StartupProcedure(context, this.storage, this.state, {
      get configuration() { return controller.configuration; },
      get policy() { return controller.policy; },
      get initialized() { return controller.initialized; },
      launched: () => this.finish(),
    });
  }

  get launched(): UpdateRecord | undefined { return this.startup.launched; }
  get embedded(): UpdateRecord | undefined { return this.startup.embedded; }
  get emergency(): string | undefined { return this.startup.emergency; }
  get duration(): number | null { return this.startup.duration; }

  readonly enabled = true;
  readonly active = true;
  get path(): string | null { return this.launched?.assets.find(asset => asset.launch)?.path ?? null; }
  get localAssets(): Record<string, string> { return this.assets(this.launched); }

  private assets(update?: UpdateRecord): Record<string, string> {
    if (!update) return {};
    const embedded = this.configuration.embedded ? this.embedded?.assets.filter(asset => !asset.launch) ?? [] : [];
    return Object.fromEntries([...embedded, ...update.assets].filter(asset => asset.key !== null && !!asset.path).map(asset => [asset.key, 'file://' + asset.path!.split('/').map(value => encodeURIComponent(value)).join('/')]));
  }

  hasAsset(id: number, path: string): boolean {
    const update = this.startup.update(id) ?? this.launched;
    const embedded = this.configuration.embedded ? this.embedded?.assets ?? [] : [];
    return [...embedded, ...(update?.assets ?? [])].some(asset => asset.path === path);
  }

  constants(id?: number): Json {
    const launched = id === undefined ? this.launched : this.startup.update(id) ?? this.launched;
    return {
      isEnabled: this.enabled, isEmergencyLaunch: this.emergency !== undefined, emergencyLaunchReason: this.emergency ?? null,
      launchDuration: this.duration, isEmbeddedLaunch: !!launched && this.configuration.embedded && launched.id === this.embedded?.id,
      isUsingEmbeddedAssets: !launched || launched.status === 'embedded', runtimeVersion: this.configuration.runtime,
      checkAutomatically: this.configuration.check, channel: this.configuration.headers['expo-channel-name'] ?? '',
      shouldDeferToNativeForAPIMethodAvailabilityInDevelopment: this.configuration.debug,
      updateId: launched?.id, commitTime: launched?.time,
      manifest: launched?.manifest, localAssets: this.assets(launched), initialContext: this.state.context,
    };
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.launch().catch((error: Error): void => {
      this.disable(new ExpoUpdatesError('ERR_UPDATES_INITIALIZATION', `Unable to initialize Updates: ${String(error)}`, error));
    }).finally(() => this.finish());
  }

  private async launch(): Promise<void> {
    this.startup.begin();

    try {
      clientIdentity(this.context).clientID;
      await this.storage.open();
    }
    catch (error) {
      this.disable(new ExpoUpdatesError('ERR_UPDATES_DATABASE', `Unable to initialize Updates storage: ${String(error)}`, error as Error));
      return;
    }
    this.overrides = new UpdatesConfigurationOverride(this.context);
    if (!this.overrides.initialized) this.overrides.save(await this.storage.metadata('', 'configuration'));
    this.initialized = true;

    try {
      const override = this.overrides.load();
      if (override) this.configuration = this.original.override(override, this.development, true);
    } catch (error) {
      this.storage.logger.log(`Ignoring invalid persisted configuration: ${String(error)}`, 'InitializationError', 'warn');
      this.overrides.save(null);
    }

    await this.state.queue(this.startup);
    this.startup.reap();
  }

  get policy(): UpdatesSelectionPolicy {
    const config = this.configuration;
    return this.selection ?? SelectionPolicyFactory.filterAware(config.runtime, config.url, config.headers);
  }

  setSelectionPolicy(policy: UpdatesSelectionPolicy): void { this.selection = policy; }

  resetSelectionPolicy(): void { this.selection = undefined; }

  private requireEnabled(): void {
    if (!this.initialized) throw new ExpoUpdatesError('ERR_UPDATES_DISABLED', 'expo-updates is not enabled in this build.');
  }

  async checkForUpdateAsync(): Promise<Json> {
    await this.ready;
    this.requireEnabled();
    return this.state.queue(new CheckForUpdateProcedure(this.startup));
  }

  async fetchUpdateAsync(): Promise<Json> {
    await this.ready;
    this.requireEnabled();
    return this.startup.download();
  }

  attach(id: number, reload: (reason: string) => Promise<void>, owner: Object): () => void {
    return this.startup.attach(id, reload, owner);
  }

  loaded(id: number): void { this.startup.loaded(id); }

  contentAppeared(id: number): void { this.startup.contentAppeared(id); }

  onReactInstanceException(id: number, error: Error): void { this.startup.onReactInstanceException(id, error); }

  async reload(id: number, reload: (reason: string) => Promise<void>): Promise<void> {
    await this.ready;
    this.requireEnabled();
    return this.startup.reload(id, reload);
  }

  async extra(): Promise<Headers> {
    await this.ready;
    this.requireEnabled();
    return await this.storage.metadata(this.configuration.scope, 'extra') ?? {};
  }

  async setExtra(key: string, value: string | null): Promise<void> {
    await this.ready;
    this.requireEnabled();
    await this.storage.updateMetadata(this.configuration.scope, 'extra', extra => {
      const next = { ...extra };
      if (value === null) delete next[key];
      else next[key] = value;
      serializeHeaders(next);

      return next;
    });
  }

  override(value: Json | null, headersOnly: boolean = false): void {
    this.requireEnabled();
    if (!headersOnly && !this.original.unsafe) throw new ExpoUpdatesError('ERR_UPDATES_RUNTIME_OVERRIDE', 'URL overrides require disableAntiBrickingMeasures.');

    const config = this.original.override(value, this.development);
    this.overrides!.save(value);
    this.configuration = config;
  }

  overrideHeaders(headers: Headers | null): void {
    this.requireEnabled();
    const normalized = headers === null ? null : UpdatesConfiguration.headers(headers);
    if (normalized && Object.keys(normalized).some(key => key === 'host' || !Object.prototype.hasOwnProperty.call(this.original.headers, key))) {
      throw new ExpoUpdatesError('ERR_UPDATES_RUNTIME_OVERRIDE', 'Request header overrides can only replace embedded header names.');
    }

    const previous = this.overrides!.load() ?? {};
    const value = { ...previous };
    if (headers === null) delete value.requestHeaders;
    else value.requestHeaders = normalized;
    this.override(Object.keys(value).length ? value : null, true);
  }

  logs(age: number): Promise<Json[]> { return new UpdatesLogReader(this.context).read(age); }

  clearLogs(): Promise<void> { return new UpdatesLogReader(this.context).clear(); }
}
