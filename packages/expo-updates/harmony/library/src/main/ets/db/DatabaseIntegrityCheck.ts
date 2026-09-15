import { UpdatesDao, AssetsDao, DatabaseConnection } from './Daos';

export class DatabaseIntegrityCheck {
  constructor(private readonly exists: (path: string) => boolean) {}

  run(db: DatabaseConnection, embedded?: string): void {
    const assets = new AssetsDao(db);
    const updates = new UpdatesDao(db, assets);
    for (const update of updates.all()) {
      if (update.status === 'embedded' && update.id !== embedded) updates.delete(update.id);
    }

    const missing = assets.all().filter(asset => !asset.path || !this.exists(asset.path));
    updates.markMissing(missing.map(asset => asset.id));
  }
}
