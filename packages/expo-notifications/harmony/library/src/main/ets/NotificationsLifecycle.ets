import { AbilityLifecycleCallback, UIAbility, Want, wantConstant } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { util } from '@kit.ArkTS';
import { pushCommon, pushService } from '@kit.PushKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { ExpoAbilityLifecycleSubscriber, ExpoAppLifecycleSubscriber, ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { NotificationsStore } from './NotificationsStore';
import { DEFAULT_ACTION, RESPONSE_KEY, PUSH_LISTENER_ACTION, NotificationResponse, record, integer, pushNotification, parseResponse } from './NotificationTypes';

const NOTIFICATION_LAUNCH_REASON = 'ReasonMessage_Notification';
const SYSTEM_WANT_KEYS = new Set<string>(Object.values(wantConstant.Params));

function report(error: Object): void {
  hilog.error(0, 'ExpoNotifications', 'Notification lifecycle operation failed (code %{public}s).', String((error as BusinessError).code ?? 'invalid-payload'));
}

function captureResponse(want: Want, store: NotificationsStore): void {
  const serialized = want.parameters?.[RESPONSE_KEY];
  if (typeof serialized === 'string') {
    try {
      store.respond(parseResponse(serialized));
    } catch (error) {
      report(error as Object);
    }

    return;
  }

  if (want.parameters?.[wantConstant.Params.LAUNCH_REASON_MESSAGE] !== NOTIFICATION_LAUNCH_REASON) return;

  // Push Kit flattens clickAction.data into Want parameters alongside system keys.
  const data: Record<string, ESObject> = {};
  Object.keys(want.parameters ?? {}).forEach((key: string): void => {
    if (!SYSTEM_WANT_KEYS.has(key)) data[key] = want.parameters?.[key];
  });

  const response: NotificationResponse = {
    actionIdentifier: DEFAULT_ACTION,
    notification: pushNotification(util.generateRandomUUID(), null, null, data, Date.now()),
  };
  response.notification.request.content['sound'] = null;

  store.respond(response);
}

export class ExpoNotificationsAbilityLifecycleSubscriber extends ExpoAbilityLifecycleSubscriber {
  onCreate(want: Want): void { captureResponse(want, NotificationsStore.get(this.context)); }
  onNewWant(want: Want): void { captureResponse(want, NotificationsStore.get(this.context)); }
}

class PushLifecycle extends AbilityLifecycleCallback {
  private receiver?: UIAbility;
  private ability?: UIAbility;
  private listener?: (token: string) => void;

  onAbilityCreate(ability: UIAbility): void {
    if (!ability.context.abilityInfo.metadata?.some((entry): boolean => entry.name === PUSH_LISTENER_ACTION && entry.value === 'true')) return;
    if (this.ability === ability && this.listener !== undefined) return;
    if (this.ability !== undefined && this.ability !== ability) this.onAbilityDestroy(this.ability);

    this.ability = ability;
    const store = NotificationsStore.get(ability.context);

    try {
      if (this.receiver !== ability) {
        pushService.receiveMessage('DEFAULT', ability, (payload: pushCommon.PushPayload): void => {
          const current = this.ability;
          if (current === undefined || payload.type !== 'ALERT') return;

          try {
            const envelope = record(JSON.parse(payload.data), 'Push Kit payload');
            const source = record(envelope.notification, 'Push Kit notification');
            const click: Record<string, ESObject> = source.clickAction === undefined ? {} : record(source.clickAction, 'clickAction');
            const data: Record<string, ESObject> = click.data === undefined ? {} : record(click.data, 'clickAction.data');

            for (const field of ['title', 'body']) {
              if (source[field] !== undefined && source[field] !== null && typeof source[field] !== 'string') {
                throw new ExpoModuleError('ERR_NOTIFICATIONS_INVALID_ARGUMENT', `Push Kit ${field} must be a string.`);
              }
            }

            const id = source.notifyId === undefined ? util.generateRandomUUID() :
              String(integer(source.notifyId, 'Push Kit notifyId', 0, 2147483647));
            const notification = pushNotification(id, source.title ?? null, source.body ?? null, data, Date.now());

            store.receive(current.context, notification);
          } catch (error) {
            report(error as Object);
          }
        });
        this.receiver = ability;
      }

      this.listener = (token: string): void => {
        store.run(async (): Promise<void> => {
          if (store.lastToken !== undefined) await store.updateToken(token);
        }).catch((error: Object): void => report(error));
      };
      pushService.on('tokenUpdate', ability, this.listener);
    } catch (error) {
      this.listener = undefined;
      report(error as Object);
    }
  }

  onAbilityDestroy(ability: UIAbility): void {
    if (this.ability !== ability) return;

    if (this.listener !== undefined) {
      try {
        pushService.off('tokenUpdate', this.listener);
      } catch (error) {
        report(error as Object);
      }
    }

    this.listener = undefined;
    this.ability = undefined;
    // DEFAULT binds the Ability's callee and has no public off API. Register
    // once for each new Ability, matching the documented onCreate integration.
    this.receiver = undefined;
  }

  onWindowStageCreate(_ability: UIAbility, _stage: window.WindowStage): void {}
  onWindowStageActive(_ability: UIAbility, _stage: window.WindowStage): void {}
  onWindowStageInactive(_ability: UIAbility, _stage: window.WindowStage): void {}
  onWindowStageDestroy(_ability: UIAbility, _stage: window.WindowStage): void {}
  onAbilityForeground(_ability: UIAbility): void {}
  onAbilityBackground(_ability: UIAbility): void {}
  onAbilityContinue(_ability: UIAbility): void {}
}

export class ExpoNotificationsAppLifecycleSubscriber extends ExpoAppLifecycleSubscriber {
  onCreate(): void {
    this.context.on('abilityLifecycle', new PushLifecycle());
  }
}
