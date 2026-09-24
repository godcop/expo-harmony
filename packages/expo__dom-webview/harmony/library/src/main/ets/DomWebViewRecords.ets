import { ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

export const SOURCE = ExpoValueTypes.shapedRecord<Record<string, ESObject>>(
  'DomWebViewSource',
  new ExpoRecordShape().field('uri', ExpoValueTypes.string().nullable().optional()),
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
);

export const SCROLL_TO = ExpoValueTypes.shapedRecord<Record<string, ESObject>>(
  'ScrollToParam',
  new ExpoRecordShape()
    .field('x', ExpoValueTypes.number().optional())
    .field('y', ExpoValueTypes.number().optional())
    .field('animated', ExpoValueTypes.boolean().optional()),
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
);
