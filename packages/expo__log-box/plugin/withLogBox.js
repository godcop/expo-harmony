'use strict';

const path = require('node:path');

/** Keep Expo's inspector/parser; adapt only its DOM host on Harmony. */
function withLogBox(config) {
  const resolve = config.resolver?.resolveRequest;
  const root = path.dirname(require.resolve('@expo/log-box/package.json'));
  const inspector = path.join(root, 'swap-rn-logbox.js');
  const parser = path.join(root, 'swap-rn-logbox-parser.js');
  const nativeInspector = path.join(root, 'src/logbox-rn-polyfill.tsx');
  const dom = path.join(root, 'src/logbox-dom-polyfill.tsx');
  const enabled = ['1', 'true'].includes(process.env.EXPO_UNSTABLE_LOG_BOX?.toLowerCase());

  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest: Object.assign(function resolveRequest(context, name, platform) {
        const result = (resolve ?? context.resolveRequest)(context, name, platform);
        if (platform !== 'harmony' || !enabled || result.type !== 'sourceFile') return result;

        if (result.filePath.endsWith('/Libraries/LogBox/LogBoxInspectorContainer.js')) {
          return { type: 'sourceFile', filePath: inspector };
        }
        if (result.filePath.endsWith('/Libraries/LogBox/Data/parseLogBoxLog.js')) {
          return { type: 'sourceFile', filePath: parser };
        }
        if (context.originModulePath === nativeInspector && result.filePath === dom) {
          return { type: 'sourceFile', filePath: path.join(__dirname, '../src/LogBoxDOMView.tsx') };
        }
        return result;
      }, { harmonyRuntime: resolve?.harmonyRuntime }),
    },
  };
}

module.exports = { withLogBox };
