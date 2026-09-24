import { ExpoModuleError, ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import type { BindValue } from 'libexpo_sqlite.so';

export class OpenOptions {
  libSQLUrl: string | null = null;
  libSQLAuthToken: string | null = null;
  libSQLRemoteOnly: boolean = false;
  enableChangeListener: boolean = false;
  useNewConnection: boolean = false;
  finalizeUnusedStatementsBeforeClosing: boolean = true;
}

export const OPEN_OPTIONS = ExpoValueTypes.shapedRecord<OpenOptions>(
  'SQLiteOpenOptions',
  new ExpoRecordShape()
    .field('enableChangeListener', ExpoValueTypes.boolean().optional())
    .field('useNewConnection', ExpoValueTypes.boolean().optional())
    .field('finalizeUnusedStatementsBeforeClosing', ExpoValueTypes.boolean().optional())
    .field('libSQLUrl', ExpoValueTypes.string().nullable().optional())
    .field('libSQLAuthToken', ExpoValueTypes.string().nullable().optional())
    .field('libSQLRemoteOnly', ExpoValueTypes.boolean().optional()),
  (fields: Record<string, ESObject>): OpenOptions => {
    const options = new OpenOptions();
    options.enableChangeListener = (fields['enableChangeListener'] as boolean | undefined) ?? false;
    options.useNewConnection = (fields['useNewConnection'] as boolean | undefined) ?? false;
    options.finalizeUnusedStatementsBeforeClosing = (fields['finalizeUnusedStatementsBeforeClosing'] as boolean | undefined) ?? true;
    options.libSQLUrl = (fields['libSQLUrl'] as string | null | undefined) ?? null;
    options.libSQLAuthToken = (fields['libSQLAuthToken'] as string | null | undefined) ?? null;
    options.libSQLRemoteOnly = (fields['libSQLRemoteOnly'] as boolean | undefined) ?? false;

    return options;
  },
  (options: OpenOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields['enableChangeListener'] = options.enableChangeListener;
    fields['useNewConnection'] = options.useNewConnection;
    fields['finalizeUnusedStatementsBeforeClosing'] = options.finalizeUnusedStatementsBeforeClosing;
    fields['libSQLUrl'] = options.libSQLUrl;
    fields['libSQLAuthToken'] = options.libSQLAuthToken;
    fields['libSQLRemoteOnly'] = options.libSQLRemoteOnly;

    return fields;
  },
);

export const BIND_VALUE = ExpoValueTypes.custom<BindValue>(
  'SQLite bind primitive',
  (value: ESObject): BindValue => {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value as BindValue;
    }

    throw new ExpoModuleError('ERR_INVALID_BIND_PARAMETER', 'Expected a string, number, boolean or null bind value.');
  },
  (value: BindValue): ESObject => value,
);
