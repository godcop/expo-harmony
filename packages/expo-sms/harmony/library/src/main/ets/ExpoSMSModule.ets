import { Want } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { sms } from '@kit.TelephonyKit';
import {
  ExpoAppLifecycleState,
  ExpoFunction,
  ExpoModule,
  ExpoModuleDefinition,
  ExpoModuleError,
  ExpoValueTypes,
} from '@expo-harmony/expo-modules-core';

import { SMS_OPTIONS } from './SMSOptions';

const CAPABILITY: string = 'SystemCapability.Telephony.SmsMms';
const BUNDLE: string = 'com.ohos.mms';
const ACTION: string = 'ohos.want.action.viewData';

interface SMSResponse {
  result: string;
}

class SMSRequest {
  started: boolean = false;
  backgrounded: boolean = false;
  returned: boolean = false;
  resolve: (response: SMSResponse) => void;
  reject: (error: ExpoModuleError) => void;

  constructor(resolve: (response: SMSResponse) => void, reject: (error: ExpoModuleError) => void) {
    this.resolve = resolve;
    this.reject = reject;
  }
}

export class ExpoSMSModule extends ExpoModule {
  private pending?: SMSRequest;
  private destroyed: boolean = false;

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoSMS')
      .asyncFunction('isAvailableAsync', async (): Promise<boolean> => this.isAvailable())
      .asyncFunction(
        'sendSMSAsync',
        ExpoFunction.typed3(
          ExpoValueTypes.array(ExpoValueTypes.string()),
          ExpoValueTypes.string(),
          SMS_OPTIONS,
          (addresses: string[], message: string, options: Record<string, ESObject>): Promise<SMSResponse> =>
            this.sendSMS(addresses, message, options),
        ),
      )
      .onBackground((): void => {
        if (this.pending !== undefined) this.pending.backgrounded = true;
      })
      .onForeground((): void => {
        const request = this.pending;
        if (request === undefined || !request.backgrounded) return;

        request.returned = true;
        this.finish(request);
      })
      .onPrepareForReload(async (): Promise<void> => this.destroy())
      .onAbilityDestroy((): void => this.destroy())
      .onDestroy((): void => this.destroy());
  }

  private isAvailable(): boolean {
    return canIUse(CAPABILITY) && sms.hasSmsCapability();
  }

  private async sendSMS(addresses: string[], message: string, options: Record<string, ESObject>): Promise<SMSResponse> {
    if (this.destroyed) throw new ExpoModuleError('ERR_SMS_DESTROYED', 'The SMS module host was destroyed.');
    if (!this.isAvailable()) throw new ExpoModuleError('ERR_SMS_UNAVAILABLE', 'SMS service is not available.');
    if (this.pending !== undefined) {
      throw new ExpoModuleError('ERR_SMS_PENDING', 'SMS sending in progress, await the old request and then try again.');
    }
    if (this.context.isHeadless || this.context.appLifecycleState !== ExpoAppLifecycleState.FOREGROUND) {
      throw new ExpoModuleError('ERR_SMS_BACKGROUND', 'The SMS composer must be opened from a foreground application.');
    }

    const attachments = options['attachments'] as Record<string, ESObject>[] | undefined;
    if (attachments !== undefined && attachments.length > 0) {
      throw new ExpoModuleError('ERR_SMS_ATTACHMENTS_UNSUPPORTED', 'HarmonyOS does not expose SMS composer attachment parameters.');
    }

    const recipients = addresses.map((address: string): string => encodeURIComponent(address)).join(',');
    const want: Want = {
      bundleName: BUNDLE,
      action: ACTION,
      uri: `sms:${recipients}?body=${encodeURIComponent(message)}`,
    };

    return new Promise<SMSResponse>((resolve, reject): void => {
      const request = new SMSRequest(resolve, reject);
      this.pending = request;

      try {
        this.context.uiAbilityContext
          .startAbility(want)
          .then((): void => {
            request.started = true;
            this.finish(request);
          })
          .catch((error: BusinessError): void => this.fail(request, error));
      } catch (error) {
        this.fail(request, error as BusinessError);
      }
    });
  }

  private finish(request: SMSRequest): void {
    // Launch completion and the background/foreground callbacks can arrive in either order.
    if (this.pending !== request || !request.started || !request.returned) return;

    this.pending = undefined;

    request.resolve({ result: 'unknown' });
  }

  private fail(request: SMSRequest, error: BusinessError): void {
    if (this.pending !== request) return;

    this.pending = undefined;

    request.reject(new ExpoModuleError('ERR_SMS_SENDING', `Unable to open the SMS composer. ${error.code}: ${error.message}`, error));
  }

  private destroy(): void {
    const request = this.pending;

    this.destroyed = true;
    this.pending = undefined;

    request?.reject(new ExpoModuleError('ERR_SMS_DESTROYED', 'The SMS module host was destroyed while the composer was open.'));
  }
}
