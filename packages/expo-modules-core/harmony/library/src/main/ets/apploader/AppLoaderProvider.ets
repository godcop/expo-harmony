import { ExpoModuleError } from '../modules/ExpoModuleError';
import { HeadlessAppLoader } from './HeadlessAppLoader';

interface AppLoaderRegistration {
  loader: HeadlessAppLoader;
}

export class AppLoaderProvider {
  static readonly reactNative = 'react-native-headless';
  private static readonly loaders = new Map<string, AppLoaderRegistration>();

  static registerLoader(name: string, loader: HeadlessAppLoader): () => void {
    const current = AppLoaderProvider.loaders.get(name);
    if (current !== undefined && current.loader !== loader)
      throw new ExpoModuleError('ERR_APP_LOADER_DUPLICATE', `An app loader is already registered for '${name}'.`);

    const registration: AppLoaderRegistration = { loader };
    AppLoaderProvider.loaders.set(name, registration);

    return (): void => {
      if (AppLoaderProvider.loaders.get(name) === registration) AppLoaderProvider.loaders.delete(name);
    };
  }

  static getLoader(name: string): HeadlessAppLoader | undefined {
    return AppLoaderProvider.loaders.get(name)?.loader;
  }
}
