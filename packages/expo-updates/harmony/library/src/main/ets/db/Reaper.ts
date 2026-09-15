import { UpdateRecord } from '../UpdatesProtocol';
import { AssetsDao, UpdatesDao } from './Daos';
import { DatabaseHolder, transact } from './DatabaseHolder';

const deletionAttempts = 2;

export class Reaper {
  constructor(private readonly holder: DatabaseHolder, private readonly remove: (path: string) => void,
    private readonly log: (message: string, asset?: string) => void) {}

  run(records: UpdateRecord[]): Promise<void> {
    return this.holder.withDatabase(async store => {
      const unused = await transact(store, db => {
        const assets = new AssetsDao(db);
        const updates = new UpdatesDao(db, assets);
        for (const update of records) updates.delete(update.id);
        assets.markUnused();

        return assets.marked();
      });

      const removed: number[] = [];
      for (const asset of unused) {
        for (let attempt = 0; attempt < deletionAttempts; attempt++) {
          try {
            if (asset.path) this.remove(asset.path);
            removed.push(asset.id);
            break;
          } catch (error) {
            if (attempt + 1 === deletionAttempts) this.log(`Unable to remove unused asset: ${String(error)}`, asset.key ?? undefined);
          }
        }
      }

      await transact(store, db => {
        const assets = new AssetsDao(db);
        for (const id of removed) assets.deleteMarked(id);
      });
    });
  }
}
