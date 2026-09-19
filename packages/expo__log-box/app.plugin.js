'use strict';

const { createRunOncePlugin } = require('@expo/config-plugins');
const { HarmonyManifest, registerHarmonyConfigPlugin, withModuleJson } = require('@expo-harmony/config-plugins');
const pkg = require('./package.json');

function withLogBox(config) {
  if (!config.harmony?.bundleName && !config.platforms?.includes('harmony')) return config;
  config = registerHarmonyConfigPlugin(config, pkg.name);

  return withModuleJson(config, (mod) => {
    const enabled = ['1', 'true'].includes(process.env.EXPO_UNSTABLE_LOG_BOX?.toLowerCase());
    HarmonyManifest.setMetadata(mod.modResults.module, {
      name: 'expo.logBox.enabled',
      value: String(enabled),
    });
    return mod;
  });
}

module.exports = createRunOncePlugin(withLogBox, pkg.name, pkg.version);
