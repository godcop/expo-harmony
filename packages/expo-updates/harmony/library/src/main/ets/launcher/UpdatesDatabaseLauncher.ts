import { UpdatesDownloader } from '../UpdatesDownloader';
import { UpdatesStorage, exists, hashFile } from '../UpdatesStorage';
import { UpdatesConfiguration } from '../UpdatesConfiguration';
import { UpdateAsset, UpdateRecord } from '../UpdatesProtocol';
import { UpdatesSelectionPolicy } from '../selectionpolicy/UpdatesSelectionPolicy';

export type AssetHeaders = (update: UpdateRecord) => Promise<Record<string, string>>;

export class UpdatesDatabaseLauncher {
  constructor(private readonly storage: UpdatesStorage, private readonly downloader: UpdatesDownloader,
    private readonly policy: UpdatesSelectionPolicy, private readonly embedded: () => UpdateRecord | undefined) {}

  async launch(configuration: UpdatesConfiguration, assetHeaders: AssetHeaders): Promise<UpdateRecord | undefined> {
    const candidates = (await this.storage.launchable(configuration.scope)).filter(value =>
      (value.status !== 'embedded' || (configuration.embedded && value.id === this.embedded()?.id)));
    const selected = this.policy.select(candidates, await this.storage.metadata(configuration.scope, 'filters'));
    if (!selected) return undefined;

    // Selection precedes asset validation. A corrupt selected update must not silently
    // roll back to an older update; error recovery decides the next launch explicitly.
    return this.launchUpdate(selected, configuration, assetHeaders);
  }

  async launchUpdate(selected: UpdateRecord, configuration: UpdatesConfiguration, assetHeaders: AssetHeaders): Promise<UpdateRecord | undefined> {
    let available = true;
    for (let index = 0; index < selected.assets.length; index++) {
      const asset = selected.assets[index];
      if (asset.path && exists(asset.path) && hashFile(asset.path) === asset.digest) continue;
      const embeddedAsset = this.embedded()?.assets.find(value => asset.key !== null && value.key === asset.key && (!asset.hash || value.hash === asset.hash));

      try {
        selected.assets[index] = await this.downloader.asset({ ...asset, embedded: embeddedAsset?.embedded }, await assetHeaders(selected), () => {}, {
          headers: configuration.headers, timeout: Math.max(configuration.wait, 10000),
        });
      } catch (error) {
        selected.assets[index] = { ...asset, path: undefined };
        this.storage.logger.log(`Unable to repair asset ${asset.key}: ${String(error)}`, 'AssetsFailedToLoad', 'warn', selected.id, asset.key ?? undefined);
        if (asset.launch) available = false;
      }
    }
    if (available) await this.storage.markAccessed(selected.id);
    if (available) return selected;

    this.storage.logger.log(`Update ${selected.id} has missing or corrupt assets.`, 'UpdateAssetsNotAvailable', 'warn', selected.id);

    return undefined;
  }
}
