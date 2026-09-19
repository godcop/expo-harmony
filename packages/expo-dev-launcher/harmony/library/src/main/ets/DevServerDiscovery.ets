import { mdns } from '@kit.NetworkKit';
import type { common } from '@kit.AbilityKit';
import util from '@ohos.util';
import { EXPO_MDNS_SERVICE, MANIFEST_PATH, HARMONY_PLATFORM } from './DevLauncherProtocol';

export class DiscoveredServer {
  readonly id: string;
  readonly name: string;
  readonly url: string;

  constructor(id: string, name: string, url: string) {
    this.id = id;
    this.name = name;
    this.url = url;
  }
}

type DiscoveryListener = (servers: DiscoveredServer[]) => void;

function hostForURL(address: string): string {
  return address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
}

function txtName(info: mdns.LocalServiceInfo): string | undefined {
  const attribute = info.serviceAttribute?.find((item: mdns.ServiceAttribute): boolean => item.key === 'name');
  if (attribute === undefined) return undefined;
  try {
    const value: string = util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(attribute.value)).trim();
    return value.length > 0 ? value : undefined;
  } catch (_) {
    return undefined;
  }
}

export class DevServerDiscovery {
  private service?: mdns.DiscoveryService;
  private readonly servers = new Map<string, DiscoveredServer>();
  private readonly listeners = new Set<DiscoveryListener>();
  private generation = 0;
  private readonly context: common.UIAbilityContext;

  constructor(context: common.UIAbilityContext) {
    this.context = context;
  }

  subscribe(listener: DiscoveryListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.service !== undefined) return;

    const generation = ++this.generation;

    try {
      const service = mdns.createDiscoveryService(this.context, EXPO_MDNS_SERVICE);
      service.on('serviceFound', (info: mdns.LocalServiceInfo): void => {
        mdns.resolveLocalService(this.context, info).then(
          (resolved: mdns.LocalServiceInfo): void => {
            if (this.generation !== generation || this.service !== service) return;

            const address = resolved.host?.address;
            const port = resolved.port;
            if (address === undefined || port === undefined || port < 1 || port > 65535) return;

            const id = `${resolved.serviceName}|${address}|${port}`;
            const url = `http://${hostForURL(address)}:${port}${MANIFEST_PATH}?platform=${HARMONY_PLATFORM}`;
            this.servers.set(id, new DiscoveredServer(id, txtName(resolved) ?? resolved.serviceName, url));
            this.publish();
          },
          (error: Object): void => {
            if (this.generation === generation && this.service === service) {
              console.warn(`Unable to resolve Expo development server: ${String(error)}`);
            }
          },
        );
      });
      service.on('serviceLost', (info: mdns.LocalServiceInfo): void => {
        if (this.generation !== generation || this.service !== service) return;
        const prefix = `${info.serviceName}|`;
        this.servers.forEach((server: DiscoveredServer, id: string): void => {
          if (id.startsWith(prefix)) this.servers.delete(server.id);
        });
        this.publish();
      });
      this.service = service;
      try {
        service.startSearchingMDNS();
      } catch (error) {
        this.service = undefined;
        try {
          service.off('serviceFound');
          service.off('serviceLost');
        } catch (detachError) {
          console.warn(`Unable to detach Expo development server discovery: ${String(detachError)}`);
        }
        console.warn(`Unable to start Expo development server discovery: ${String(error)}`);
      }
    } catch (error) {
      this.service = undefined;
      console.warn(`Unable to start Expo development server discovery: ${String(error)}`);
    }
  }

  stop(): void {
    const service = this.service;
    if (service === undefined) return;
    this.generation += 1;
    this.service = undefined;
    try {
      service.stopSearchingMDNS();
    } catch (error) {
      console.warn(`Unable to stop Expo development server discovery: ${String(error)}`);
    }
    service.off('serviceFound');
    service.off('serviceLost');
    this.servers.clear();
    this.publish();
  }

  private snapshot(): DiscoveredServer[] {
    return Array.from(this.servers.values()).sort((left: DiscoveredServer, right: DiscoveredServer): number => left.name.localeCompare(right.name));
  }

  private publish(): void {
    const value = this.snapshot();
    this.listeners.forEach((listener: DiscoveryListener): void => listener(value));
  }
}
