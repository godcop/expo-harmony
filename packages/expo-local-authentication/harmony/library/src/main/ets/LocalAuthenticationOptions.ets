import { ExpoRecordShape, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

export enum BiometricsSecurityLevel {
  WEAK = 'weak',
  STRONG = 'strong',
}

export class LocalAuthenticationOptions {
  promptMessage: string = 'Authenticate';
  cancelLabel: string = 'Cancel';
  disableDeviceFallback: boolean = false;
  biometricsSecurityLevel: BiometricsSecurityLevel = BiometricsSecurityLevel.WEAK;
}

export const LOCAL_AUTHENTICATION_OPTIONS = ExpoValueTypes.shapedRecord<LocalAuthenticationOptions>(
  'LocalAuthenticationOptions',
  new ExpoRecordShape()
    .field('promptMessage', ExpoValueTypes.string().optional())
    .field('cancelLabel', ExpoValueTypes.string().optional())
    .field('disableDeviceFallback', ExpoValueTypes.boolean().optional())
    .field('biometricsSecurityLevel', ExpoValueTypes.enumerable<BiometricsSecurityLevel>('BiometricsSecurityLevel', {
      weak: BiometricsSecurityLevel.WEAK,
      strong: BiometricsSecurityLevel.STRONG,
    }).optional()),
  (fields: Record<string, ESObject>): LocalAuthenticationOptions => {
    const options = new LocalAuthenticationOptions();

    options.promptMessage = (fields['promptMessage'] as string | undefined) ?? options.promptMessage;
    options.cancelLabel = (fields['cancelLabel'] as string | undefined) ?? options.cancelLabel;
    options.disableDeviceFallback = (fields['disableDeviceFallback'] as boolean | undefined) ?? options.disableDeviceFallback;
    options.biometricsSecurityLevel = (fields['biometricsSecurityLevel'] as BiometricsSecurityLevel | undefined) ?? options.biometricsSecurityLevel;

    return options;
  },
  (options: LocalAuthenticationOptions): Record<string, ESObject> => {
    const fields: Record<string, ESObject> = {};

    fields['promptMessage'] = options.promptMessage;
    fields['cancelLabel'] = options.cancelLabel;
    fields['disableDeviceFallback'] = options.disableDeviceFallback;
    fields['biometricsSecurityLevel'] = options.biometricsSecurityLevel;

    return fields;
  },
);
