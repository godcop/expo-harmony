import type { UpdateAsset, UpdateRecord } from '../UpdatesProtocol';

export interface AssetEntity extends Omit<UpdateAsset, 'launch'> {
  id: number;
  downloadTime?: number;
  marked: boolean;
}

export interface UpdateEntity extends Omit<UpdateRecord, 'assets'> {
  keep: boolean;
  launchAssetId?: number;
}

export interface JSONDataEntity {
  id: number;
  scope: string;
  key: string;
  value: ESObject;
  lastUpdated: number;
}
