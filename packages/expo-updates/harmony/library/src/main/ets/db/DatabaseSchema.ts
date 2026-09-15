import relationalStore from '@ohos.data.relationalStore';
import { ExpoUpdatesError, UpdateAsset, UpdateRecord } from '../UpdatesProtocol';
import { isRecord } from '../UpdatesJson';
import { AssetsDao, DatabaseConnection, JSONDataDao, UpdatesDao, readRows } from './Daos';
import { transact } from './DatabaseHolder';

export const DATABASE_VERSION = 4;

export function createSchema(db: DatabaseConnection): void {
  db.executeSync(`CREATE TABLE IF NOT EXISTS update_records (
    id TEXT PRIMARY KEY, scope TEXT NOT NULL, runtime TEXT NOT NULL, time INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','ready','embedded','development')),
    manifest TEXT NOT NULL, url TEXT, headers TEXT, keep INTEGER NOT NULL DEFAULT 0,
    accessed INTEGER NOT NULL, successful INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
    launch_asset_id INTEGER, FOREIGN KEY(launch_asset_id) REFERENCES asset_records(asset_id) ON DELETE CASCADE)`);
  db.executeSync('CREATE INDEX IF NOT EXISTS update_records_launch_asset ON update_records(launch_asset_id)');
  db.executeSync('CREATE UNIQUE INDEX IF NOT EXISTS update_records_scope_time ON update_records(scope,time)');
  db.executeSync(`CREATE TABLE IF NOT EXISTS asset_records (
    asset_id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT, url TEXT, hash TEXT, type TEXT, extension TEXT,
    headers TEXT, embedded TEXT, path TEXT, digest TEXT, download_time INTEGER, marked INTEGER NOT NULL DEFAULT 0)`);
  db.executeSync('CREATE UNIQUE INDEX IF NOT EXISTS asset_records_key ON asset_records(key) WHERE key IS NOT NULL');
  db.executeSync(`CREATE TABLE IF NOT EXISTS update_asset_records (
    update_id TEXT NOT NULL, asset_id INTEGER NOT NULL, ordinal INTEGER NOT NULL,
    PRIMARY KEY(update_id,asset_id), FOREIGN KEY(update_id) REFERENCES update_records(id) ON DELETE CASCADE,
    FOREIGN KEY(asset_id) REFERENCES asset_records(asset_id) ON DELETE CASCADE)`);
  db.executeSync('CREATE INDEX IF NOT EXISTS update_asset_records_asset ON update_asset_records(asset_id)');
  db.executeSync('CREATE TABLE IF NOT EXISTS json_data (id INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,last_updated INTEGER NOT NULL)');
  db.executeSync('CREATE INDEX IF NOT EXISTS json_data_scope ON json_data(scope)');
}
function hasTable(db: DatabaseConnection, name: string): boolean {
  return readRows(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", [name], () => true).length > 0;
}

function legacyAsset(value: ESObject, launch = false): UpdateAsset {
  if (!isRecord(value) || (value.key !== null && typeof value.key !== 'string')) {
    throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'Cannot migrate an invalid asset key.');
  }

  return {
    key: value.key as string | null, launch,
    url: typeof value.url === 'string' ? value.url : '', type: typeof value.type === 'string' ? value.type : '',
    extension: typeof value.extension === 'string' ? value.extension : '', headers: isRecord(value.headers) ? value.headers : {},
    hash: typeof value.hash === 'string' ? value.hash : undefined, embedded: typeof value.embedded === 'string' ? value.embedded : undefined,
    path: typeof value.path === 'string' ? value.path : undefined, digest: typeof value.digest === 'string' ? value.digest : undefined,
  };
}

function migrateLegacy(db: DatabaseConnection, version: number): void {
  createSchema(db);
  const assets = new AssetsDao(db);
  const updates = new UpdatesDao(db, assets);
  const metadata = new JSONDataDao(db);
  if (hasTable(db, 'assets')) {
    const rows = readRows(db, 'SELECT payload FROM assets', [], row => JSON.parse(row.getString(0)));
    for (const value of rows) assets.save(legacyAsset(value));
  }

  if (hasTable(db, 'updates')) {
    const rows = readRows(db, 'SELECT payload FROM updates', [], row => JSON.parse(row.getString(0)));
    for (const value of rows) {
      if (!isRecord(value) || typeof value.id !== 'string' || typeof value.scope !== 'string'
        || typeof value.runtime !== 'string' || !Number.isSafeInteger(value.time)
        || !isRecord(value.manifest) || !Array.isArray(value.assets)) {
        throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'Cannot migrate a malformed update.');
      }
      for (const count of [value.successful, value.failed]) {
        if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) {
          throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'Cannot migrate an invalid launch count.');
        }
      }

      const linked = value.assets.map((item: ESObject, index: number) => {
        const asset = legacyAsset(item, version < 2 ? index === 0 : item?.launch === true);
        const stored = assets.get(asset.key);
        return { ...asset, id: stored?.id, path: stored?.path ?? asset.path, digest: stored?.digest ?? asset.digest };
      });
      if (linked.filter(item => item.launch).length !== 1) {
        throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'A migrated update must have one launch asset.');
      }

      const update: UpdateRecord = {
        id: value.id, scope: value.scope, runtime: value.runtime, time: value.time, status: value.status,
        manifest: value.manifest, assets: linked, url: typeof value.url === 'string' ? value.url : null,
        headers: isRecord(value.headers) ? value.headers : null,
        accessed: Number.isSafeInteger(value.accessed) ? value.accessed : value.time,
        successful: value.successful ?? 0, failed: value.failed ?? 0,
      };
      updates.insert(update);
      linked.forEach((asset, ordinal) => updates.associate(update.id, asset, ordinal));
    }
  }

  if (hasTable(db, 'metadata')) {
    const columns = readRows(db, 'PRAGMA table_info(metadata)', [], row => row.getString(1));
    const time = columns.includes('last_updated') ? 'last_updated' : '0';
    const rows = readRows(db, `SELECT scope,key,payload,${time} FROM metadata`, [], row => ({
      scope: row.getString(0), key: row.getString(1), value: JSON.parse(row.getString(2)), time: row.getLong(3),
    }));
    for (const value of rows) metadata.set(value.scope, value.key, value.value, value.time);
  }
}

function migrateV3(db: DatabaseConnection): void {
  const invalid = readRows(db, `SELECT u.id FROM update_records u LEFT JOIN update_asset_records r
    ON r.update_id=u.id AND r.launch=1 GROUP BY u.id HAVING COUNT(r.asset_key)<>1`, [], row => row.getString(0));
  if (invalid.length) throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'A v3 update does not have exactly one launch asset.');

  db.executeSync('DROP INDEX IF EXISTS update_records_scope_time');
  db.executeSync('DROP INDEX IF EXISTS update_asset_records_asset');
  db.executeSync('DROP INDEX IF EXISTS update_asset_records_launch');
  db.executeSync('ALTER TABLE asset_records RENAME TO asset_records_v3');
  db.executeSync('ALTER TABLE update_records RENAME TO update_records_v3');
  db.executeSync('ALTER TABLE update_asset_records RENAME TO update_asset_records_v3');
  db.executeSync('ALTER TABLE json_data RENAME TO json_data_v3');
  createSchema(db);
  db.executeSync('INSERT INTO json_data(scope,key,value,last_updated) SELECT scope,key,value,last_updated FROM json_data_v3');
  db.executeSync(`INSERT INTO asset_records(asset_id,key,url,hash,type,extension,headers,embedded,path,digest,download_time,marked)
    SELECT rowid,key,url,hash,type,extension,headers,embedded,path,digest,download_time,marked FROM asset_records_v3`);
  db.executeSync(`INSERT INTO update_records(id,scope,runtime,time,status,manifest,url,headers,keep,accessed,successful,failed,launch_asset_id)
    SELECT u.id,u.scope,u.runtime,u.time,u.status,u.manifest,u.url,u.headers,u.keep,u.accessed,u.successful,u.failed,
      (SELECT a.asset_id FROM asset_records a JOIN update_asset_records_v3 r ON r.asset_key=a.key WHERE r.update_id=u.id AND r.launch=1 LIMIT 1)
    FROM update_records_v3 u`);
  db.executeSync(`INSERT INTO update_asset_records(update_id,asset_id,ordinal)
    SELECT r.update_id,a.asset_id,r.ordinal FROM update_asset_records_v3 r JOIN asset_records a ON a.key=r.asset_key`);
  for (const name of ['update_records', 'asset_records', 'update_asset_records', 'json_data']) {
    const before = readRows(db, `SELECT COUNT(*) FROM ${name}_v3`, [], row => row.getLong(0))[0];
    const after = readRows(db, `SELECT COUNT(*) FROM ${name}`, [], row => row.getLong(0))[0];
    if (before !== after) throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', `v3 migration changed ${name} row count.`);
  }
}
export async function migrate(db: relationalStore.RdbStore, version: number): Promise<void> {
  await transact(db, transaction => {
    if (version === 3) migrateV3(transaction);
    else migrateLegacy(transaction, version);

    assertIntegrity(transaction);
    transaction.executeSync(`PRAGMA user_version=${DATABASE_VERSION}`);
  });
}

export function assertIntegrity(db: DatabaseConnection): void {
  if (readRows(db, 'PRAGMA foreign_key_check', [], () => true).length > 0) {
    throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'Updates database foreign key integrity check failed.');
  }
}
