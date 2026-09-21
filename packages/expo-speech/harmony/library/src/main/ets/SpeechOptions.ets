import { ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

export class SpeechOptions {
  language?: string;
  voice?: string;
  pitch: number = 1;
  rate: number = 1;
  volume: number = 1;
}

export const SPEECH_OPTIONS = ExpoValueTypes.shapedRecord<SpeechOptions>(
  'SpeechOptions',
  new ExpoRecordShape()
    .field('language', ExpoValueTypes.string().optional())
    .field('voice', ExpoValueTypes.string().optional())
    .field('pitch', ExpoValueTypes.number().optional())
    .field('rate', ExpoValueTypes.number().optional())
    .field('volume', ExpoValueTypes.number().optional()),
  (fields: Record<string, ESObject>): SpeechOptions => {
    const options = new SpeechOptions();
    options.language = fields['language'] as string | undefined;
    options.voice = fields['voice'] as string | undefined;
    options.pitch = (fields['pitch'] as number | undefined) ?? 1;
    options.rate = (fields['rate'] as number | undefined) ?? 1;
    options.volume = (fields['volume'] as number | undefined) ?? 1;

    return options;
  },
  (options: SpeechOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};
    fields['language'] = options.language;
    fields['voice'] = options.voice;
    fields['pitch'] = options.pitch;
    fields['rate'] = options.rate;
    fields['volume'] = options.volume;

    return fields;
  },
);
