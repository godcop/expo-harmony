import { UpdatesConfiguration } from '../UpdatesConfiguration';
import { UpdatesDownloader } from '../UpdatesDownloader';
import { UpdatesStorage } from '../UpdatesStorage';
import { Headers, UpdateRecord } from '../UpdatesProtocol';
import { ExpoUpdatesError, UpdateResponse, parseUpdateResponse, headerDictionary, Json, serializeHeaders } from '../UpdatesProtocol';
import { serializeList } from '@expo-harmony/expo-structured-headers';
import { UpdatesSigning } from '../UpdatesSigning';
import { EASClientID } from '@expo-harmony/expo-eas-client/EASClientID';
import { UpdatesSelectionPolicy } from '../selectionpolicy/UpdatesSelectionPolicy';

export type DownloadProgress = (progress: number) => void;

export class RemoteLoader {
  constructor(private readonly storage: UpdatesStorage, private readonly downloader: UpdatesDownloader, private readonly identity: EASClientID) {}

  async assetHeaders(configuration: UpdatesConfiguration, launched?: UpdateRecord, embedded?: UpdateRecord, requested?: UpdateRecord): Promise<Headers> {
    const client = this.identity.clientID;
    const headers: Headers = {
      'expo-platform': 'harmony', 'expo-protocol-version': '1', 'expo-api-version': '1',
      'expo-updates-environment': 'BARE', 'eas-client-id': client,
    };
    if (launched) headers['expo-current-update-id'] = launched.id;
    if (embedded && configuration.embedded) headers['expo-embedded-update-id'] = embedded.id;
    if (requested) headers['expo-requested-update-id'] = requested.id;

    return headers;
  }

  private async requestHeaders(configuration: UpdatesConfiguration, launched?: UpdateRecord, embedded?: UpdateRecord): Promise<Headers> {
    const headers: Headers = {
      ...Object.fromEntries(Object.entries(await this.storage.metadata(configuration.scope, 'headers') ?? {}).map(([key, value]) => [key, String(value)])),
      ...await this.assetHeaders(configuration, launched, embedded),
      accept: 'multipart/mixed,application/expo+json,application/json', 'expo-json-error': 'true',
    };
    if (configuration.runtime) headers['expo-runtime-version'] = configuration.runtime;
    const extra = await this.storage.metadata(configuration.scope, 'extra') as Json | null;
    if (extra && Object.keys(extra).length) headers['expo-extra-params'] = serializeHeaders(extra);
    const failed = await this.storage.failed();
    if (failed.length) headers['expo-recent-failed-update-ids'] = serializeList(failed.map(value => [value.id, new Map()]));
    const fatal = await this.storage.consumeMetadata(configuration.scope, 'fatal');
    if (fatal) { headers['expo-fatal-error'] = String(fatal).slice(0, 1024).replace(/[\r\n]/g, ' '); }
    Object.assign(headers, configuration.headers);
    const signature = new UpdatesSigning(configuration).expectation;
    if (signature) headers['expo-expect-signature'] = signature;

    return headers;
  }

  async response(configuration: UpdatesConfiguration, launched?: UpdateRecord, embedded?: UpdateRecord): Promise<UpdateResponse> {
    const headers = await this.requestHeaders(configuration, launched, embedded);
    const signing = new UpdatesSigning(configuration);
    const response = await this.downloader.manifest(configuration.url, headers, Math.max(configuration.wait, 10000));
    for (const name of ['expo-server-defined-headers', 'expo-manifest-filters']) {
      if (response.headers[name] !== undefined && headerDictionary(response.headers[name]) === undefined) {
        this.storage.logger.log(`Ignoring malformed ${name}.`, 'UpdateFailedToLoad', 'warn');
      }
    }

    const result = await parseUpdateResponse(response.status, response.headers, response.body, configuration.scope, configuration.url,
      configuration.headers, (body, signature, chain) => signing.verify(body, signature, chain), configuration.compatibility);
    await this.storage.setResponseMetadata(configuration.scope, result.headers, result.filters);

    return result;
  }

  async check(configuration: UpdatesConfiguration, policy: UpdatesSelectionPolicy, launched?: UpdateRecord,
    embedded?: UpdateRecord, forFetch: boolean = false): Promise<{ response: UpdateResponse; result: Json }> {
    const response = await this.response(configuration, launched, embedded);
    const filters = response.filters;
    const directive = response.directive;
    let reason = 'noUpdateAvailableOnServer';
    if (directive?.type === 'rollBackToEmbedded') {
      if (!embedded || !configuration.embedded) reason = 'rollbackNoEmbeddedConfiguration';
      else if (policy.shouldLoadRollback(embedded, launched, directive.time!, filters)) {
        return { response, result: { isAvailable: false, isRollBackToEmbedded: true, time: directive.time } };
      } else reason = 'rollbackRejectedBySelectionPolicy';
    } else if (directive?.type !== 'noUpdateAvailable' && response.update) {
      const update = response.update;
      if (!policy.shouldLoad(update, launched, filters)) reason = 'updateRejectedBySelectionPolicy';
      else if (!forFetch && ((await this.storage.update(update.id))?.failed ?? 0) > 0) reason = 'updatePreviouslyFailed';
      else return { response, result: { isAvailable: true, isRollBackToEmbedded: false, manifest: update.manifest } };
    }

    return { response, result: { isAvailable: false, isRollBackToEmbedded: false, reason } };
  }

  async fetch(response: UpdateResponse, result: Json, configuration: UpdatesConfiguration,
    launched: UpdateRecord | undefined, embedded: UpdateRecord | undefined, progress: DownloadProgress): Promise<Json> {
    if (result.isRollBackToEmbedded && embedded) {
      await this.storage.setCommitTime(embedded, result.time);
      return { isNew: false, isRollBackToEmbedded: true };
    }
    if (!result.isAvailable || !response.update) return { isNew: false, isRollBackToEmbedded: false };

    const update = response.update;
    const stored = await this.storage.update(update.id);
    update.successful = stored?.successful ?? 0;
    update.failed = stored?.failed ?? 0;
    const headers = await this.assetHeaders(configuration, launched, embedded, update);
    const loaded = await this.load(update, configuration, launched, headers, progress);
    this.storage.logger.log(`Update ${update.id} downloaded.`, 'None', 'info', update.id);

    return { isNew: true, isRollBackToEmbedded: false, manifest: loaded.manifest };
  }

  async load(update: UpdateRecord, configuration: UpdatesConfiguration, base: UpdateRecord | undefined,
    headers: Headers, report: DownloadProgress, status: UpdateRecord['status'] = 'ready',
    count?: (successful: number, failed: number, total: number) => void): Promise<UpdateRecord> {
    await this.storage.insert(update);
    const stored = await this.storage.update(update.id);
    if (stored?.status === 'ready') return stored;

    const progress = new Array(update.assets.length).fill(0);
    const results = await Promise.allSettled(update.assets.map(async (asset, index) => {
      const result = await this.downloader.asset(asset, headers, (received, total) => {
        progress[index] = total > 0 ? received / total : 0;
        report(progress.reduce((sum, value) => sum + value, 0) / progress.length);
      }, {
        base,
        requested: update.id,
        patch: asset.launch && configuration.raw.enableBsdiffPatchSupport === true,
        headers: configuration.headers,
        timeout: Math.max(configuration.wait, 10000),
      });
      progress[index] = 1;
      return result;
    }));
    const failures: Error[] = [];
    let successfulCount = 0;
    let failedCount = 0;
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === 'rejected') {
        failedCount++;
        count?.(successfulCount, failedCount, update.assets.length);
        failures.push(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
        continue;
      }
      update.assets[index] = result.value;
      successfulCount++;
      count?.(successfulCount, failedCount, update.assets.length);
      await this.storage.associate(update.id, result.value, index);
    }
    report(progress.reduce((sum, value) => sum + value, 0) / progress.length);
    if (failures.length) {
      const error = failures[0];
      throw new ExpoUpdatesError(error instanceof ExpoUpdatesError ? error.code : 'ERR_UPDATES_ASSET', String(error), error instanceof Error ? error : undefined);
    }
    update.status = status;
    await this.storage.setStatus(update.id, status);

    return update;
  }
}
