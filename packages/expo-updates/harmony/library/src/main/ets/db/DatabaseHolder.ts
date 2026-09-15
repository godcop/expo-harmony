import relationalStore from '@ohos.data.relationalStore';
import { ExpoUpdatesError } from '../UpdatesProtocol';
import type { DatabaseConnection } from './Daos';

export async function transact<T>(store: relationalStore.RdbStore, body: (db: DatabaseConnection) => T): Promise<T> {
  const transaction = await store.createTransaction();
  try {
    const result = body(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    try { await transaction.rollback(); }
    catch (failure) { console.error(`Unable to roll back Updates transaction: ${String(failure)}`); }
    throw new ExpoUpdatesError('ERR_UPDATES_DATABASE', String(error), error instanceof Error ? error : undefined);
  }
}

export class DatabaseHolder {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly store: relationalStore.RdbStore) {}

  withDatabase<T>(body: (db: relationalStore.RdbStore) => T | Promise<T>): Promise<T> {
    const run = this.tail.then(() => body(this.store));
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }

  transaction<T>(body: (db: DatabaseConnection) => T): Promise<T> {
    return this.withDatabase(store => transact(store, body));
  }
}
