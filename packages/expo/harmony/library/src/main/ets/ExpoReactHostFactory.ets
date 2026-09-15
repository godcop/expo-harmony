import { ExpoReactHost, ExpoReactHostOptions } from './ExpoReactHost';

export class ExpoReactHostFactory {
  private static host?: ExpoReactHost;

  static getDefaultReactHost(options: ExpoReactHostOptions): ExpoReactHost {
    if (ExpoReactHostFactory.host === undefined) ExpoReactHostFactory.host = new ExpoReactHost(options);
    return ExpoReactHostFactory.host;
  }
}
