import { ExpoService, ExpoServiceKey } from './ExpoServicesRegistry';

export interface ExpoRuntimeDirectories {
  directory(base: string): string;
  preferenceName(name: string): string;
}

export const ExpoRuntimeDirectoriesKey = new ExpoServiceKey<ExpoRuntimeDirectories>('ExpoRuntimeDirectories');

export class ExpoAppDirectories extends ExpoService implements ExpoRuntimeDirectories {
  static readonly key = new ExpoServiceKey<ExpoAppDirectories>('ExpoAppDirectories');
  readonly identity = ExpoAppDirectories.key.bind(this);
  readonly interfaces = [ExpoRuntimeDirectoriesKey.bind(this)];

  directory(base: string): string {
    return base;
  }

  preferenceName(name: string): string {
    return name;
  }
}
