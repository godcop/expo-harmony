import relationalStore from '@ohos.data.relationalStore';
import { isCorrupt } from './db/DatabaseError';
import type common from '@ohos.app.ability.common';
import fs from '@ohos.file.fs';
import crypto from '@ohos.security.cryptoFramework';
import util from '@ohos.util';
import { ExpoUpdatesError, Json, UpdateAsset, UpdateRecord } from './UpdatesProtocol';
import { assertIntegrity, migrate, DATABASE_VERSION } from './db/DatabaseSchema';
import { AssetsDao, UpdatesDao, JSONDataDao, DatabaseConnection } from './db/Daos';
import { DatabaseHolder } from './db/DatabaseHolder';
import { DatabaseIntegrityCheck } from './db/DatabaseIntegrityCheck';
import { Reaper } from './db/Reaper';
import { UpdatesLogger } from './logging/UpdatesLogger';

export function encode(value: string): Uint8Array { return new util.TextEncoder().encode(value); }
export function decode(value: Uint8Array): string { return new util.TextDecoder('utf-8', { fatal: true }).decodeToString(value); }
export function base64(value: Uint8Array): string { return new util.Base64Helper().encodeToStringSync(value); }
export function digest(value: Uint8Array): string {
  const hash = crypto.createMd('SHA256');
  hash.updateSync({ data: value });
  return base64(hash.digestSync().data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function exists(path: string): boolean {
  try { return fs.accessSync(path); } catch (_) { return false; }
}

export function write(file: fs.File, bytes: ArrayBuffer): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = fs.writeSync(file.fd, bytes.slice(offset));
    if (count <= 0) throw new ExpoUpdatesError('ERR_UPDATES_ASSET', 'Asset write made no progress.');
    offset += count;
  }
}

export function hashFile(path: string): string {
  const file = fs.openSync(path, fs.OpenMode.READ_ONLY);
  try {
    const hash = crypto.createMd('SHA256');
    const buffer = new ArrayBuffer(65536);
    let count: number;
    while ((count = fs.readSync(file.fd, buffer)) > 0) hash.updateSync({ data: new Uint8Array(buffer, 0, count) });

    return base64(hash.digestSync().data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } finally {
    fs.closeSync(file);
  }
}

interface Database {
  store: relationalStore.RdbStore;
  holder: DatabaseHolder;
}

export class UpdatesStorage {
  readonly directory: string;
  readonly logger: UpdatesLogger;
  private database?: Database;
  private opening?: Promise<void>;

  constructor(private readonly context: common.ApplicationContext) {
    this.directory = context.filesDir + '/expo-updates';
    this.logger = new UpdatesLogger(context);
  }

  async open(): Promise<void> {
    if (this.opening !== undefined) return this.opening;
    if (this.database !== undefined) return;

    this.opening = this.openInternal();

    try { await this.opening; } finally { this.opening = undefined; }
  }

  private async openInternal(retryAfterArchive: boolean = true): Promise<void> {
    if (!exists(this.directory)) fs.mkdirSync(this.directory, true);
    let db: relationalStore.RdbStore | undefined;

    try {
      db = await relationalStore.getRdbStore(this.context, { name: 'expo-updates.db', securityLevel: relationalStore.SecurityLevel.S1 });
      if (db.version > DATABASE_VERSION) throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', `Unsupported Updates database version ${db.version}.`);

      db.executeSync('PRAGMA foreign_keys = ON');
      if (db.version < DATABASE_VERSION) await migrate(db, db.version);
      else assertIntegrity(db);

      const holder = new DatabaseHolder(db);
      this.database = { store: db, holder };
    } catch (error) {
      this.database = undefined;
      if (db !== undefined) {
        try { await db.close(); } catch (failure) { console.error(`Unable to close Updates database: ${String(failure)}`); }
      }
      const databasePath = this.context.databaseDir + '/rdb/expo-updates.db';
      if (retryAfterArchive && isCorrupt(error) && exists(databasePath)) {
        try {
          const archive = databasePath + '.corrupt-' + Date.now();
          fs.renameSync(databasePath, archive);
          for (const suffix of ['-wal', '-shm']) if (exists(databasePath + suffix)) fs.renameSync(databasePath + suffix, archive + suffix);
          console.warn(`[ExpoUpdates] Archived unusable database at ${archive}`);

          return this.openInternal(false);
        } catch (archiveError) { console.error(`[ExpoUpdates] Unable to archive unusable database: ${String(archiveError)}`); }
      }
      throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', `Unable to open Updates database: ${String(error)}`, error instanceof Error ? error : undefined);
    }

    for (const file of fs.listFileSync(this.directory)) {
      if (!file.endsWith('.tmp')) continue;
      try { fs.unlinkSync(this.directory + '/' + file); }
      catch (error) { this.logger.log(`Unable to remove temporary file: ${String(error)}`, 'Unknown', 'warn'); }
    }
  }

  private get db(): Database {
    if (this.database === undefined) throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'Updates database is not open.');
    return this.database;
  }

  private async read<T>(body: (assets: AssetsDao, updates: UpdatesDao, metadata: JSONDataDao) => T): Promise<T> {
    return this.db.holder.withDatabase(connection => {
      const assets = new AssetsDao(connection);
      return body(assets, new UpdatesDao(connection, assets), new JSONDataDao(connection));
    });
  }
  private async write<T>(body: (assets: AssetsDao, updates: UpdatesDao, metadata: JSONDataDao) => T): Promise<T> {
    return this.db.holder.transaction(connection => {
      const assets = new AssetsDao(connection);
      return body(assets, new UpdatesDao(connection, assets), new JSONDataDao(connection));
    });
  }

  updates(scope?: string): Promise<UpdateRecord[]> { return this.read((_a, updates) => updates.all(scope)); }
  update(id: string): Promise<UpdateRecord | undefined> { return this.read((_a, updates) => updates.get(id)); }
  failed(): Promise<UpdateRecord[]> { return this.read((_a, updates) => updates.failed()); }
  launchable(scope: string): Promise<UpdateRecord[]> { return this.read((_a, updates) => updates.launchable(scope)); }

  async insert(update: UpdateRecord): Promise<void> {
    if (update.assets.filter(asset => asset.launch).length !== 1) throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', 'An update must have exactly one launch asset.');
    const ids = await this.write((_a, updates) => {
      const stored = updates.get(update.id);
      if (stored) {
        if (stored.scope !== update.scope) updates.setScope(update.id, update.scope);
        return undefined;
      }
      updates.insert(update);

      return update.assets.map((asset, ordinal) => updates.associate(update.id, asset, ordinal));
    });
    ids?.forEach((id, index) => { update.assets[index].id = id; });
  }

  setStatus(id: string, status: UpdateRecord['status']): Promise<void> { return this.write((_a, updates) => updates.setStatus(id, status)); }
  markFinished(id: string): Promise<void> { return this.write((_a, updates) => updates.markFinished(id)); }
  markAccessed(id: string, time: number = Date.now()): Promise<void> { return this.write((_a, updates) => updates.markAccessed(id, time)); }
  incrementSuccessful(id: string): Promise<void> { return this.write((_a, updates) => updates.incrementSuccessful(id)); }
  incrementFailed(id: string): Promise<void> { return this.write((_a, updates) => updates.incrementFailed(id)); }
  async associate(updateId: string, asset: UpdateAsset, ordinal: number): Promise<void> {
    asset.id = await this.write((_a, updates) => updates.associate(updateId, asset, ordinal));
  }

  async setCommitTime(update: UpdateRecord, time: number): Promise<void> {
    await this.write((_a, updates) => updates.setCommitTime(update.id, time));
    update.time = time;
  }

  async asset(asset: UpdateAsset): Promise<UpdateAsset | undefined> {
    const stored = await this.read(assets => (asset.id === undefined ? undefined : assets.getById(asset.id)) ?? assets.get(asset.key));
    return stored === undefined ? undefined : { ...stored, launch: asset.launch };
  }

  async save(asset: UpdateAsset): Promise<void> {
    if (!asset.path || !asset.digest) throw new ExpoUpdatesError('ERR_UPDATES_ASSET', 'Cannot persist an incomplete asset.');
    asset.id = await this.write(assets => assets.save(asset));
  }

  async metadata(scope: string, key: string): Promise<ESObject> {
    return (await this.read((_a, _u, metadata) => metadata.get(scope, key)))?.value ?? null;
  }

  async setMetadata(scope: string, key: string, value: ESObject): Promise<void> {
    await this.write((_a, _u, metadata) => metadata.set(scope, key, value));
  }

  updateMetadata(scope: string, key: string, body: (value: ESObject) => ESObject): Promise<ESObject> {
    return this.write((_a, _u, metadata) => metadata.update(scope, key, body));
  }

  consumeMetadata(scope: string, key: string): Promise<ESObject> {
    return this.write((_a, _u, metadata) => metadata.consume(scope, key));
  }

  async setResponseMetadata(scope: string, headers?: Json, filters?: Json): Promise<void> {
    if (headers === undefined && filters === undefined) return;
    await this.write((_a, _u, metadata) => {
      if (headers !== undefined) metadata.set(scope, 'headers', headers);
      if (filters !== undefined) metadata.set(scope, 'filters', filters);
    });
  }

  integrity(embedded?: string): Promise<void> {
    return this.db.holder.transaction(db => new DatabaseIntegrityCheck(exists).run(db, embedded));
  }

  delete(records: UpdateRecord[]): Promise<void> {
    return new Reaper(this.db.holder, path => { if (exists(path)) fs.unlinkSync(path); },
      (message, asset) => this.logger.log(message, 'Unknown', 'warn', undefined, asset)).run(records);
  }

}
