import { ExpoServiceKey } from './ExpoServicesRegistry';

export type ExpoFileAccessMode = 'read' | 'write';

export interface ExpoFileAccessPolicy {
  assertAccess(path: string, mode: ExpoFileAccessMode): void;

  grantExternalPath(path: string, directory: boolean, writable: boolean): void;
}

export const ExpoFileAccessKey = new ExpoServiceKey<ExpoFileAccessPolicy>('ExpoFileAccessPolicy');

export type ExpoFileAccessHandler = (path: string, mode: ExpoFileAccessMode, policy?: ExpoFileAccessPolicy) => boolean | undefined;

export class ExpoFileAccessRegistry {
  private static readonly handlers: Map<number, Set<ExpoFileAccessHandler>> = new Map();

  static register(id: number, handler: ExpoFileAccessHandler): () => void {
    let handlers = ExpoFileAccessRegistry.handlers.get(id);
    if (handlers === undefined) {
      handlers = new Set();
      ExpoFileAccessRegistry.handlers.set(id, handlers);
    }
    handlers.add(handler);

    return (): void => {
      const handlers = ExpoFileAccessRegistry.handlers.get(id);
      handlers?.delete(handler);
      if (handlers?.size === 0) ExpoFileAccessRegistry.handlers.delete(id);
    };
  }

  static check(id: number, path: string, mode: ExpoFileAccessMode, policy?: ExpoFileAccessPolicy): boolean | undefined {
    const handlers = ExpoFileAccessRegistry.handlers.get(id);
    if (handlers === undefined) return undefined;

    let granted: boolean | undefined;

    for (const handler of handlers) {
      const result = handler(path, mode, policy);
      if (result === false) return false;
      if (result === true) granted = true;
    }

    return granted;
  }
}
