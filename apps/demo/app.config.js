'use strict';

module.exports = ({ config }) => {
  const signingConfigFile = process.env.EXPO_HARMONY_SIGNING_CONFIG_FILE;
  const check = process.env.EXPO_UPDATES_CHECK_AUTOMATICALLY;
  return {
    ...config,
    runtimeVersion: process.env.EXPO_RUNTIME_VERSION ?? config.runtimeVersion,
    updates: {
      ...config.updates,
      ...(process.env.EXPO_UPDATES_URL ? { url: process.env.EXPO_UPDATES_URL } : {}),
      ...(process.env.EXPO_UPDATES_NATIVE_DEBUG === '1' ? { useNativeDebug: true } : {}),
      ...(check ? { checkAutomatically: check } : {}),
      ...(process.env.EXPO_UPDATES_CERTIFICATE ? { codeSigningCertificate: process.env.EXPO_UPDATES_CERTIFICATE } : {}),
    },
    harmony: {
      ...config.harmony,
      ...(signingConfigFile ? { signingConfigFile } : {}),
    },
  };
};
