import type common from '@ohos.app.ability.common';
import preferences from '@ohos.data.preferences';
import { ExpoUpdatesError, Json } from './UpdatesProtocol';

const name = 'expo-updates';
const key = 'configurationOverride';

export class UpdatesConfigurationOverride {
  private readonly storage: preferences.Preferences;

  constructor(context: common.ApplicationContext) {
    this.storage = preferences.getPreferencesSync(context, { name });
  }

  get initialized(): boolean { return this.storage.hasSync(key); }

  load(): Json | null {
    const value = this.storage.getSync(key, 'null');
    if (typeof value !== 'string') throw new ExpoUpdatesError('ERR_UPDATES_CONFIGURATION', 'Invalid persisted configuration override.');
    return JSON.parse(value);
  }

  save(value: Json | null): void {
    this.storage.putSync(key, JSON.stringify(value));
    this.storage.flushSync();
  }
}
