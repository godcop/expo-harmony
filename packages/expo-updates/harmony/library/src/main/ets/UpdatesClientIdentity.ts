import type common from '@ohos.app.ability.common';
import relationalStore from '@ohos.data.relationalStore';
import fs from '@ohos.file.fs';
import { EASClientID } from '@expo-harmony/expo-eas-client/EASClientID';
import { ExpoUpdatesError } from './UpdatesProtocol';
import { isCorrupt } from './db/DatabaseError';

function legacy(context: common.ApplicationContext): string | undefined {
  const path = context.databaseDir + '/rdb/expo-updates.db';
  let database: relationalStore.RdbStore | undefined;
  try {
    if (!fs.accessSync(path)) return undefined;

    database = relationalStore.getRdbStoreSync(context, {
      name: 'expo-updates.db', securityLevel: relationalStore.SecurityLevel.S1, isReadOnly: true,
    });
    const tables = database.querySqlSync("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('json_data','metadata')");
    const names: string[] = [];

    try { while (tables.goToNextRow()) names.push(tables.getString(0)); } finally { tables.close(); }

    const query = names.includes('json_data')
      ? "SELECT value FROM json_data WHERE scope='' AND key='clientId' ORDER BY last_updated DESC,id DESC LIMIT 1"
      : names.includes('metadata') ? "SELECT payload FROM metadata WHERE scope='' AND key='clientId' LIMIT 1" : undefined;
    if (query === undefined) return undefined;

    const rows = database.querySqlSync(query);

    try {
      if (!rows.goToNextRow()) return undefined;

      const value = JSON.parse(rows.getString(0));
      if (typeof value !== 'string') throw new ExpoUpdatesError('ERR_UPDATES_CLIENT_ID', 'The legacy EAS client ID is invalid.');

      return value;
    } finally { rows.close(); }
  } catch (error) {
    if ((error as { code?: number }).code === 13900002) return undefined;
    if (!isCorrupt(error)) throw new ExpoUpdatesError('ERR_UPDATES_CLIENT_ID', `Unable to migrate the legacy EAS client ID: ${String(error)}`, error as Error);

    console.warn('[ExpoUpdates] The corrupt legacy database cannot supply its EAS client ID.');

    return undefined;
  } finally {
    database?.close().catch(error => console.warn(`[ExpoUpdates] Unable to close the legacy identity database: ${String(error)}`));
  }
}

// Register before any native module constants are evaluated, including headless consumers.
EASClientID.registerMigration(legacy);

export function clientIdentity(context: common.ApplicationContext): EASClientID { return new EASClientID(context); }
