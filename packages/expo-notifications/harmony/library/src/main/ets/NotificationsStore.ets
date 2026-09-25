import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { notificationManager } from '@kit.NotificationKit';
import { reminderAgentManager } from '@kit.BackgroundTasksKit';
import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { BusinessError } from '@kit.BasicServicesKit';
import {
  Notification,
  NotificationResponse,
  NotificationCategory,
  ScheduledNotification,
  MAX_NOTIFICATION_ID,
  RESPONSE_KEY,
  parseResponse,
} from './NotificationTypes';

const PERMISSION_DENIED = 201;

export type NotificationReceiver = (notification: Notification) => void;
export type ResponseReceiver = (response: NotificationResponse) => void;
export type TokenReceiver = (token: string) => void;

export class NotificationsStore {
  private static instances: Map<string, NotificationsStore> = new Map();
  private readonly storage: preferences.Preferences;
  private tail: Promise<void> = Promise.resolve();
  private failure?: Object;
  readonly received: Map<common.UIAbilityContext, Set<NotificationReceiver>> = new Map();
  readonly responses: Set<ResponseReceiver> = new Set();
  readonly tokens: Set<TokenReceiver> = new Set();
  lastResponse: NotificationResponse | null = null;

  private constructor(context: common.Context) {
    this.storage = preferences.getPreferencesSync(context, { name: 'expo_notifications' });
  }

  static get(context: common.Context): NotificationsStore {
    const key = context.applicationInfo.name;
    let instance = NotificationsStore.instances.get(key);
    if (instance === undefined) {
      instance = new NotificationsStore(context);
      NotificationsStore.instances.set(key, instance);
    }

    return instance;
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      (): void => {},
      (): void => {},
    );

    return result;
  }

  read<T>(key: string, fallback: T): T {
    const value = this.storage.getSync(key, '') as string;
    if (value === '') return fallback;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_STORAGE', `Invalid persisted notifications data (${key}).`, error as Object);
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    if (this.failure !== undefined) {
      throw new ExpoModuleError(
        'ERR_NOTIFICATIONS_STORAGE',
        'Notification storage rollback failed; restart the application before retrying.',
        this.failure,
      );
    }

    const previous = this.storage.getSync(key, '');
    this.storage.putSync(key, JSON.stringify(value));

    try {
      await this.storage.flush();
    } catch (error) {
      try {
        this.storage.putSync(key, previous);
        await this.storage.flush();
      } catch (rollback) {
        this.failure = rollback as Object;
        throw new ExpoModuleError(
          'ERR_NOTIFICATIONS_STORAGE',
          `Could not persist or restore notifications data (${key}); restart the application before retrying.`,
          rollback as Object,
        );
      }

      throw new ExpoModuleError('ERR_NOTIFICATIONS_STORAGE', `Could not persist notifications data (${key}).`, error as Object);
    }
  }

  schedules(): ScheduledNotification[] {
    return this.read<ScheduledNotification[]>('scheduled', []);
  }

  categories(): NotificationCategory[] {
    return this.read<NotificationCategory[]>('categories', []);
  }

  async allocateId(): Promise<number> {
    const active = await notificationManager.getActiveNotifications();
    const occupied = new Set<number>(active.map((entry: notificationManager.NotificationRequest): number => entry.id ?? 0));
    this.schedules().forEach((entry: ScheduledNotification): void => {
      occupied.add(entry.notificationId);
    });

    let next = this.read<number>('nextId', 0);
    do {
      // Reserve distinct WantAgent request codes for the body and action buttons.
      next = next >= MAX_NOTIFICATION_ID ? 1 : next + 1;
    } while (occupied.has(next));

    await this.write('nextId', next);

    return next;
  }

  async validSchedules(cancelling: boolean = false): Promise<ScheduledNotification[]> {
    const saved = this.schedules();
    let valid: reminderAgentManager.ReminderInfo[];

    try {
      valid = await reminderAgentManager.getAllValidReminders();
    } catch (error) {
      // cancelReminder itself does not require this query permission. Continue
      // cancelling saved handles when an app update removed the permission.
      if ((error as BusinessError).code === PERMISSION_DENIED && (cancelling || saved.length === 0)) return saved;
      throw new ExpoModuleError(String((error as BusinessError).code ?? 'ERR_NOTIFICATIONS_SCHEDULE'), (error as Error).message, error as Object);
    }

    const ids = new Set<number>(valid.map((entry: reminderAgentManager.ReminderInfo): number => entry.reminderId));
    const active = await notificationManager.getActiveNotifications();
    const displayed = new Set<number>(active.map((entry: notificationManager.NotificationRequest): number => entry.id ?? -1));

    const retained = saved.filter((entry: ScheduledNotification): boolean => ids.has(entry.reminderId) || displayed.has(entry.notificationId));

    // The system request also holds our serialized Expo request. Recover handles
    // if a crash or storage failure occurred after publishReminder succeeded.
    for (const item of valid) {
      if (retained.some((entry: ScheduledNotification): boolean => entry.reminderId === item.reminderId)) continue;

      const serialized = item.reminderReq.wantAgent?.parameters?.[RESPONSE_KEY];
      if (typeof serialized !== 'string' || item.reminderReq.notificationId === undefined) continue;

      let response: NotificationResponse;
      try {
        response = parseResponse(serialized);
      } catch (_) {
        continue;
      }

      retained.push({ reminderId: item.reminderId, notificationId: item.reminderReq.notificationId, request: response.notification.request });
    }

    if (JSON.stringify(retained) !== JSON.stringify(saved)) await this.write('scheduled', retained);

    return retained.filter((entry: ScheduledNotification): boolean => ids.has(entry.reminderId));
  }

  receive(context: common.UIAbilityContext, notification: Notification): void {
    this.received.get(context)?.forEach((callback: NotificationReceiver): void => callback(notification));
  }

  respond(response: NotificationResponse): void {
    this.lastResponse = response;
    this.responses.forEach((callback: ResponseReceiver): void => callback(response));
  }

  get lastToken(): string | undefined {
    return this.read<string | null>('pushToken', null) ?? undefined;
  }

  async clearToken(): Promise<void> {
    await this.write('pushToken', null);
  }

  async updateToken(token: string): Promise<void> {
    if (token.length === 0 || token === this.lastToken) return;

    await this.write('pushToken', token);

    this.tokens.forEach((callback: TokenReceiver): void => callback(token));
  }
}
