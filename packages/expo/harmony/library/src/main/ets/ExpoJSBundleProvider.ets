import type { common } from '@kit.AbilityKit';
import {
  FileJSBundleProvider,
  HotReloadConfig,
  JSBundleProvider,
  JsBundle,
  RawFileJSBundle,
  ResourceJSBundleProvider,
  RNOHCoreContext,
} from '@rnoh/react-native-openharmony';
import type { ExpoReactHostDelegate } from './ExpoReactHostDelegate';

export class ExpoResourceBundle extends ResourceJSBundleProvider {
  private readonly context: common.Context;
  private readonly asset: string;

  constructor(context: common.Context, path: string) {
    super(context.resourceManager, path);
    this.context = context;
    this.asset = path;
  }

  override async getBundle(): Promise<ArrayBuffer | RawFileJSBundle> {
    const rnohCoreContext: RNOHCoreContext | undefined = AppStorage.get<RNOHCoreContext>('RNOHCoreContext');
    if (rnohCoreContext !== undefined && rnohCoreContext.uiAbilityContext.resourceManager === this.context.resourceManager) {
      try {
        const fd = this.context.resourceManager.getRawFdSync(this.asset);
        if (fd) {
          this.context.resourceManager.closeRawFdSync(this.asset);
          // RNOH 0.84.1 mmaps the raw offset; Hermes requires uint32 bytecode alignment.
          if (fd.offset % Uint32Array.BYTES_PER_ELEMENT === 0) return { rawFilePath: this.asset };
        }
      } catch (_error) {}
    }

    const bytes = await this.context.resourceManager.getRawFileContent(this.asset);

    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
}

export class ExpoJSBundleProvider extends JSBundleProvider {
  private selected?: JSBundleProvider;

  private readonly context: common.Context;
  private readonly fallback: JSBundleProvider;
  private readonly delegate: ExpoReactHostDelegate;
  private readonly debug: boolean;

  constructor(context: common.Context, fallback: JSBundleProvider, delegate: ExpoReactHostDelegate, debug: boolean) {
    super();
    this.context = context;
    this.fallback = fallback;
    this.delegate = delegate;
    this.debug = debug;
  }

  getURL(): string {
    return (this.selected ?? this.fallback).getURL();
  }
  getAppKeys(): string[] {
    return this.fallback.getAppKeys();
  }
  getHotReloadConfig(): HotReloadConfig | null {
    return (this.selected ?? this.fallback).getHotReloadConfig();
  }

  async getBundle(progress?: (value: number) => void, switched?: (provider: JSBundleProvider) => void): Promise<JsBundle> {
    const path = await this.delegate.getJSBundleFile(this.debug);
    if (path !== undefined) {
      this.selected = path.startsWith('assets://')
        ? new ExpoResourceBundle(this.context, path.slice('assets://'.length))
        : new FileJSBundleProvider(path, this.getAppKeys());
    } else {
      const asset = await this.delegate.getBundleAssetName(this.debug);
      this.selected = asset === undefined ? this.fallback : new ExpoResourceBundle(this.context, asset);
    }

    if (this.selected !== this.fallback) switched?.(this.selected);

    return await this.selected.getBundle(progress, switched);
  }
}
