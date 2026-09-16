import { ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

export class DocumentPickerOptions {
  type: string[] = ['*/*'];
  copyToCacheDirectory: boolean = true;
  multiple: boolean = false;
}

export const DOCUMENT_PICKER_OPTIONS = ExpoValueTypes.shapedRecord<DocumentPickerOptions>(
  'DocumentPickerOptions',
  new ExpoRecordShape()
    .field('type', ExpoValueTypes.array(ExpoValueTypes.string()), { required: true })
    .field('copyToCacheDirectory', ExpoValueTypes.boolean(), { required: true })
    .field('multiple', ExpoValueTypes.boolean(), { required: true }),
  (fields: Record<string, ESObject>): DocumentPickerOptions => {
    const options = new DocumentPickerOptions();
    options.type = fields['type'] as string[];
    options.copyToCacheDirectory = fields['copyToCacheDirectory'] as boolean;
    options.multiple = fields['multiple'] as boolean;

    return options;
  },
  (options: DocumentPickerOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields['type'] = options.type;
    fields['copyToCacheDirectory'] = options.copyToCacheDirectory;
    fields['multiple'] = options.multiple;

    return fields;
  },
);
