'use strict';

const React = require('react');
const ReactNative = require('react-native');

const EXPO_VIEW_COMPONENT_NAME = 'ViewManagerAdapter_ExpoModulesCore';
const nativeComponentsCache = new Map();
const propsRevisions = new WeakMap();
let nextPropsRevision = 1;

function getExpoGlobal() {
  return globalThis.expo;
}

function expoLogicalComponentName(moduleName, viewName) {
  return viewName
    ? `ViewManagerAdapter_${moduleName}_${viewName}`
    : `ViewManagerAdapter_${moduleName}`;
}

function expoViewPropsRevision(props) {
  const existing = propsRevisions.get(props);
  if (existing !== undefined) return existing;

  if (!Number.isSafeInteger(nextPropsRevision)) {
    throw new Error('Expo View props revision identity space was exhausted.');
  }

  const revision = nextPropsRevision;
  nextPropsRevision += 1;
  propsRevisions.set(props, revision);

  return revision;
}

function ensureNativeModulesAreInstalled() {
  if (getExpoGlobal()) return;

  const core = ReactNative.TurboModuleRegistry.get('ExpoModulesCore');
  if (!core || typeof core.installModules !== 'function') {
    throw new Error('Unable to install Expo modules: ExpoModulesCore.installModules() is unavailable.');
  }

  try {
    core.installModules();
  } catch (error) {
    throw new Error(`Unable to install Expo modules: ${error}`);
  }

  if (!getExpoGlobal()) {
    throw new Error('Unable to install Expo modules: the native installer did not create globalThis.expo.');
  }
}

function requireExpoViewComponent(moduleName, viewName) {
  const name = expoLogicalComponentName(moduleName, viewName);
  const appId = getExpoGlobal()?.__expo_app_identifier__ ?? '';
  const key = appId ? `${name}_${appId}` : name;
  const cached = nativeComponentsCache.get(key);
  if (cached) return cached;

  const component = ReactNative.registerViewConfig(key, () => {
    const config = getExpoGlobal()?.getViewConfig?.(moduleName, viewName);
    if (!config) {
      throw new Error(`Unable to get the view config for ${viewName ?? 'default view'} from module ${moduleName}.`);
    }

    // registerViewConfig expects a complete config. Reuse RNOH's View props and
    // events, including the processors in its exported style attribute table.
    const baseConfig = ReactNative.UIManager.getViewManagerConfig('RCTView');
    if (!baseConfig) {
      throw new Error('Unable to get the RNOH RCTView config for Expo views.');
    }
    const constants = ReactNative.UIManager.getConstants();
    // RNOH 0.84 exports the module namespace rather than its default value.
    const viewAttributes = ReactNative.ReactNativeViewAttributes.default.RCTView;
    const validAttributes = { ...viewAttributes.style, ...viewAttributes };
    for (const prop of Object.keys(baseConfig.NativeProps)) {
      validAttributes[prop] ??= true;
    }

    return {
      ...config,
      uiViewClassName: EXPO_VIEW_COMPONENT_NAME,
      Commands: {},
      bubblingEventTypes: {
        ...constants.genericBubblingEventTypes,
        ...baseConfig.bubblingEventTypes,
        ...config.bubblingEventTypes,
      },
      directEventTypes: {
        ...constants.genericDirectEventTypes,
        ...baseConfig.directEventTypes,
        ...config.directEventTypes,
      },
      validAttributes: {
        ...validAttributes,
        ...config.validAttributes,
        expoModuleName: true,
        expoViewRevision: true,
        expoViewName: true,
      },
    };
  });

  nativeComponentsCache.set(key, component);

  return component;
}

function requireNativeViewManager(moduleName, viewName) {
  ensureNativeModulesAreInstalled();

  const ReactNativeComponent = requireExpoViewComponent(moduleName, viewName);

  class NativeComponent extends React.PureComponent {
    static displayName = viewName ?? moduleName;

    nativeRef = React.createRef();
    nativeTag = null;
    committedPropsRevision = 0;
    nativeComponentName = expoLogicalComponentName(moduleName, viewName);

    get nativePropsRevision() {
      return this.committedPropsRevision;
    }

    componentDidMount() {
      this.committedPropsRevision = propsRevisions.get(this.props) ?? this.committedPropsRevision;
      this.nativeTag = ReactNative.findNodeHandle(this.nativeRef.current);
    }

    componentDidUpdate() {
      this.committedPropsRevision = propsRevisions.get(this.props) ?? this.committedPropsRevision;
    }

    componentWillUnmount() {
      this.nativeTag = null;
    }

    render() {
      return React.createElement(ReactNativeComponent, {
        ...this.props,
        expoModuleName: moduleName,
        expoViewRevision: expoViewPropsRevision(this.props),
        expoViewName: viewName ?? '',
        ref: this.nativeRef,
      });
    }
  }

  const nativeModule = getExpoGlobal()?.modules?.[moduleName];
  const prototypeName = viewName ? `${moduleName}_${viewName}` : moduleName;
  const nativeViewPrototype = nativeModule?.ViewPrototypes?.[prototypeName];
  if (nativeViewPrototype) {
    Object.assign(NativeComponent.prototype, nativeViewPrototype);
  }

  return NativeComponent;
}

exports.requireNativeViewManager = requireNativeViewManager;
