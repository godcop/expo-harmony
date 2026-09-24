import ExpoAppIntegrity from './ExpoAppIntegrity';

export const isSupported = ExpoAppIntegrity.isSupported;
export const generateKeyAsync = ExpoAppIntegrity.generateKeyAsync.bind(ExpoAppIntegrity);
export const attestKeyAsync = ExpoAppIntegrity.attestKeyAsync.bind(ExpoAppIntegrity);
export const generateAssertionAsync = ExpoAppIntegrity.generateAssertionAsync.bind(ExpoAppIntegrity);
export const prepareIntegrityTokenProviderAsync
  = ExpoAppIntegrity.prepareIntegrityTokenProviderAsync.bind(ExpoAppIntegrity);
export const requestIntegrityCheckAsync = ExpoAppIntegrity.requestIntegrityCheckAsync.bind(ExpoAppIntegrity);
export const isHardwareAttestationSupportedAsync
  = ExpoAppIntegrity.isHardwareAttestationSupportedAsync.bind(ExpoAppIntegrity);
export const generateHardwareAttestedKeyAsync
  = ExpoAppIntegrity.generateHardwareAttestedKeyAsync.bind(ExpoAppIntegrity);
export const getAttestationCertificateChainAsync
  = ExpoAppIntegrity.getAttestationCertificateChainAsync.bind(ExpoAppIntegrity);
