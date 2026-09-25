import http from '@ohos.net.http';
import uri from '@ohos.uri';
import util from '@ohos.util';
import { EASClientID } from '@expo-harmony/expo-eas-client';
import { Manifest } from '@expo-harmony/expo-manifests';
import {
  UpdatesControllerRegistry,
  UpdatesDevLauncherCallback,
  UpdatesDevLauncherInterface,
  UpdatesDevLauncherResult,
} from '@expo-harmony/expo-updates-interface';
import type { common } from '@kit.AbilityKit';
import { FileJSBundleProvider, JSBundleProvider, MetroJSBundleProvider } from '@rnoh/react-native-openharmony';
import { DevLauncherError, HARMONY_PLATFORM, MAX_MANIFEST_BYTES, NETWORK_TIMEOUT_MS, manifestURL } from './DevLauncherProtocol';
import { readClientRuntime, validateDevelopmentManifest } from './HarmonyRuntimeCompatibility';

type JsonObject = Record<string, ESObject>;

export class LaunchSelection {
  readonly provider: JSBundleProvider;
  readonly manifest: JsonObject | undefined;
  readonly manifestURL: string;
  readonly name: string;
  readonly useDeveloperSupport: boolean;

  constructor(provider: JSBundleProvider, manifest: JsonObject | undefined, manifestURL: string, name: string, useDeveloperSupport: boolean) {
    this.provider = provider;
    this.manifest = manifest;
    this.manifestURL = manifestURL;
    this.name = name;
    this.useDeveloperSupport = useDeveloperSupport;
  }
}

function headerValue(headers: Object, name: string): string | undefined {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === target) return String(Reflect.get(headers, key));
  }
  return undefined;
}

function isRawBundle(contentType: string | undefined): boolean {
  // Match the upstream parser: a successful non-Expo HEAD response is a raw
  // bundle unless its Content-Type explicitly identifies a manifest payload.
  if (contentType === undefined) return true;
  const type = contentType.split(';')[0].trim().toLowerCase();
  return type.startsWith('text/html') || type.includes('/javascript');
}

function object(value: ESObject): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function appName(manifest: Manifest, fallback: string): string {
  try {
    return manifest.getName() ?? manifest.getSlug() ?? fallback;
  } catch (_) {
    return fallback;
  }
}

export class DevLauncherManifestLoader {
  private readonly clientID: string;
  private readonly context: common.ApplicationContext;
  readonly appKeys: string[];

  constructor(context: common.ApplicationContext, appKeys: string[]) {
    this.context = context;
    this.appKeys = appKeys;
    this.clientID = new EASClientID(context).clientID;
  }

  async load(input: string, progress: (value: number) => void): Promise<LaunchSelection> {
    const url = manifestURL(input);
    const updates = UpdatesControllerRegistry.controller as UpdatesDevLauncherInterface | undefined;
    if (updates !== undefined && typeof updates.fetchUpdateWithConfiguration === 'function') updates.reset();
    if (url.split('?')[0].endsWith('.bundle') || url.split('?')[0].endsWith('.js')) {
      return new LaunchSelection(new MetroJSBundleProvider(url, this.appKeys), undefined, url, url, true);
    }
    if (await this.rawBundleAt(url)) {
      return new LaunchSelection(new MetroJSBundleProvider(url, this.appKeys), undefined, url, url, true);
    }

    if (updates !== undefined && typeof updates.fetchUpdateWithConfiguration === 'function') {
      const configuration = this.updatesConfiguration(updates, url);
      if (configuration !== undefined) return await this.loadWithUpdates(url, updates, configuration, progress);
    }

    const json = await this.downloadManifest(url);

    const parsed = Manifest.fromManifestJson(json);
    if (parsed.isUsingDeveloperTool()) {
      return await this.developmentSelection(url, parsed, json);
    }

    throw new DevLauncherError(
      'ERR_DEV_LAUNCHER_UPDATES_UNAVAILABLE',
      'Loading published projects requires a valid @expo-harmony/expo-updates configuration in this development client.',
    );
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    headers.accept = 'application/expo+json,application/json';
    headers['expo-platform'] = HARMONY_PLATFORM;
    headers['expo-dev-client-id'] = this.clientID;
    return headers;
  }

  private async rawBundleAt(url: string): Promise<boolean> {
    const request = http.createHttp();

    try {
      const response = await request.request(url, {
        method: http.RequestMethod.HEAD,
        header: this.headers(),
        expectDataType: http.HttpDataType.STRING,
        usingCache: false,
        connectTimeout: NETWORK_TIMEOUT_MS,
        readTimeout: NETWORK_TIMEOUT_MS,
      });

      return (
        response.responseCode >= 200 &&
        response.responseCode < 300 &&
        headerValue(response.header, 'exponent-server') === undefined &&
        isRawBundle(headerValue(response.header, 'content-type'))
      );
    } catch (_) {
      return false;
    } finally {
      request.destroy();
    }
  }

  private async downloadManifest(url: string): Promise<JsonObject> {
    const request = http.createHttp();

    try {
      const response = await request.request(url, {
        method: http.RequestMethod.GET,
        header: this.headers(),
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        usingCache: false,
        connectTimeout: NETWORK_TIMEOUT_MS,
        readTimeout: NETWORK_TIMEOUT_MS,
        maxLimit: MAX_MANIFEST_BYTES,
      });

      if (response.responseCode < 200 || response.responseCode >= 300 || !(response.result instanceof ArrayBuffer)) {
        throw new DevLauncherError('ERR_DEV_LAUNCHER_MANIFEST', `Manifest request returned HTTP ${response.responseCode}.`);
      }
      if (response.result.byteLength > MAX_MANIFEST_BYTES) {
        throw new DevLauncherError('ERR_DEV_LAUNCHER_MANIFEST', 'The development manifest exceeds the 2 MiB limit.');
      }

      let value: ESObject;

      try {
        value = JSON.parse(util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(response.result)));
      } catch (error) {
        throw new DevLauncherError('ERR_DEV_LAUNCHER_MANIFEST', 'The development server returned invalid JSON.', error as Object);
      }

      const result = object(value);
      if (result === undefined) throw new DevLauncherError('ERR_DEV_LAUNCHER_MANIFEST', 'The development manifest must be a JSON object.');

      return result;
    } finally {
      request.destroy();
    }
  }

  async developmentSelection(url: string, manifest: Manifest, json: JsonObject): Promise<LaunchSelection> {
    const client = await readClientRuntime(this.context.resourceManager);
    validateDevelopmentManifest(client, json, url);

    return new LaunchSelection(new MetroJSBundleProvider(manifest.getBundleURL(), this.appKeys), json, url, appName(manifest, url), true);
  }

  private updatesConfiguration(controller: UpdatesDevLauncherInterface, url: string): JsonObject | undefined {
    const runtimeVersion = controller.runtimeVersion;
    if (runtimeVersion === null) return undefined;

    const headers: JsonObject = {};
    headers['Expo-Updates-Environment'] = 'DEVELOPMENT';
    headers['Expo-Dev-Client-ID'] = this.clientID;

    const configuration: JsonObject = {};
    configuration.updateUrl = url;
    configuration.scopeKey = this.projectScopeURL(url, controller.updateUrl);
    configuration.enabled = true;
    configuration.useEmbeddedUpdate = false;
    configuration.fallbackToCacheTimeout = NETWORK_TIMEOUT_MS;
    configuration.checkAutomatically = 'ALWAYS';
    configuration.runtimeVersion = runtimeVersion;
    configuration.requestHeaders = headers;

    return controller.isValidUpdatesConfiguration(configuration) ? configuration : undefined;
  }

  private projectScopeURL(url: string, configuredURL: string | null): string {
    try {
      const host = new uri.URI(url).host.toLowerCase();
      if ((host === 'u.expo.dev' || host === 'staging-u.expo.dev') && configuredURL !== null) return configuredURL;
    } catch (_) {}
    return url;
  }

  private async loadWithUpdates(
    url: string,
    controller: UpdatesDevLauncherInterface,
    configuration: JsonObject,
    progress: (value: number) => void,
  ): Promise<LaunchSelection> {
    return await new Promise<LaunchSelection>((resolve, reject): void => {
      controller.fetchUpdateWithConfiguration(configuration, new UpdatesFetchCallbacks(this, url, progress, resolve, reject));
    });
  }
}

class UpdatesFetchCallbacks implements UpdatesDevLauncherCallback {
  private readonly loader: DevLauncherManifestLoader;
  private readonly url: string;
  private readonly progress: (value: number) => void;
  private readonly resolve: (selection: LaunchSelection) => void;
  private readonly reject: (reason: ESObject) => void;
  private settled: boolean = false;
  private developmentManifest: JsonObject | undefined;

  constructor(
    loader: DevLauncherManifestLoader,
    url: string,
    progress: (value: number) => void,
    resolve: (selection: LaunchSelection) => void,
    reject: (reason: ESObject) => void,
  ) {
    this.loader = loader;
    this.url = url;
    this.progress = progress;
    this.resolve = resolve;
    this.reject = reject;
  }

  onFailure(error: Error | null): void {
    if (this.settled) return;
    this.settled = true;
    this.reject(error ?? new DevLauncherError('ERR_DEV_LAUNCHER_UPDATE', 'Expo Updates failed without an error.'));
  }

  onSuccess(update: UpdatesDevLauncherResult | null): void {
    if (this.settled) return;
    try {
      if (update === null) {
        if (this.developmentManifest === undefined) {
          this.settled = true;
          this.reject(new DevLauncherError('ERR_DEV_LAUNCHER_UPDATE', 'Expo Updates returned no launchable update.'));
          return;
        }

        const parsed = Manifest.fromManifestJson(this.developmentManifest);
        this.loader.developmentSelection(this.url, parsed, this.developmentManifest).then(
          (selection: LaunchSelection): void => {
            if (this.settled) return;
            this.settled = true;
            this.resolve(selection);
          },
          (error: Error): void => {
            if (this.settled) return;
            this.settled = true;
            this.reject(error);
          },
        );

        return;
      }

      const manifest = object(update.manifest);
      if (manifest === undefined) {
        this.settled = true;
        this.reject(new DevLauncherError('ERR_DEV_LAUNCHER_MANIFEST', 'Expo Updates returned an invalid manifest.'));
        return;
      }

      const parsed = Manifest.fromManifestJson(manifest);
      this.settled = true;
      this.resolve(
        new LaunchSelection(
          new FileJSBundleProvider(update.launchAssetPath, this.loader.appKeys),
          manifest,
          this.url,
          appName(parsed, this.url),
          false,
        ),
      );
    } catch (error) {
      if (this.settled) return;
      this.settled = true;
      this.reject(error);
    }
  }

  onProgress(successful: number, failed: number, total: number): void {
    if (!this.settled && total > 0) this.progress(Math.max(0, Math.min(1, (successful + failed) / total)));
  }

  onManifestLoaded(value: JsonObject): boolean {
    const parsed = Manifest.fromManifestJson(value);
    if (!parsed.isUsingDeveloperTool()) return true;
    this.developmentManifest = value;
    return false;
  }
}
