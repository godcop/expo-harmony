import type common from '@ohos.app.ability.common';
import { UpdatesConfiguration } from './UpdatesConfiguration';
import { UpdatesDownloader } from './UpdatesDownloader';
import { UpdatesState } from './UpdatesState';
import { UpdatesStorage } from './UpdatesStorage';
import { RemoteLoader } from './loader/RemoteLoader';
import { clientIdentity } from './UpdatesClientIdentity';
import { ExpoUpdatesError, Headers, Json, UpdateRecord } from './UpdatesProtocol';

import { IUpdatesController } from './IUpdatesController';
import { UpdatesLogReader } from './logging/UpdatesLogReader';
import { SelectionPolicyFactory } from './selectionpolicy/SelectionPolicyFactory';
import { UpdatesDatabaseLauncher } from './launcher/UpdatesDatabaseLauncher';

export class UpdatesDevLauncherController implements IUpdatesController {
  readonly state = new UpdatesState();
  readonly ready: Promise<void> = Promise.resolve();
  readonly enabled = true;
  readonly active = false;
  private config: UpdatesConfiguration;
  private readonly storage: UpdatesStorage;
  private readonly downloader: UpdatesDownloader;
  private readonly loader: RemoteLoader;
  private opened = false;
  private current?: UpdateRecord;
  developmentReload?: () => void;

  constructor(private readonly context: common.ApplicationContext, private readonly original: UpdatesConfiguration) {
    this.config = original;
    this.storage = new UpdatesStorage(context);
    this.downloader = new UpdatesDownloader(this.storage, context);
    this.loader = new RemoteLoader(this.storage, this.downloader, clientIdentity(context));
  }

  get configuration(): UpdatesConfiguration { return this.config; }
  get launched(): UpdateRecord | undefined { return this.current; }
  get embedded(): UpdateRecord | undefined { return undefined; }
  get path(): string | null { return this.current?.assets.find(asset => asset.launch)?.path ?? null; }

  start(): void {}

  constants(_id?: number): Json {
    const update = this.current;
    return {
      isEnabled: true,
      isEmergencyLaunch: false,
      emergencyLaunchReason: null,
      launchDuration: null,
      isEmbeddedLaunch: false,
      isUsingEmbeddedAssets: false,
      runtimeVersion: this.config.runtime || '1',
      checkAutomatically: this.config.check,
      channel: this.config.headers['expo-channel-name'] ?? '',
      shouldDeferToNativeForAPIMethodAvailabilityInDevelopment: true,
      updateId: update?.id,
      commitTime: update?.time,
      manifest: update?.manifest,
      localAssets: this.localAssets(update),
      initialContext: this.state.context,
    };
  }

  private localAssets(update?: UpdateRecord): Record<string, string> {
    if (!update) return {};
    return Object.fromEntries(update.assets
      .filter(asset => asset.key !== null && !!asset.path)
      .map(asset => [asset.key, 'file://' + asset.path!.split('/').map(value => encodeURIComponent(value)).join('/')]));
  }

  attach(_id: number, _reload: (reason: string) => Promise<void>, _owner: Object): () => void { return () => {}; }
  loaded(_id: number): void {}
  contentAppeared(_id: number): void {}
  hasAsset(_id: number, path: string): boolean {
    return this.current?.assets.some(asset => asset.path === path) === true;
  }
  onReactInstanceException(_id: number, _error: Error): void {}

  async reload(_id: number, _reload: (reason: string) => Promise<void>): Promise<void> {
    this.developmentReload?.();
  }

  async checkForUpdateAsync(): Promise<Json> {
    throw new ExpoUpdatesError('ERR_UPDATES_DEV_CLIENT', 'Updates.checkForUpdateAsync() is not supported in development builds.');
  }

  async fetchUpdateAsync(): Promise<Json> {
    throw new ExpoUpdatesError('ERR_UPDATES_DEV_CLIENT', 'Updates.fetchUpdateAsync() is not supported in development builds.');
  }

  async extra(): Promise<Headers> {
    throw new ExpoUpdatesError('ERR_UPDATES_DEV_CLIENT', 'Updates.getExtraParamsAsync() is not supported in development builds.');
  }

  async setExtra(_key: string, _value: string | null): Promise<void> {
    throw new ExpoUpdatesError('ERR_UPDATES_DEV_CLIENT', 'Updates.setExtraParamAsync() is not supported in development builds.');
  }

  override(_value: Json | null): void {
    throw new ExpoUpdatesError('ERR_UPDATES_DEV_CLIENT', 'Updates.setUpdateURLAndRequestHeadersOverride() is not supported in development builds.');
  }

  overrideHeaders(_headers: Headers | null): void {
    throw new ExpoUpdatesError('ERR_UPDATES_DEV_CLIENT', 'Updates.setUpdateRequestHeadersOverride() is not supported in development builds.');
  }


  logs(age: number): Promise<Json[]> { return new UpdatesLogReader(this.context).read(age); }

  clearLogs(): Promise<void> { return new UpdatesLogReader(this.context).clear(); }

  reset(): void { this.current = undefined; }

  configurationFor(value: Json): UpdatesConfiguration {
    const dynamic = { ...value };
    if (dynamic.url === undefined && typeof dynamic.updateUrl === 'string') dynamic.url = dynamic.updateUrl;
    const configuration = new UpdatesConfiguration({ ...this.original.raw, ...dynamic, useEmbeddedUpdate: false }, false);
    if (!configuration.enabled) throw new ExpoUpdatesError('ERR_UPDATES_CONFIGURATION', 'A development update requires an enabled configuration, URL, and runtime version.');

    return configuration;
  }

  async loadDevelopment(value: Json, accepted: (manifest: Json) => boolean,
    progress: (successful: number, failed: number, total: number) => void): Promise<{ manifest: Json; launchAssetPath: string } | null> {
    const configuration = this.configurationFor(value);
    return this.state.queue({ run: () => this.fetch(configuration, accepted, progress) });
  }

  private async fetch(configuration: UpdatesConfiguration, accepted: (manifest: Json) => boolean,
    progress: (successful: number, failed: number, total: number) => void): Promise<{ manifest: Json; launchAssetPath: string } | null> {
    const previous = this.config;
    try {
      if (!this.opened) {
        await this.storage.open();
        this.opened = true;
      }
      this.config = configuration;

      const response = await this.loader.response(configuration);
      if (response.directive || !response.update || !accepted(response.update.manifest)) return null;

      const candidate = response.update;
      const headers = await this.loader.assetHeaders(configuration, undefined, undefined, candidate);
      const loaded = await this.loader.load(candidate, configuration, undefined, headers, () => {},
        candidate.status === 'development' ? 'development' : 'ready', progress);
      const policy = SelectionPolicyFactory.singleUpdate(loaded.id, SelectionPolicyFactory.development(configuration.runtime, configuration.url, configuration.headers));
      const launcher = new UpdatesDatabaseLauncher(this.storage, this.downloader, policy, () => undefined);
      const update = await launcher.launch(configuration, async () => headers);
      const path = update?.assets.find(asset => asset.launch)?.path;
      if (!update || !path) throw new ExpoUpdatesError('ERR_UPDATES_ASSET', 'The development update has no launch asset.');

      this.current = update;

      try {
        const updates = await this.storage.updates();
        await this.storage.delete(policy.toDelete(updates, update));
      } catch (error) {
        this.storage.logger.log(`Unable to reap development updates: ${String(error)}`, 'Unknown', 'warn');
      }

      return { manifest: update.manifest, launchAssetPath: path };
    } catch (error) {
      this.config = previous;
      throw new ExpoUpdatesError(error instanceof ExpoUpdatesError ? error.code : 'ERR_UPDATES_DEV_CLIENT',
        String(error), error instanceof Error ? error : undefined);
    }
  }
}
