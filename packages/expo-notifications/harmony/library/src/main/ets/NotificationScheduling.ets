import { ExpoAppLifecycleState, ExpoModuleContext, ExpoModuleError, ExpoPermissionStatus } from '@expo-harmony/expo-modules-core';
import { reminderAgentManager } from '@kit.BackgroundTasksKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { NotificationsStore } from './NotificationsStore';
import {
  notificationContent,
  identifier,
  REMINDER_PERMISSION,
  Notification,
  NotificationRequest,
  ScheduledNotification,
  notificationSlot,
} from './NotificationTypes';
import { validateTrigger, reminderTrigger, nextTriggerDate } from './NotificationTriggers';
import { publishNotification, responseParameters } from './NotificationPresentation';

const REMINDER_NOT_FOUND = 1700003;

async function cancelSystemReminder(id: number): Promise<void> {
  try {
    await reminderAgentManager.cancelReminder(id);
  } catch (error) {
    if ((error as BusinessError).code !== REMINDER_NOT_FOUND) {
      throw new ExpoModuleError(String((error as BusinessError).code ?? 'ERR_NOTIFICATIONS_SCHEDULE'), (error as Error).message, error as Object);
    }
  }
}

export async function schedule(context: ExpoModuleContext, store: NotificationsStore, id: string, input: ESObject, value: ESObject): Promise<string> {
  identifier(id);

  const content = notificationContent(input);
  const trigger = validateTrigger(value);

  const output = trigger === null ? null : recordTrigger(trigger);
  const request: NotificationRequest = { identifier: id, content, trigger: output };
  const notification: Notification = { date: Date.now(), request };

  if (trigger === null) {
    if (context.appLifecycleState === ExpoAppLifecycleState.FOREGROUND) store.receive(context.uiAbilityContext, notification);
    else await publishNotification(context.uiAbilityContext, store, notification);

    return id;
  }

  if (context.systemPermissionStatus(REMINDER_PERMISSION) !== ExpoPermissionStatus.GRANTED) {
    throw new ExpoModuleError(
      'ERR_NOTIFICATIONS_REMINDER_PERMISSION',
      'Scheduled notifications require ohos.permission.PUBLISH_AGENT_REMINDER. Declare this system_grant permission in the application manifest.',
    );
  }
  if (content.sound !== 'default') {
    throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Silent agent reminders are not supported on HarmonyOS; use the default sound.');
  }
  if (content.badge !== undefined || content.categoryIdentifier || content.sticky || content.subtitle) {
    throw new ExpoModuleError(
      'ERR_NOTIFICATIONS_UNSUPPORTED',
      'Badge, category, sticky, or subtitle fields on agent reminders are not supported on HarmonyOS.',
    );
  }

  const reminder = reminderTrigger(trigger, notification.date);
  notification.date = nextTriggerDate(trigger, notification.date) as number;
  if (trigger.type === 'date' && output !== null) output['value'] = notification.date;

  await store.validSchedules();
  const records = store.schedules();
  const old = records.find((entry: ScheduledNotification): boolean => entry.request.identifier === id);
  const native = old?.notificationId ?? (await store.allocateId());

  reminder.notificationId = native;
  reminder.title = content.title ?? '';
  reminder.content = content.body ?? '';
  reminder.expiredContent = content.body ?? '';
  reminder.ringDuration = 0;
  reminder.snoozeTimes = 0;
  reminder.tapDismissed = content.autoDismiss !== false;
  reminder.slotType = notificationSlot(context.uiAbilityContext);
  reminder.wantAgent = {
    pkgName: context.uiAbilityContext.abilityInfo.bundleName,
    abilityName: context.uiAbilityContext.abilityInfo.name,
    parameters: responseParameters(notification),
  };

  await cancelScheduled(store, id);
  const handle = await reminderAgentManager.publishReminder(reminder);
  const entry: ScheduledNotification = { reminderId: handle, notificationId: native, request };

  try {
    await store.write('scheduled', store.schedules().concat([entry]));
  } catch (error) {
    try {
      await cancelSystemReminder(handle);
    } catch (rollback) {
      throw new ExpoModuleError(
        'ERR_NOTIFICATIONS_SCHEDULE_ROLLBACK',
        `Could not persist or cancel reminder ${handle}; retry cancellation with the Expo identifier.`,
        rollback as Object,
      );
    }

    throw new ExpoModuleError(error instanceof ExpoModuleError ? error.code : 'ERR_NOTIFICATIONS_STORAGE', (error as Error).message, error as Object);
  }

  return id;
}

export async function cancelScheduled(store: NotificationsStore, id: string): Promise<void> {
  identifier(id);

  await store.validSchedules(true);

  for (const entry of store.schedules().filter((item: ScheduledNotification): boolean => item.request.identifier === id)) {
    await cancelSystemReminder(entry.reminderId);
    await store.write(
      'scheduled',
      store.schedules().filter((item: ScheduledNotification): boolean => item.reminderId !== entry.reminderId),
    );
  }
}

function recordTrigger(trigger: Record<string, ESObject>): Record<string, ESObject> {
  if (trigger.type === 'date') {
    // Match the upstream native serializer, whose output differs from JS input.
    const result: Record<string, ESObject> = {};
    result['type'] = 'date';
    result['value'] = trigger.timestamp;
    result['repeats'] = false;

    return result;
  }

  return JSON.parse(JSON.stringify(trigger)) as Record<string, ESObject>;
}
