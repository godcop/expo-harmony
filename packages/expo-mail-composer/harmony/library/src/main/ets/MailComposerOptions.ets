import { ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

export class MailComposerOptions {
  recipients: string[] = [];
  ccRecipients: string[] = [];
  bccRecipients: string[] = [];
  subject?: string;
  body?: string;
  isHtml: boolean = false;
  attachments: string[] = [];
}

const OPTIONAL_STRINGS = ExpoValueTypes.array(ExpoValueTypes.string()).nullable().optional();
const OPTIONAL_STRING = ExpoValueTypes.string().nullable().optional();

export const MAIL_COMPOSER_OPTIONS = ExpoValueTypes.shapedRecord<MailComposerOptions>(
  'MailComposerOptions',
  new ExpoRecordShape()
    .field('recipients', OPTIONAL_STRINGS)
    .field('ccRecipients', OPTIONAL_STRINGS)
    .field('bccRecipients', OPTIONAL_STRINGS)
    .field('subject', OPTIONAL_STRING)
    .field('body', OPTIONAL_STRING)
    .field('isHtml', ExpoValueTypes.boolean().nullable().optional())
    .field('attachments', OPTIONAL_STRINGS),
  (fields: Record<string, ESObject>): MailComposerOptions => ({
    recipients: fields.recipients ?? [],
    ccRecipients: fields.ccRecipients ?? [],
    bccRecipients: fields.bccRecipients ?? [],
    subject: fields.subject ?? undefined,
    body: fields.body ?? undefined,
    isHtml: fields.isHtml ?? false,
    attachments: fields.attachments ?? [],
  }),
  (options: MailComposerOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};

    fields.recipients = options.recipients;
    fields.ccRecipients = options.ccRecipients;
    fields.bccRecipients = options.bccRecipients;
    fields.subject = options.subject;
    fields.body = options.body;
    fields.isHtml = options.isHtml;
    fields.attachments = options.attachments;

    return fields;
  },
);
