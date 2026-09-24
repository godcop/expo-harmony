import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { common, wantAgent, WantAgent } from '@kit.AbilityKit';
import { notificationManager } from '@kit.NotificationKit';
import { NotificationsStore } from './NotificationsStore';
import { DEFAULT_ACTION, RESPONSE_KEY, MAX_ACTION_BUTTONS, Notification, NotificationResponse, NotificationAction, NotificationCategory, ScheduledNotification, pushNotification, notificationSlot, parseResponse } from './NotificationTypes';

// NotificationFlagStatus is an SDK type but is not re-exported by NotificationKit.
const FLAG_DEFAULT = 0;
const FLAG_DISABLED = 2;

export function responseParameters(notification: Notification, action: string = DEFAULT_ACTION): Record<string, Object> {
  const response: NotificationResponse = { actionIdentifier: action, notification };
  const parameters: Record<string, Object> = {};
  parameters[RESPONSE_KEY] = JSON.stringify(response);

  return parameters;
}

async function clickAgent(context: common.UIAbilityContext, notification: Notification, id: number, action: string, index: number): Promise<WantAgent> {
  return wantAgent.getWantAgent({
    wants: [{
      bundleName: context.abilityInfo.bundleName,
      abilityName: context.abilityInfo.name,
      action,
      parameters: responseParameters(notification, action),
    }],
    operationType: wantAgent.OperationType.START_ABILITY,
    requestCode: id * (MAX_ACTION_BUTTONS + 1) + index,
    wantAgentFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG],
  });
}

export function validateBehavior(value: Record<string, ESObject>): void {
  for (const key of ['shouldShowBanner', 'shouldShowList', 'shouldShowAlert', 'shouldPlaySound', 'shouldSetBadge']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', `${key} must be a boolean.`);
    }
  }
  if (value.priority !== undefined) {
    throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification priority is not supported on HarmonyOS.');
  }
  if (value.shouldShowBanner === true && value.shouldShowList === false) {
    throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Banner-only notifications without a notification-center entry are not supported on HarmonyOS.');
  }
}

export async function publishNotification(context: common.UIAbilityContext, store: NotificationsStore,
  notification: Notification, behavior?: Record<string, ESObject>): Promise<void> {
  const content = notification.request.content;
  if (behavior !== undefined) {
    validateBehavior(behavior);
    if (behavior.shouldSetBadge === true && content.badge !== undefined) {
      await notificationManager.setBadgeNumber(content.badge as number);
    }

    const banner: boolean = behavior.shouldShowBanner ?? behavior.shouldShowAlert ?? false;
    const list: boolean = behavior.shouldShowList ?? behavior.shouldShowAlert ?? false;
    if (!banner && !list) return;
  } else if (content.badge !== undefined) {
    await notificationManager.setBadgeNumber(content.badge as number);
  }

  const active = await notificationManager.getActiveNotifications();
  const previous = active.find((entry: notificationManager.NotificationRequest): boolean => entry.label === notification.request.identifier);
  const id = previous?.id ?? await store.allocateId();
  const category = store.categories().find((entry: NotificationCategory): boolean => entry.identifier === content.categoryIdentifier);

  const buttons: notificationManager.NotificationActionButton[] = [];
  for (const action of category?.actions ?? []) {
    buttons.push({ title: action.buttonTitle, wantAgent: await clickAgent(context, notification, id, action.identifier, buttons.length + 1) });
  }

  const request: notificationManager.NotificationRequest = {
    id,
    label: notification.request.identifier,
    notificationSlotType: notificationSlot(context),
    content: {
      notificationContentType: notificationManager.ContentType.NOTIFICATION_CONTENT_BASIC_TEXT,
      normal: { title: content.title ?? '', text: content.body ?? '', additionalText: content.subtitle ?? '' },
    },
    deliveryTime: notification.date,
    tapDismissed: content.autoDismiss !== false,
    wantAgent: await clickAgent(context, notification, id, DEFAULT_ACTION, 0),
    actionButtons: buttons,
    extraInfo: responseParameters(notification),
    notificationFlags: {
      soundEnabled: content.sound === null || (behavior !== undefined && behavior.shouldPlaySound !== true)
        ? FLAG_DISABLED : FLAG_DEFAULT,
      bannerEnabled: behavior !== undefined && !(behavior.shouldShowBanner ?? behavior.shouldShowAlert ?? false)
        ? FLAG_DISABLED : FLAG_DEFAULT,
    },
  };

  await notificationManager.publish(request);
}

export function presentedNotification(request: notificationManager.NotificationRequest, schedules: ScheduledNotification[]): Notification {
  const serialized: ESObject = request.extraInfo?.[RESPONSE_KEY];
  if (typeof serialized === 'string') {
    try {
      return parseResponse(serialized).notification;
    } catch (_) { /* Notifications from other publishers need not use our metadata. */ }
  }

  const scheduled = schedules.find((entry: ScheduledNotification): boolean => entry.notificationId === request.id);
  if (scheduled !== undefined) return { date: request.deliveryTime ?? Date.now(), request: scheduled.request };

  const normal = request.content.normal ?? request.content.longText ?? request.content.multiLine;
  // System Push Kit notifications do not expose clickAction.data through this API.
  const data: Record<string, ESObject> = {};
  const notification = pushNotification(request.label || String(request.id), normal?.title ?? null,
    normal?.text ?? null, data, request.deliveryTime ?? Date.now());
  notification.request.content['subtitle'] = normal?.additionalText ?? null;
  notification.request.content['sound'] = null;

  return notification;
}

export function validateActions(actions: NotificationAction[], options?: Record<string, ESObject>): void {
  if (!Array.isArray(actions) || actions.length > MAX_ACTION_BUTTONS) {
    throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'HarmonyOS supports at most two notification action buttons.');
  }

  const ids = new Set<string>();
  for (const action of actions) {
    if (!action || typeof action.identifier !== 'string' || !action.identifier || !action.buttonTitle || typeof action.buttonTitle !== 'string') {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'Notification actions require an identifier and buttonTitle.');
    }
    if (ids.has(action.identifier) || action.identifier === DEFAULT_ACTION) {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'Notification action identifiers must be unique and not reserved.');
    }
    if (action.textInput !== undefined) {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Text input notification actions are not supported on HarmonyOS.');
    }
    if (action.options?.opensAppToForeground === false || action.options?.isAuthenticationRequired === true || action.options?.isDestructive === true) {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Background, authenticated, or destructive notification actions are not supported on HarmonyOS.');
    }

    ids.add(action.identifier);
  }

  if (options !== undefined && Object.keys(options).some((key: string): boolean => options[key] !== undefined)) {
    throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'iOS notification category options are not supported on HarmonyOS.');
  }
}
