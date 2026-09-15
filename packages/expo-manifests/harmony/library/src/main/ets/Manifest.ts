export class ExpoManifestError extends Error {
  readonly code = 'ERR_MANIFEST_INVALID';

  constructor(message: string) {
    super(message);
    this.name = 'ExpoManifestError';
  }
}

function isRecord(value: unknown): value is Record<string, ESObject> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneValue(value: ESObject, depth: number = 0): ESObject {
  if (depth > 64) throw new ExpoManifestError('Plugin properties exceed the maximum JSON nesting depth.');
  if (Array.isArray(value)) return value.map(item => cloneValue(item, depth + 1));
  if (!isRecord(value)) return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item, depth + 1)]));
}

type FieldType = 'object' | 'array' | 'string' | 'boolean';

function hasOwn(value: Record<string, ESObject>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export abstract class Manifest {
  protected readonly json: Record<string, ESObject>;

  constructor(value: unknown) {
    if (!isRecord(value)) throw new ExpoManifestError('A manifest must be a JSON object.');
    this.json = value;
  }

  static fromManifestJson(value: unknown): Manifest {
    if (!isRecord(value)) throw new ExpoManifestError('A manifest must be a JSON object.');
    if (hasOwn(value, 'releaseId')) throw new ExpoManifestError('Legacy manifests are no longer supported.');

    return hasOwn(value, 'metadata') ? new ExpoUpdatesManifest(value) : new EmbeddedManifest(value);
  }

  getRawJson(): Record<string, ESObject> { return this.json; }
  toString(): string { return JSON.stringify(this.json); }
  getID(): string { return this.string(this.json, 'id'); }
  getLegacyID(): string { return this.getID(); }
  getMetadata(): Record<string, ESObject> | null { return this.value(this.json, 'metadata', 'object'); }
  getAssets(): ESObject[] | null { return this.value(this.json, 'assets', 'array'); }
  isVerified(): boolean { return this.value(this.json, 'isVerified', 'boolean') ?? false; }
  abstract getStableLegacyID(): string | null;
  abstract getScopeKey(): string;
  abstract getEASProjectID(): string | null;
  abstract getBundleURL(): string;
  abstract getExpoGoSDKVersion(): string | null;
  abstract getExpoGoConfigRootObject(): Record<string, ESObject> | null;
  abstract getExpoClientConfigRootObject(): Record<string, ESObject> | null;
  abstract getSlug(): string | null;
  abstract getAppKey(): string | null;

  isDevelopmentMode(): boolean {
    const config = this.getExpoGoConfigRootObject();
    try { return !!config && hasOwn(config, 'developer') && (this.value(this.value(config, 'packagerOpts', 'object'), 'dev', 'boolean') ?? false); }
    catch (_) { return false; }
  }

  isDevelopmentSilentLaunch(): boolean { return this.value(this.value(this.getExpoGoConfigRootObject(), 'developmentClient', 'object'), 'silentLaunch', 'boolean') ?? false; }
  isUsingDeveloperTool(): boolean { const developer = this.value(this.getExpoGoConfigRootObject(), 'developer', 'object'); return developer !== null && hasOwn(developer, 'tool'); }
  getRevisionId(): string { return this.string(this.getExpoClientConfigRootObject(), 'revisionId'); }
  getDebuggerHost(): string { return this.string(this.getExpoGoConfigRootObject(), 'debuggerHost'); }
  getMainModuleName(): string { const config = this.getExpoGoConfigRootObject(); return config === null ? 'main' : this.string(config, 'mainModuleName'); }
  getHostUri(): string | null { return this.value(this.getExpoClientConfigRootObject(), 'hostUri', 'string'); }
  getName(): string | null { return this.value(this.getExpoClientConfigRootObject(), 'name', 'string'); }
  getVersion(): string | null { return this.value(this.getExpoClientConfigRootObject(), 'version', 'string'); }
  getUpdatesInfo(): Record<string, ESObject> | null { return this.value(this.getExpoClientConfigRootObject(), 'updates', 'object'); }
  getPrimaryColor(): string | null { return this.value(this.getExpoClientConfigRootObject(), 'primaryColor', 'string'); }
  getOrientation(): string | null { return this.value(this.getExpoClientConfigRootObject(), 'orientation', 'string'); }
  getIconUrl(): string | null { return this.value(this.getExpoClientConfigRootObject(), 'iconUrl', 'string'); }
  getRootSplashInfo(): Record<string, ESObject> | null { return this.value(this.getExpoClientConfigRootObject(), 'splash', 'object'); }
  getFacebookAppId(): string { return this.string(this.getExpoClientConfigRootObject(), 'facebookAppId'); }
  getFacebookApplicationName(): string { return this.string(this.getExpoClientConfigRootObject(), 'facebookDisplayName'); }
  getFacebookAutoInitEnabled(): boolean {
    const value = this.value(this.getExpoClientConfigRootObject(), 'facebookAutoInitEnabled', 'boolean');
    if (value === null) throw new ExpoManifestError("Manifest field 'facebookAutoInitEnabled' must be boolean.");
    return value;
  }
  getPlatformSplashInfo(): Record<string, ESObject> | null { return this.value(this.getPlatformConfig(), 'splash', 'object'); }
  getPlatformConfig(): Record<string, ESObject> | null { return this.value(this.getExpoClientConfigRootObject(), 'harmony', 'object'); }

  private platformStringOrRoot(key: string): string | null {
    const platform = this.getPlatformConfig();
    if (platform !== null && hasOwn(platform, key)) return this.string(platform, key);
    return this.value(this.getExpoClientConfigRootObject(), key, 'string');
  }
  getUserInterfaceStyle(): string | null { return this.platformStringOrRoot('userInterfaceStyle'); }
  getBackgroundColor(): string | null { return this.platformStringOrRoot('backgroundColor'); }
  get jsEngine(): string {
    const engine = this.value(this.getPlatformConfig(), 'jsEngine', 'string') ?? this.value(this.getExpoClientConfigRootObject(), 'jsEngine', 'string');
    if (engine !== null) return engine;

    const parts = this.getExpoGoSDKVersion()?.split('.');
    const major = parts?.length === 3 && /^[+-]?[0-9]+$/.test(parts[0]) ? Number(parts[0]) : 0;

    return major > 0 && major < 48 ? 'jsc' : 'hermes';
  }

  getPluginProperties(name: string): Record<string, ESObject> | null {
    const plugins = this.value(this.getExpoClientConfigRootObject(), 'plugins', 'array');
    if (plugins === null) return null;

    let result: Record<string, ESObject> | null = null;
    for (let index = 0; index < plugins.length; index++) {
      const plugin = plugins[index];
      if (typeof plugin === 'string') continue;
      if (!Array.isArray(plugin) || plugin.length === 0) throw new ExpoManifestError(`Manifest plugins entry ${index} must contain a name or nonempty array.`);
      if (result === null && plugin.length === 2 && plugin[0] === name && isRecord(plugin[1])) result = cloneValue(plugin[1]);
    }

    return result;
  }

  protected value(value: Record<string, ESObject> | null, key: string, type: FieldType): ESObject {
    if (value === null || !hasOwn(value, key)) return null;

    const field = value[key];
    const valid = type === 'object' ? isRecord(field) : type === 'array' ? Array.isArray(field) : typeof field === type;
    if (!valid) throw new ExpoManifestError(`Manifest field '${key}' must be ${type}.`);

    return field;
  }

  protected string(value: Record<string, ESObject> | null, key: string): string {
    if (value === null) throw new ExpoManifestError(`Manifest object containing '${key}' is missing.`);
    if (!hasOwn(value, key)) throw new ExpoManifestError(`Required manifest field '${key}' is missing.`);
    if (typeof value[key] !== 'string') throw new ExpoManifestError(`Manifest field '${key}' must be a string.`);

    return value[key];
  }
}

export class ExpoUpdatesManifest extends Manifest {
  getStableLegacyID(): null { return null; }
  getScopeKey(): string { return this.string(this.value(this.json, 'extra', 'object'), 'scopeKey'); }
  getEASProjectID(): string | null { return this.value(this.value(this.value(this.json, 'extra', 'object'), 'eas', 'object'), 'projectId', 'string'); }
  getRuntimeVersion(): string { return this.string(this.json, 'runtimeVersion'); }
  getBundleURL(): string { return this.string(this.getLaunchAsset(), 'url'); }
  getExpoGoSDKVersion(): string | null { const config = this.getExpoClientConfigRootObject(); return config === null ? null : this.string(config, 'sdkVersion'); }
  getCreatedAt(): string { return this.string(this.json, 'createdAt'); }
  getExpoGoConfigRootObject(): Record<string, ESObject> | null { return this.value(this.value(this.json, 'extra', 'object'), 'expoGo', 'object'); }
  getExpoClientConfigRootObject(): Record<string, ESObject> | null { return this.value(this.value(this.json, 'extra', 'object'), 'expoClient', 'object'); }
  getSlug(): null { return null; }
  getAppKey(): null { return null; }

  getLaunchAsset(): Record<string, ESObject> {
    if (!hasOwn(this.json, 'launchAsset') || !isRecord(this.json.launchAsset)) throw new ExpoManifestError('A remote manifest requires a launchAsset.');
    return this.json.launchAsset;
  }
}

export class EmbeddedManifest extends Manifest {
  getStableLegacyID(): string { return this.value(this.json, 'originalFullName', 'string') ?? this.getID(); }
  getScopeKey(): string { return this.value(this.json, 'scopeKey', 'string') ?? this.getStableLegacyID(); }
  getEASProjectID(): string | null { return this.value(this.json, 'projectId', 'string'); }
  getBundleURL(): string { return this.string(this.json, 'bundleUrl'); }
  getExpoGoSDKVersion(): string | null { return this.value(this.json, 'sdkVersion', 'string'); }
  getExpoGoConfigRootObject(): Record<string, ESObject> { return this.json; }
  getExpoClientConfigRootObject(): Record<string, ESObject> { return this.json; }
  getSlug(): string | null { return this.value(this.json, 'slug', 'string'); }
  getAppKey(): string | null { return this.value(this.json, 'appKey', 'string'); }

  getCommitTimeLong(): number {
    if (!hasOwn(this.json, 'commitTime')) throw new ExpoManifestError('An embedded manifest requires a commitTime.');

    const value = this.json.commitTime;
    const raw = typeof value === 'string' ? value.trim() : value;
    if (typeof raw === 'string' && !/^[+-]?(?:(?:[0-9]+(?:\.[0-9]*)?)|(?:\.[0-9]+))(?:[eE][+-]?[0-9]+)?$/.test(raw)) {
      throw new ExpoManifestError('An embedded manifest requires a decimal commitTime.');
    }

    const parsed = typeof raw === 'string' ? Number(raw) : raw;
    const time = typeof parsed === 'number' ? Math.trunc(parsed) : parsed;
    if (!Number.isSafeInteger(time)) throw new ExpoManifestError('An embedded manifest requires a safely representable integer commitTime.');

    return time;
  }
}
