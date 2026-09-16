import { ExpoModuleError } from '../modules/ExpoModuleError';

type ExpoReloadRegistryCallback = (reason: string) => Promise<void>;
interface ReloadRoute {
  reload: ExpoReloadRegistryCallback;
}

export class ExpoReloadRegistry {
  private static readonly routes = new Map<number, Set<ReloadRoute>>();

  static register(instanceId: number, reload: ExpoReloadRegistryCallback): () => void {
    let routes = ExpoReloadRegistry.routes.get(instanceId);
    if (routes === undefined) {
      routes = new Set();
      ExpoReloadRegistry.routes.set(instanceId, routes);
    }
    const route: ReloadRoute = { reload };
    routes.add(route);
    const current = routes;

    return (): void => {
      current.delete(route);
      if (current.size === 0 && ExpoReloadRegistry.routes.get(instanceId) === current) ExpoReloadRegistry.routes.delete(instanceId);
    };
  }

  static require(instanceId: number): ExpoReloadRegistryCallback {
    const registration = ExpoReloadRegistry.routes.get(instanceId);
    const routes = Array.from(registration ?? []);
    const route = routes[routes.length - 1];
    if (route === undefined) throw new ExpoModuleError('ERR_RELOAD_UNAVAILABLE', `RNInstance ${instanceId} has no registered reload delegate.`);

    return (reason: string): Promise<void> => {
      const current = ExpoReloadRegistry.routes.get(instanceId);
      if (current !== registration)
        throw new ExpoModuleError('ERR_RELOAD_UNAVAILABLE', `RNInstance ${instanceId} reload registration has been released.`);
      if (!current?.has(route)) return ExpoReloadRegistry.require(instanceId)(reason);

      return route.reload(reason);
    };
  }
}
