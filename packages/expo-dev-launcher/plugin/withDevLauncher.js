'use strict';

const { createRunOncePlugin } = require('@expo/config-plugins');
const {
  HarmonyManifest,
  registerHarmonyConfigPlugin,
  withModuleJson,
} = require('@expo-harmony/config-plugins');

const pkg = require('../package.json');

const INTERNET_PERMISSION = 'ohos.permission.INTERNET';
const NETWORK_INFO_PERMISSION = 'ohos.permission.GET_NETWORK_INFO';
const LAUNCH_MODE_METADATA = 'expo.devLauncher.launchMode';
const TOOLS_BUTTON_METADATA = 'EXDevMenuShowFloatingActionButton';
const DEEP_LINK_SCHEME = 'expo-harmony';
const DEEP_LINK_HOST = 'open';
const VIEW_ACTION = 'ohos.want.action.viewData';
const BROWSABLE_ENTITY = 'entity.system.browsable';

function launchMode(options) {
  const value = options.launchMode ?? options.launchModeExperimental ?? 'most-recent';
  if (value !== 'most-recent' && value !== 'launcher') {
    throw new TypeError('expo-dev-launcher launchMode must be \'most-recent\' or \'launcher\'.');
  }
  return value;
}

function selectedAbility(module) {
  const name = module.mainElement;
  return Array.isArray(module.abilities)
    ? module.abilities.find((ability, index) => ability?.name === name || (!name && index === 0))
    : undefined;
}

function isLauncherSkill(skill) {
  return Array.isArray(skill?.entities) && skill.entities.length === 1 && skill.entities[0] === BROWSABLE_ENTITY
    && Array.isArray(skill?.actions) && skill.actions.length === 1 && skill.actions[0] === VIEW_ACTION
    && Array.isArray(skill?.uris) && skill.uris.length === 1
    && skill.uris[0]?.scheme === DEEP_LINK_SCHEME && skill.uris[0]?.host === DEEP_LINK_HOST;
}

function updateManifest(json, options = {}) {
  const module = json.module;
  if (!module || typeof module !== 'object') throw new TypeError('expo-dev-launcher requires a Harmony module manifest.');

  const ability = selectedAbility(module);
  if (!ability) throw new TypeError('expo-dev-launcher requires an entry UIAbility.');

  const target = { metadata: module.metadata };
  HarmonyManifest.setMetadata(target, { name: LAUNCH_MODE_METADATA, value: launchMode(options) });
  if (typeof options.toolsButton === 'boolean') {
    HarmonyManifest.setMetadata(target, { name: TOOLS_BUTTON_METADATA, value: String(options.toolsButton) });
  }

  const permissions = Array.isArray(module.requestPermissions) ? module.requestPermissions : [];
  const managedPermissions = new Set([INTERNET_PERMISSION, NETWORK_INFO_PERMISSION]);
  const requestPermissions = [
    ...permissions.filter(permission => !managedPermissions.has(permission?.name)),
    permissions.find(permission => permission?.name === INTERNET_PERMISSION) ?? { name: INTERNET_PERMISSION },
    permissions.find(permission => permission?.name === NETWORK_INFO_PERMISSION) ?? { name: NETWORK_INFO_PERMISSION },
  ];
  const skills = Array.isArray(ability.skills) ? ability.skills : [];
  const launcherSkill = {
    entities: [BROWSABLE_ENTITY],
    actions: [VIEW_ACTION],
    uris: [{ scheme: DEEP_LINK_SCHEME, host: DEEP_LINK_HOST }],
  };
  const abilities = module.abilities.map(item => item === ability
    ? { ...item, skills: [...skills.filter(skill => !isLauncherSkill(skill)), launcherSkill] }
    : item);

  return { ...json, module: { ...module, metadata: target.metadata, requestPermissions, abilities } };
}

function withHarmonyDevLauncher(config, options = {}) {
  const enabled = config.harmony?.bundleName || config.platforms?.includes('harmony');
  if (!enabled) return config;

  config = registerHarmonyConfigPlugin(config, pkg.name);
  config = withModuleJson(config, (mod) => {
    mod.modResults = updateManifest(mod.modResults, options);
    return mod;
  });

  return config;
}

module.exports = createRunOncePlugin(withHarmonyDevLauncher, pkg.name, pkg.version);
