import { ExpoAppLifecycleState, ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { BusinessError } from '@kit.BasicServicesKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { userAuth } from '@kit.UserAuthenticationKit';
import { BiometricsSecurityLevel, LOCAL_AUTHENTICATION_OPTIONS, LocalAuthenticationOptions } from './LocalAuthenticationOptions';
import {
  authenticationResult,
  AuthenticationType,
  availability,
  BIOMETRIC_TYPES,
  hasEnrolledBiometrics,
  isEnrolled,
  LocalAuthenticationResult,
  SecurityLevel,
  STRONG_TRUST_LEVEL,
  supportedAuthenticationTypes,
  WEAK_TRUST_LEVEL,
} from './LocalAuthenticationUtils';

const MAX_PROMPT_LENGTH: number = 500;
const MAX_NAVIGATION_LABEL_LENGTH: number = 60;
const CHALLENGE_BYTES: number = 32;

export class ExpoLocalAuthenticationModule extends ExpoModule {
  private cancel?: (error: string) => void = undefined;
  private destroyed: boolean = false;

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoLocalAuthentication')
      .asyncFunction('hasHardwareAsync', async (): Promise<boolean> => supportedAuthenticationTypes().length > 0)
      .asyncFunction('supportedAuthenticationTypesAsync', async (): Promise<AuthenticationType[]> => supportedAuthenticationTypes())
      .asyncFunction('isEnrolledAsync', async (): Promise<boolean> => hasEnrolledBiometrics(WEAK_TRUST_LEVEL))
      .asyncFunction('getEnrolledLevelAsync', async (): Promise<SecurityLevel> => {
        if (hasEnrolledBiometrics(STRONG_TRUST_LEVEL)) return SecurityLevel.BIOMETRIC_STRONG;
        if (hasEnrolledBiometrics(WEAK_TRUST_LEVEL)) return SecurityLevel.BIOMETRIC_WEAK;

        const status = availability(userAuth.UserAuthType.PIN, WEAK_TRUST_LEVEL);

        if (isEnrolled(status) || status === userAuth.UserAuthResultCode.PIN_EXPIRED) return SecurityLevel.SECRET;

        return SecurityLevel.NONE;
      })
      .asyncFunction(
        'authenticateAsync',
        ExpoFunction.typed1(
          LOCAL_AUTHENTICATION_OPTIONS,
          (options: LocalAuthenticationOptions): Promise<LocalAuthenticationResult> => this.authenticate(options),
        ),
      )
      .asyncFunction('cancelAuthenticate', async (): Promise<void> => {
        this.cancel?.('user_cancel');
      })
      .onPrepareForReload(async (): Promise<void> => this.destroy())
      .onAbilityDestroy((): void => this.destroy())
      .onDestroy((): void => this.destroy());
  }

  private async authenticate(options: LocalAuthenticationOptions): Promise<LocalAuthenticationResult> {
    if (this.destroyed || !this.context.isValid || this.context.isHeadless || this.context.appLifecycleState !== ExpoAppLifecycleState.FOREGROUND) {
      return { success: false, error: 'invalid_context' };
    }
    if (this.cancel) return { success: false, error: 'app_cancel' };

    if (options.promptMessage.length === 0 || options.promptMessage.length > MAX_PROMPT_LENGTH) {
      throw new ExpoModuleError('ERR_LOCAL_AUTHENTICATION_INVALID_ARGUMENT', `promptMessage must contain 1 to ${MAX_PROMPT_LENGTH} characters.`);
    }

    const level = options.biometricsSecurityLevel === BiometricsSecurityLevel.STRONG ? STRONG_TRUST_LEVEL : WEAK_TRUST_LEVEL;
    const candidates: userAuth.UserAuthType[] = BIOMETRIC_TYPES.slice();
    if (!options.disableDeviceFallback) candidates.push(userAuth.UserAuthType.PIN);

    const types: userAuth.UserAuthType[] = [];
    let missing = false;

    for (const type of candidates) {
      const status = availability(type, level);

      if (isEnrolled(status)) types.push(type);
      if (status === userAuth.UserAuthResultCode.NOT_ENROLLED) missing = true;
    }

    if (types.length === 0) return { success: false, error: missing ? 'not_enrolled' : 'not_available' };

    const widget: userAuth.WidgetParam = { title: options.promptMessage };

    // At API 13 the custom navigation button only supports a single biometric.
    if (types.length === 1 && types[0] !== userAuth.UserAuthType.PIN) {
      if (options.cancelLabel.length > MAX_NAVIGATION_LABEL_LENGTH) {
        throw new ExpoModuleError(
          'ERR_LOCAL_AUTHENTICATION_INVALID_ARGUMENT',
          `cancelLabel must not exceed ${MAX_NAVIGATION_LABEL_LENGTH} characters.`,
        );
      }

      widget.navigationButtonText = options.cancelLabel;
    }

    let auth: userAuth.UserAuthInstance;

    try {
      auth = userAuth.getUserAuthInstance(
        {
          challenge: cryptoFramework.createRandom().generateRandomSync(CHALLENGE_BYTES).data,
          authType: types,
          authTrustLevel: level,
        },
        widget,
      );
    } catch (error) {
      return authenticationResult((error as BusinessError).code);
    }

    return new Promise<LocalAuthenticationResult>((resolve): void => {
      let settled = false;
      let listening = false;

      const finish = (result: LocalAuthenticationResult): void => {
        if (settled) return;

        settled = true;
        if (this.cancel === cancel) this.cancel = undefined;

        if (listening) {
          try {
            auth.off('result', callback);
          } catch (error) {
            this.warn('detach authentication listener', error as BusinessError);
          }

          listening = false;
        }

        resolve(result);
      };

      const callback: userAuth.IAuthCallback = {
        onResult: (result: userAuth.UserAuthResult): void => finish(authenticationResult(result.result)),
      };

      const cancel = (error: string): void => {
        if (settled) return;

        // Settle and detach first: cancel() can deliver the callback synchronously.
        finish({ success: false, error });

        try {
          auth.cancel();
        } catch (error) {
          this.warn('cancel authentication', error as BusinessError);
        }
      };

      this.cancel = cancel;

      try {
        auth.on('result', callback);
        listening = true;

        auth.start();
      } catch (error) {
        finish(authenticationResult((error as BusinessError).code));

        try {
          auth.cancel();
        } catch (error) {
          this.warn('cancel failed authentication', error as BusinessError);
        }
      }
    });
  }

  private destroy(): void {
    this.destroyed = true;
    this.cancel?.('app_cancel');
  }

  private warn(action: string, error: BusinessError): void {
    console.warn(`ExpoLocalAuthentication: unable to ${action} (${error.code}).`);
  }
}
