import { ExpoModule, ExpoModuleDefinition, ExpoModuleError, ExpoFunction, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import { BusinessError, deviceInfo } from '@kit.BasicServicesKit';
import { notificationManager } from '@kit.NotificationKit';
import { pushService } from '@kit.PushKit';
import { NotificationsStore, NotificationReceiver, ResponseReceiver, TokenReceiver } from './NotificationsStore';
import {
  Notification,
  NotificationResponse,
  NotificationRequest,
  NotificationCategory,
  NotificationAction,
  ScheduledNotification,
  HANDLER_TIMEOUT_MS,
  EXPO_SERVICE_ERROR,
  identifier,
  integer,
  record,
} from './NotificationTypes';
import { validateTrigger, nextTriggerDate } from './NotificationTriggers';
import { presentedNotification, publishNotification, validateActions, validateBehavior } from './NotificationPresentation';
import { schedule, cancelScheduled } from './NotificationScheduling';

const NotificationRecord = ExpoValueTypes.custom<Record<string, ESObject>>(
  'notification object',
  (value: ESObject): Record<string, ESObject> => record(value, 'notification argument'),
  (value: Record<string, ESObject>): ESObject => value,
);
const NotificationActions = ExpoValueTypes.custom<NotificationAction[]>(
  'notification actions',
  (value: ESObject): NotificationAction[] => {
    if (!Array.isArray(value)) {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'actions must be an array.');
    }

    return value as NotificationAction[];
  },
  (value: NotificationAction[]): ESObject => value,
);

const NOTIFICATIONS_DISABLED = 1600004;
const CAPABILITY_UNSUPPORTED = 801;

abstract class NotificationsModule extends ExpoModule {
  protected get store(): NotificationsStore {
    return NotificationsStore.get(this.context.uiAbilityContext);
  }

  protected queue<T>(operation: () => Promise<T>): Promise<T> {
    return this.store.run((): Promise<T> => {
      // The context checks its lifetime before queued work can produce effects.
      this.context.runtimeEpoch;

      return operation();
    });
  }

  protected listen(callback: NotificationReceiver): void {
    let callbacks = this.store.received.get(this.context.uiAbilityContext);
    if (callbacks === undefined) {
      callbacks = new Set<NotificationReceiver>();
      this.store.received.set(this.context.uiAbilityContext, callbacks);
    }

    callbacks.add(callback);
  }

  protected unlisten(callback: NotificationReceiver): void {
    const callbacks = this.store.received.get(this.context.uiAbilityContext);
    callbacks?.delete(callback);
    if (callbacks?.size === 0) this.store.received.delete(this.context.uiAbilityContext);
  }
}

export class ExpoPushTokenManager extends NotificationsModule {
  private alive: boolean = true;
  private receiver: TokenReceiver = (token: string): void => {
    const payload: Record<string, ESObject> = { 'devicePushToken': token };
    this.sendEvent('onDevicePushToken', payload);
  };

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoPushTokenManager')
      .events(['onDevicePushToken'])
      .onCreate((): void => {
        this.store.tokens.add(this.receiver);
      })
      .onDestroy((): void => {
        this.alive = false;
        this.store.tokens.delete(this.receiver);
      })
      .onStartObserving('onDevicePushToken', (): void => {
        this.refreshToken();
      })
      .onForeground((): void => {
        this.refreshToken();
      })
      .asyncFunction('getDevicePushTokenAsync', (): Promise<string> => this.token())
      .asyncFunction(
        'unregisterForNotificationsAsync',
        (): Promise<void> =>
          this.queue(async (): Promise<void> => {
            // Disable automatic refresh durably before deleting the system token.
            // A late tokenUpdate/foreground callback must not register it again.
            await this.store.clearToken();
            await pushService.deleteToken();
          }),
      );
  }

  private refreshToken(): void {
    this.queue(async (): Promise<void> => {
      // Recheck inside the queue: unregister may have run since the lifecycle event.
      if (this.store.lastToken !== undefined) await this.fetchToken();
    }).catch((error: Object): void => {
      if (this.alive) this.context.logger.warn(`Unable to refresh Push Kit registration (code ${(error as BusinessError).code}).`);
    });
  }

  private token(): Promise<string> {
    return this.queue((): Promise<string> => this.fetchToken());
  }

  private async fetchToken(): Promise<string> {
    const store = this.store;
    const token = await pushService.getToken();
    if (token.length === 0) {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_PUSH_TOKEN', 'Push Kit returned an empty token.');
    }

    await store.updateToken(token);

    return token;
  }
}

export class ExpoNotificationPermissionsModule extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationPermissionsModule')
      .asyncFunction(
        'getPermissionsAsync',
        (): Promise<Record<string, ESObject>> => this.queue((): Promise<Record<string, ESObject>> => this.permissions()),
      )
      .asyncFunction(
        'requestPermissionsAsync',
        ExpoFunction.typed1(
          NotificationRecord.optional(),
          (_options?: ESObject): Promise<Record<string, ESObject>> =>
            this.queue(async (): Promise<Record<string, ESObject>> => {
              if (await notificationManager.isNotificationEnabled()) return this.permissions();

              try {
                await notificationManager.requestEnableNotification(this.context.uiAbilityContext);
              } catch (error) {
                if ((error as BusinessError).code !== NOTIFICATIONS_DISABLED) {
                  throw new ExpoModuleError(
                    String((error as BusinessError).code ?? 'ERR_NOTIFICATIONS_PERMISSION'),
                    (error as Error).message,
                    error as Object,
                  );
                }
              }

              await this.store.write('permissionRequested', true);

              return this.permissions();
            }),
        ),
      );
  }

  private async permissions(): Promise<Record<string, ESObject>> {
    const granted = await notificationManager.isNotificationEnabled();
    const asked = this.store.read<boolean>('permissionRequested', false);
    if (granted && !asked) await this.store.write('permissionRequested', true);

    const settings = await notificationManager.getNotificationSetting();

    const response: Record<string, ESObject> = {};
    response['status'] = granted ? 'granted' : asked ? 'denied' : 'undetermined';
    response['granted'] = granted;
    response['canAskAgain'] = granted || !asked;
    response['expires'] = 'never';
    response['harmony'] = settings;

    return response;
  }
}

export class ExpoBadgeModule extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoBadgeModule')
      .asyncFunction('getBadgeCountAsync', async (): Promise<number> => {
        try {
          return await notificationManager.getBadgeNumber();
        } catch (error) {
          if ((error as BusinessError).code === CAPABILITY_UNSUPPORTED) return 0;
          throw new ExpoModuleError(String((error as BusinessError).code ?? 'ERR_NOTIFICATIONS_BADGE'), (error as Error).message, error as Object);
        }
      })
      .asyncFunction(
        'setBadgeCountAsync',
        ExpoFunction.typed1(ExpoValueTypes.number(), async (count: number): Promise<boolean> => {
          integer(count, 'badgeCount', 0, 2147483647);

          try {
            if (!(await notificationManager.isNotificationEnabled())) return false;
            if (deviceInfo.apiAvailable('26.0.0')) {
              const settings = await notificationManager.getNotificationSetting();
              if (settings.badgeNumberEnabled === false) return false;
            }

            await notificationManager.setBadgeNumber(count);

            return true;
          } catch (error) {
            if ((error as BusinessError).code === CAPABILITY_UNSUPPORTED) return false;
            throw new ExpoModuleError(String((error as BusinessError).code ?? 'ERR_NOTIFICATIONS_BADGE'), (error as Error).message, error as Object);
          }
        }),
      );
  }
}

export class ExpoNotificationScheduler extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationScheduler')
      .asyncFunction(
        'scheduleNotificationAsync',
        ExpoFunction.typed3(
          ExpoValueTypes.string(),
          NotificationRecord,
          NotificationRecord.nullable(),
          (id: string, content: ESObject, trigger: ESObject): Promise<string> =>
            this.queue((): Promise<string> => schedule(this.context, this.store, id, content, trigger)),
        ),
      )
      .asyncFunction(
        'getAllScheduledNotificationsAsync',
        (): Promise<NotificationRequest[]> =>
          this.queue(
            async (): Promise<NotificationRequest[]> =>
              (await this.store.validSchedules()).map((entry: ScheduledNotification): NotificationRequest => entry.request),
          ),
      )
      .asyncFunction(
        'cancelScheduledNotificationAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), (id: string): Promise<void> => this.queue((): Promise<void> => cancelScheduled(this.store, id))),
      )
      .asyncFunction(
        'cancelAllScheduledNotificationsAsync',
        (): Promise<void> =>
          this.queue(async (): Promise<void> => {
            await this.store.validSchedules(true);

            for (const entry of this.store.schedules()) await cancelScheduled(this.store, entry.request.identifier);
          }),
      )
      .asyncFunction(
        'getNextTriggerDateAsync',
        ExpoFunction.typed1(
          NotificationRecord.nullable(),
          async (trigger: ESObject): Promise<number | null> => nextTriggerDate(validateTrigger(trigger)),
        ),
      );
  }
}

export class ExpoNotificationPresenter extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationPresenter')
      .asyncFunction('getPresentedNotificationsAsync', async (): Promise<Notification[]> => {
        const scheduled = this.store.schedules();

        return (await notificationManager.getActiveNotifications()).map(
          (request: notificationManager.NotificationRequest): Notification => presentedNotification(request, scheduled),
        );
      })
      .asyncFunction(
        'dismissNotificationAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (id: string): Promise<void> => {
          identifier(id);

          const scheduled = this.store.schedules();

          for (const item of await notificationManager.getActiveNotifications()) {
            if (presentedNotification(item, scheduled).request.identifier === id && item.id !== undefined) {
              await notificationManager.cancel(item.id, item.label);
            }
          }
        }),
      )
      .asyncFunction('dismissAllNotificationsAsync', (): Promise<void> => notificationManager.cancelAll());
  }
}

export class ExpoNotificationsEmitter extends NotificationsModule {
  private observing: boolean = false;
  private delivered?: NotificationResponse;
  private received: NotificationReceiver = (notification: Notification): void => {
    this.sendEvent('onDidReceiveNotification', notification);
  };
  private response: ResponseReceiver = (response: NotificationResponse): void => {
    if (!this.observing) return;

    this.delivered = response;
    this.sendEvent('onDidReceiveNotificationResponse', response);
  };

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationsEmitter')
      .events(['onDidReceiveNotification', 'onDidReceiveNotificationResponse', 'onDidClearNotificationResponse', 'onNotificationsDeleted'])
      .onCreate((): void => {
        this.listen(this.received);
        this.store.responses.add(this.response);
      })
      .onDestroy((): void => {
        this.unlisten(this.received);
        this.store.responses.delete(this.response);
      })
      .onStartObserving('onDidReceiveNotificationResponse', (): void => {
        this.observing = true;
        const response = this.store.lastResponse;
        if (response !== null && response !== this.delivered) this.response(response);
      })
      .onStopObserving('onDidReceiveNotificationResponse', (): void => {
        this.observing = false;
      })
      .syncFunction('getLastNotificationResponse', (): NotificationResponse | null => this.store.lastResponse)
      .syncFunction('clearLastNotificationResponse', (): void => {
        this.store.lastResponse = null;
      });
  }
}

class PendingNotification {
  readonly notification: Notification;
  readonly timer: number;

  constructor(notification: Notification, timer: number) {
    this.notification = notification;
    this.timer = timer;
  }
}

export class ExpoNotificationsHandlerModule extends NotificationsModule {
  private pending: Map<string, PendingNotification> = new Map();
  private received: NotificationReceiver = (notification: Notification): void => {
    const id = notification.request.identifier;
    const previous = this.pending.get(id);
    if (previous !== undefined) this.expire(id, previous);

    const timer = setTimeout((): void => {
      const current = this.pending.get(id);
      if (current !== undefined) this.expire(id, current);
    }, HANDLER_TIMEOUT_MS);

    this.pending.set(id, new PendingNotification(notification, timer));
    const payload: Record<string, ESObject> = { 'id': id, 'notification': notification };
    this.sendEvent('onHandleNotification', payload);
  };

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationsHandlerModule')
      .events(['onHandleNotification', 'onHandleNotificationTimeout'])
      .onCreate((): void => {
        this.listen(this.received);
      })
      .onDestroy((): void => {
        this.unlisten(this.received);
        this.pending.forEach((entry: PendingNotification): void => clearTimeout(entry.timer));
        this.pending.clear();
      })
      .asyncFunction(
        'handleNotificationAsync',
        ExpoFunction.typed2(ExpoValueTypes.string(), NotificationRecord, async (id: string, input: ESObject): Promise<void> => {
          const pending = this.pending.get(id);
          if (pending === undefined) {
            throw new ExpoModuleError('ERR_NOTIFICATION_HANDLED', 'The notification handler expired or already completed.');
          }

          const behavior = record(input, 'behavior');
          validateBehavior(behavior);

          clearTimeout(pending.timer);
          this.pending.delete(id);

          await this.queue((): Promise<void> => publishNotification(this.context.uiAbilityContext, this.store, pending.notification, behavior));
        }),
      );
  }

  private expire(id: string, entry: PendingNotification): void {
    clearTimeout(entry.timer);
    this.pending.delete(id);
    const payload: Record<string, ESObject> = { 'id': id, 'notification': entry.notification };
    this.sendEvent('onHandleNotificationTimeout', payload);
  }
}

export class ExpoNotificationCategoriesModule extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationCategoriesModule')
      .asyncFunction('getNotificationCategoriesAsync', async (): Promise<NotificationCategory[]> => this.store.categories())
      .asyncFunction(
        'setNotificationCategoryAsync',
        ExpoFunction.typed3(
          ExpoValueTypes.string(),
          NotificationActions,
          NotificationRecord.optional(),
          (id: string, actions: NotificationAction[], options?: Record<string, ESObject>): Promise<NotificationCategory> =>
            this.queue(async (): Promise<NotificationCategory> => {
              identifier(id);
              validateActions(actions, options);

              const category: NotificationCategory = { identifier: id, actions };
              const categories = this.store.categories().filter((item: NotificationCategory): boolean => item.identifier !== id);

              await this.store.write('categories', categories.concat([category]));

              return category;
            }),
        ),
      )
      .asyncFunction(
        'deleteNotificationCategoryAsync',
        ExpoFunction.typed1(
          ExpoValueTypes.string(),
          (id: string): Promise<boolean> =>
            this.queue(async (): Promise<boolean> => {
              identifier(id);

              const categories = this.store.categories();
              const remaining = categories.filter((item: NotificationCategory): boolean => item.identifier !== id);
              if (remaining.length === categories.length) return false;

              await this.store.write('categories', remaining);

              return true;
            }),
        ),
      );
  }
}

export class ExpoBackgroundNotificationTasksModule extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoBackgroundNotificationTasksModule')
      .asyncFunction(
        'registerTaskAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (_name: string): Promise<void> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Background notification tasks are not supported on HarmonyOS.');
        }),
      )
      .asyncFunction(
        'unregisterTaskAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (_name: string): Promise<void> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Background notification tasks are not supported on HarmonyOS.');
        }),
      );
  }
}

export class NotificationsServerRegistrationModule extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('NotificationsServerRegistrationModule')
      .asyncFunction('getInstallationIdAsync', async (): Promise<string> => {
        throw new ExpoModuleError(EXPO_SERVICE_ERROR, 'Expo Push Service is not supported on HarmonyOS. Use Huawei Push Kit.');
      })
      .asyncFunction('getRegistrationInfoAsync', async (): Promise<string> => {
        throw new ExpoModuleError(EXPO_SERVICE_ERROR, 'Expo Push Service is not supported on HarmonyOS. Use Huawei Push Kit.');
      })
      .asyncFunction(
        'setRegistrationInfoAsync',
        ExpoFunction.typed1(ExpoValueTypes.string().nullable(), async (_info: string | null): Promise<void> => {
          throw new ExpoModuleError(EXPO_SERVICE_ERROR, 'Expo Push Service is not supported on HarmonyOS. Use Huawei Push Kit.');
        }),
      );
  }
}

export class ExpoNotificationChannelManager extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationChannelManager')
      .asyncFunction('getNotificationChannelsAsync', async (): Promise<ESObject> => {
        throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channels are not supported on HarmonyOS.');
      })
      .asyncFunction(
        'getNotificationChannelAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (_id: string): Promise<ESObject> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channels are not supported on HarmonyOS.');
        }),
      )
      .asyncFunction(
        'setNotificationChannelAsync',
        ExpoFunction.typed2(ExpoValueTypes.string(), NotificationRecord, async (_id: string, _value: ESObject): Promise<ESObject> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channels are not supported on HarmonyOS.');
        }),
      )
      .asyncFunction(
        'deleteNotificationChannelAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (_id: string): Promise<void> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channels are not supported on HarmonyOS.');
        }),
      );
  }
}

export class ExpoNotificationChannelGroupManager extends NotificationsModule {
  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoNotificationChannelGroupManager')
      .asyncFunction('getNotificationChannelGroupsAsync', async (): Promise<ESObject> => {
        throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channel groups are not supported on HarmonyOS.');
      })
      .asyncFunction(
        'getNotificationChannelGroupAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (_id: string): Promise<ESObject> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channel groups are not supported on HarmonyOS.');
        }),
      )
      .asyncFunction(
        'setNotificationChannelGroupAsync',
        ExpoFunction.typed2(ExpoValueTypes.string(), NotificationRecord, async (_id: string, _value: ESObject): Promise<ESObject> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channel groups are not supported on HarmonyOS.');
        }),
      )
      .asyncFunction(
        'deleteNotificationChannelGroupAsync',
        ExpoFunction.typed1(ExpoValueTypes.string(), async (_id: string): Promise<void> => {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channel groups are not supported on HarmonyOS.');
        }),
      );
  }
}
