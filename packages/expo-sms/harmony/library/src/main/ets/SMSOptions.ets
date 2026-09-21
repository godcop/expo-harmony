import { ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

const SMS_ATTACHMENT = ExpoValueTypes.shapedRecord<Record<string, ESObject>>(
  'SMSAttachment',
  new ExpoRecordShape()
    .field('uri', ExpoValueTypes.string(), { required: true })
    .field('mimeType', ExpoValueTypes.string(), { required: true })
    .field('filename', ExpoValueTypes.string(), { required: true }),
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
);

export const SMS_OPTIONS = ExpoValueTypes.shapedRecord<Record<string, ESObject>>(
  'SMSOptions',
  new ExpoRecordShape().field('attachments', ExpoValueTypes.array(SMS_ATTACHMENT).optional()),
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
  (fields: Record<string, ESObject>): Record<string, ESObject> => fields,
);
