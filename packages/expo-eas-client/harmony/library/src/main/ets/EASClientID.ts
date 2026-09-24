/// <reference path="./EASClient.d.ts" />

import preferences from '@ohos.data.preferences';
import type common from '@ohos.app.ability.common';
import util from '@ohos.util';
import client from 'libexpo_eas_client.so';

const name = 'expo-eas-client';
const key = 'clientID';
const filename = 'expo-eas-client.id';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maximum = Number(BigInt('0xffffffffffffffff'));

type Migration = (context: common.ApplicationContext) => string | undefined;

export class EASClientID {
  private static migration?: Migration;
  private readonly path: string;

  constructor(private readonly context: common.ApplicationContext) {
    this.path = `${context.filesDir}/${filename}`;
  }

  static registerMigration(migration: Migration): void {
    EASClientID.migration = migration;
  }

  get clientID(): string {
    const existing = client.clientID(this.path);
    if (existing !== undefined) return existing;

    // Drop cached values that may predate another ExtensionAbility's flush.
    preferences.removePreferencesFromCacheSync(this.context, { name });
    const store = preferences.getPreferencesSync(this.context, { name });

    let candidate: string;
    if (store.hasSync(key)) {
      const value = store.getSync(key, '');

      if (typeof value !== 'string' || !uuid.test(value)) throw new Error('The persisted EAS client ID is invalid.');

      candidate = value;
    } else {
      candidate = EASClientID.migration?.(this.context) ?? util.generateRandomUUID();

      if (!uuid.test(candidate)) throw new Error('The EAS client ID must be a valid UUID.');
    }

    return client.clientID(this.path, candidate);
  }

  get deterministicUniformValue(): number {
    // Match upstream's unsigned, big-endian interpretation of UUID bytes 8–15.
    const hex = this.clientID.replace(/-/g, '').slice(16);
    return Number(BigInt('0x' + hex)) / maximum;
  }
}
