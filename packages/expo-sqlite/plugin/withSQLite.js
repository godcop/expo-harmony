const { createRunOncePlugin } = require('@expo-harmony/config-plugins');
const plugin = require('expo-sqlite/app.plugin.js');
const upstream = plugin.default ?? plugin;
const pkg = require('../package.json');
const defaults = require('../harmony/sqlite-options.json');

function withSQLite(config, props = {}) {
  config = upstream(config, props);

  if (!config.harmony?.bundleName && !config.platforms?.includes('harmony')) return config;
  if (props?.harmony != null && (typeof props.harmony !== 'object' || Array.isArray(props.harmony))) {
    throw new TypeError('expo-sqlite harmony options must be an object.');
  }

  const options = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = props?.harmony?.[key] ?? props?.[key] ?? fallback;
    if (typeof value !== typeof fallback) throw new TypeError(`expo-sqlite ${key} must be ${typeof fallback}.`);

    options[key] = value;
  }

  for (const key of Object.keys(props?.harmony || {})) {
    if (!Object.hasOwn(defaults, key)) throw new TypeError(`Unknown expo-sqlite Harmony option: ${key}`);
  }

  if (options.useLibSQL && (options.useSQLCipher || options.withSQLiteVecExtension)) {
    throw new Error('expo-sqlite useLibSQL cannot be combined with useSQLCipher or withSQLiteVecExtension.');
  }

  if (Object.keys(defaults).some(key => options[key] !== defaults[key])) {
    config.harmony = { ...config.harmony, moduleBuilds: { ...config.harmony?.moduleBuilds, [pkg.name]: options } };
  }

  return config;
}

module.exports = createRunOncePlugin(withSQLite, pkg.name, pkg.version);
