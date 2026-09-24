import { ExpoFunction, ExpoModule, ExpoModuleContext, ExpoModuleDefinition, ExpoValueTypes } from '@expo-harmony/expo-modules-core';

import { HardwareAttestation, isHardwareAttestationSupported } from './HardwareAttestation';
import { ExpoAppIntegrityError, IntegrityErrorCode } from './ExpoAppIntegrityError';

export class ExpoAppIntegrityModule extends ExpoModule {
  private readonly hardware: HardwareAttestation;

  constructor(context: ExpoModuleContext) {
    super(context);

    this.hardware = new HardwareAttestation(context.uiAbilityContext);
  }

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoAppIntegrity')
      .constant('isSupported', false)
      .asyncFunction('generateKeyAsync', async (): Promise<string> => {
        throw new ExpoAppIntegrityError(IntegrityErrorCode.FEATURE_UNSUPPORTED, 'Apple App Attest is not available on HarmonyOS.');
      })
      .asyncFunction('attestKeyAsync', ExpoFunction.typed2(
        ExpoValueTypes.string(), ExpoValueTypes.string(),
        async (_key: string, _challenge: string): Promise<string> => {
          throw new ExpoAppIntegrityError(IntegrityErrorCode.FEATURE_UNSUPPORTED, 'Apple App Attest is not available on HarmonyOS.');
        },
      ))
      .asyncFunction('generateAssertionAsync', ExpoFunction.typed2(
        ExpoValueTypes.string(), ExpoValueTypes.string(),
        async (_key: string, _challenge: string): Promise<string> => {
          throw new ExpoAppIntegrityError(IntegrityErrorCode.FEATURE_UNSUPPORTED, 'Apple App Attest is not available on HarmonyOS.');
        },
      ))
      .asyncFunction('prepareIntegrityTokenProviderAsync', ExpoFunction.typed1(
        ExpoValueTypes.string(), async (_project: string): Promise<void> => {
          throw new ExpoAppIntegrityError(IntegrityErrorCode.API_NOT_AVAILABLE, 'Google Play Integrity is not available on HarmonyOS.');
        },
      ))
      .asyncFunction('requestIntegrityCheckAsync', ExpoFunction.typed1(
        ExpoValueTypes.string(), async (_hash: string): Promise<string> => {
          throw new ExpoAppIntegrityError(IntegrityErrorCode.API_NOT_AVAILABLE, 'Google Play Integrity is not available on HarmonyOS.');
        },
      ))
      .asyncFunction('isHardwareAttestationSupportedAsync', async (): Promise<boolean> => isHardwareAttestationSupported())
      .asyncFunction('generateHardwareAttestedKeyAsync', ExpoFunction.typed2(
        ExpoValueTypes.string(), ExpoValueTypes.string(),
        async (alias: string, challenge: string): Promise<void> => this.hardware.generate(alias, challenge),
      ))
      .asyncFunction('getAttestationCertificateChainAsync', ExpoFunction.typed1(
        ExpoValueTypes.string(), async (alias: string): Promise<string[]> => this.hardware.getCertificateChain(alias),
      ));
  }
}
