import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { reminderAgentManager } from '@kit.BackgroundTasksKit';
import { integer, record } from './NotificationTypes';

const MAX_DATE = 8640000000000000;
const MILLISECONDS_PER_SECOND = 1000;
const MONTHS_IN_YEAR = 12;
const GREGORIAN_CYCLE_YEARS = 400;

export function validateTrigger(value: ESObject): Record<string, ESObject> | null {
  if (value === null) return null;

  const trigger = record(value, 'trigger');
  if (trigger.channelId !== undefined) {
    throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Android notification channels are not supported on HarmonyOS.');
  }

  switch (trigger.type) {
    case 'date':
      integer(trigger.timestamp, 'timestamp (milliseconds)', 0, MAX_DATE);
      break;
    case 'timeInterval':
      integer(trigger.seconds, 'seconds', 1, Math.floor(MAX_DATE / MILLISECONDS_PER_SECOND));
      if (trigger.repeats !== undefined && typeof trigger.repeats !== 'boolean') {
        throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'repeats must be a boolean.');
      }
      if (trigger.repeats === true) {
        throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'Repeating time interval triggers are not supported on HarmonyOS.');
      }
      break;
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'yearly':
      integer(trigger.hour, 'hour', 0, 23);
      integer(trigger.minute, 'minute', 0, 59);
      if (trigger.type === 'weekly') integer(trigger.weekday, 'weekday', 1, 7);
      if (trigger.type === 'monthly' || trigger.type === 'yearly') integer(trigger.day, 'day', 1, 31);
      if (trigger.type === 'yearly') {
        integer(trigger.month, 'month', 0, 11);
        if (trigger.day > new Date(2000, trigger.month + 1, 0).getDate()) {
          throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'The requested day does not exist in that month.');
        }
      }
      break;
    case 'calendar':
      throw new ExpoModuleError('ERR_NOTIFICATIONS_UNSUPPORTED', 'iOS calendar pattern triggers are not supported on HarmonyOS.');
    default:
      throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', `Unknown notification trigger: ${String(trigger.type)}.`);
  }

  return trigger;
}

export function nextTriggerDate(trigger: Record<string, ESObject> | null, now: number = Date.now()): number | null {
  if (trigger === null) return null;

  if (trigger.type === 'date') return trigger.timestamp >= now ?
    Math.ceil(trigger.timestamp / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND : null;

  if (trigger.type === 'timeInterval') {
    const timestamp = now + trigger.seconds * MILLISECONDS_PER_SECOND;
    if (timestamp > MAX_DATE) {
      throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'The trigger date is outside the supported Date range.');
    }

    return timestamp;
  }

  const date = new Date(now);
  if (trigger.type === 'daily') {
    const today = new Date(date.getFullYear(), date.getMonth(), date.getDate(), trigger.hour as number, trigger.minute as number);

    return today.getTime() >= now ? today.getTime() :
      new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, trigger.hour as number, trigger.minute as number).getTime();
  }

  if (trigger.type === 'weekly') {
    const offset: number = (trigger.weekday - 1 - date.getDay() + 7) % 7;
    const current = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, trigger.hour as number, trigger.minute as number);

    return current.getTime() >= now ? current.getTime() :
      new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset + 7, trigger.hour as number, trigger.minute as number).getTime();
  }

  // Scan real calendar months, skipping absent days rather than overflowing
  // February 31 into March. A Gregorian cycle contains every leap-day case.
  for (let offset = 0; offset <= GREGORIAN_CYCLE_YEARS * MONTHS_IN_YEAR; offset++) {
    const month = new Date(date.getFullYear(), date.getMonth() + offset, 1);
    if (trigger.type === 'yearly' && month.getMonth() !== trigger.month) continue;

    const candidate = new Date(month.getFullYear(), month.getMonth(), trigger.day as number,
      trigger.hour as number, trigger.minute as number, 0, 0);
    if (candidate.getMonth() === month.getMonth() && candidate.getTime() >= now) return candidate.getTime();
  }

  return null;
}

export function reminderTrigger(trigger: Record<string, ESObject>, now: number): reminderAgentManager.ReminderRequest {
  const next = nextTriggerDate(trigger, now);
  if (next === null) {
    throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', 'Cannot schedule a notification in the past.');
  }

  if (trigger.type === 'timeInterval') {
    const timer: reminderAgentManager.ReminderRequestTimer = {
      reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_TIMER,
      triggerTimeInSeconds: trigger.seconds as number,
    };

    return timer;
  }

  // Agent reminders have second resolution. Round up, never deliver early.
  const date = new Date(Math.ceil((next as number) / MILLISECONDS_PER_SECOND) * MILLISECONDS_PER_SECOND);
  const request: reminderAgentManager.ReminderRequestCalendar = {
    reminderType: reminderAgentManager.ReminderType.REMINDER_TYPE_CALENDAR,
    dateTime: {
      year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(),
      hour: date.getHours(), minute: date.getMinutes(), second: date.getSeconds(),
    },
  };

  if (trigger.type === 'daily') request.daysOfWeek = [1, 2, 3, 4, 5, 6, 7];
  if (trigger.type === 'weekly') request.daysOfWeek = [trigger.weekday === 1 ? 7 : trigger.weekday - 1];
  if (trigger.type === 'monthly' || trigger.type === 'yearly') {
    request.repeatMonths = trigger.type === 'yearly' ? [trigger.month + 1] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    request.repeatDays = [trigger.day as number];
  }

  return request;
}
