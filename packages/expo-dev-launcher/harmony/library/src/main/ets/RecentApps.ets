import { preferences } from '@kit.ArkData';
import type { common } from '@kit.AbilityKit';

export class RecentApp {
  readonly url: string;
  readonly name: string;
  readonly openedAt: number;

  constructor(url: string, name: string, openedAt: number) {
    this.url = url;
    this.name = name;
    this.openedAt = openedAt;
  }
}

const STORE = 'expo-dev-launcher';
const RECENT_KEY = 'recent-apps';
const FAILURE_KEY = 'last-runtime-error';
const RECENT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export class RecentApps {
  private readonly store?: preferences.Preferences;

  constructor(context: common.ApplicationContext) {
    try {
      this.store = preferences.getPreferencesSync(context, { name: STORE });
    } catch (error) {
      console.warn(`Unable to open Expo Dev Launcher history: ${String(error)}`);
    }
  }

  all(): RecentApp[] {
    try {
      const raw = this.store?.getSync(RECENT_KEY, '[]');
      if (typeof raw !== 'string') return [];

      let values: ESObject;
      values = JSON.parse(raw);
      if (!Array.isArray(values)) return [];

      const result: RecentApp[] = [];
      for (let index = 0; index < values.length; index++) {
        const item: ESObject = values[index];
        if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
        const value = item as Record<string, ESObject>;
        if (typeof value.url !== 'string' || typeof value.name !== 'string' || !Number.isSafeInteger(value.openedAt)) continue;
        result.push(new RecentApp(value.url, value.name, value.openedAt));
      }

      const threshold = Date.now() - RECENT_RETENTION_MS;

      return result
        .filter((item: RecentApp): boolean => item.openedAt >= threshold)
        .sort((left: RecentApp, right: RecentApp): number => right.openedAt - left.openedAt);
    } catch (_) {
      return [];
    }
  }

  async remember(url: string, name: string): Promise<void> {
    if (this.store === undefined) return;
    const recent = [new RecentApp(url, name || url, Date.now()), ...this.all().filter((item: RecentApp): boolean => item.url !== url)];
    await this.store.put(RECENT_KEY, JSON.stringify(recent));
    await this.store.flush();
  }

  async clear(): Promise<void> {
    if (this.store === undefined) return;
    await this.store.delete(RECENT_KEY);
    await this.store.flush();
  }

  takeFailure(): string | undefined {
    try {
      const raw = this.store?.getSync(FAILURE_KEY, '');
      this.clearFailure();
      if (typeof raw !== 'string' || raw.length === 0) return undefined;
      const value: ESObject = JSON.parse(raw);
      if (typeof value?.message !== 'string' || typeof value?.time !== 'number' || Date.now() - value.time > RECENT_RETENTION_MS) return undefined;
      return value.message;
    } catch (_) {
      return undefined;
    }
  }

  rememberFailure(error: Error): void {
    try {
      this.store?.putSync(FAILURE_KEY, JSON.stringify({ time: Date.now(), message: `${error.message}\n${error.stack ?? ''}`.slice(0, 32768) }));
      this.store?.flush().catch((): void => {});
    } catch (_) {}
  }

  clearFailure(): void {
    try {
      this.store?.deleteSync(FAILURE_KEY);
      this.store?.flush().catch((): void => {});
    } catch (_) {}
  }
}
