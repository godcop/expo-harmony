import { ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { asset } from '@kit.AssetStoreKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { userAuth } from '@kit.UserAuthenticationKit';

import { ExpoSecureStoreError } from './ExpoSecureStoreError';
import { encode, sha256 } from './SecureStoreOptions';

const BIOMETRIC_TYPES: userAuth.UserAuthType[] = [userAuth.UserAuthType.FACE, userAuth.UserAuthType.FINGERPRINT];
const TRUST_LEVEL: userAuth.AuthTrustLevel = userAuth.AuthTrustLevel.ATL3;
const MAX_PROMPT_LENGTH: number = 500;

export function availableBiometrics(): userAuth.UserAuthType[] {
  const available: userAuth.UserAuthType[] = [];

  for (const type of BIOMETRIC_TYPES) {
    try {
      userAuth.getAvailableStatus(type, TRUST_LEVEL);
      available.push(type);
    } catch (error) {
      const code = (error as BusinessError).code;

      if (
        code !== userAuth.UserAuthResultCode.TYPE_NOT_SUPPORT &&
        code !== userAuth.UserAuthResultCode.TRUST_LEVEL_NOT_SUPPORT &&
        code !== userAuth.UserAuthResultCode.NOT_ENROLLED
      )
        throw new ExpoSecureStoreError(error as Object);
    }
  }

  return available;
}

export function assertBiometricsAvailable(): userAuth.UserAuthType[] {
  const types = availableBiometrics();
  if (types.length === 0) {
    throw new ExpoModuleError('ERR_SECURE_STORE_AUTH_UNAVAILABLE', 'No enrolled biometric authenticator supports ATL3.');
  }

  return types;
}

export function credentialSnapshot(): Uint8Array {
  const states: number[] = [];

  for (const type of BIOMETRIC_TYPES) {
    try {
      const state = userAuth.getEnrolledState(type);
      states.push(type, state.credentialDigest, state.credentialCount);
    } catch (error) {
      const code = (error as BusinessError).code;

      if (code !== userAuth.UserAuthResultCode.TYPE_NOT_SUPPORT && code !== userAuth.UserAuthResultCode.NOT_ENROLLED)
        throw new ExpoSecureStoreError(error as Object);

      states.push(type, 0, 0);
    }
  }

  return sha256(encode(JSON.stringify(states)));
}

export function credentialsMatch(item: asset.AssetMap): boolean {
  const stored = item.get(asset.Tag.DATA_LABEL_CRITICAL_1);
  if (!(stored instanceof Uint8Array)) throw new ExpoModuleError('ERR_SECURE_STORE_DECODE', 'Missing biometric enrollment state.');

  const current = credentialSnapshot();
  if (stored.length !== current.length) throw new ExpoModuleError('ERR_SECURE_STORE_DECODE', 'Invalid biometric enrollment state.');

  return stored.every((value: number, index: number): boolean => value === current[index]);
}

export class SecureStoreAuthentication {
  private readonly cancellations: Set<() => void> = new Set();

  authenticate(challenge: Uint8Array, prompt: string): Promise<Uint8Array> {
    if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH) {
      throw new ExpoModuleError('ERR_SECURE_STORE_INVALID_ARGUMENT', `authenticationPrompt must contain 1 to ${MAX_PROMPT_LENGTH} characters.`);
    }

    const instance = userAuth.getUserAuthInstance(
      {
        challenge,
        authType: assertBiometricsAvailable(),
        authTrustLevel: TRUST_LEVEL,
      },
      { title: prompt },
    );

    return new Promise<Uint8Array>((resolve, reject): void => {
      let settled = false;

      const finish = (token?: Uint8Array, failure?: Object): void => {
        if (settled) return;

        settled = true;
        this.cancellations.delete(cancel);

        try {
          instance.off('result', callback);
        } catch (error) {
          console.warn(`Unable to detach SecureStore authentication listener: ${(error as BusinessError).code}`);
        }

        if (failure !== undefined) reject(failure);
        else if (token !== undefined && token.length > 0) resolve(token);
        else reject(new ExpoModuleError('ERR_SECURE_STORE_AUTH_FAILED', 'Authentication returned no token.'));
      };

      const callback: userAuth.IAuthCallback = {
        onResult: (result: userAuth.UserAuthResult): void => {
          if (result.result === userAuth.UserAuthResultCode.SUCCESS) finish(result.token);
          else finish(undefined, new ExpoModuleError('ERR_SECURE_STORE_AUTH_FAILED', `Biometric authentication failed (${result.result}).`));
        },
      };

      const cancel = (): void => {
        // cancel() may synchronously deliver a result; settle before invoking it.
        finish(undefined, new ExpoModuleError('ERR_SECURE_STORE_DESTROYED', 'SecureStore was destroyed during authentication.'));

        try {
          instance.cancel();
        } catch (error) {
          console.warn(`Unable to cancel SecureStore authentication: ${(error as BusinessError).code}`);
        }
      };

      this.cancellations.add(cancel);

      try {
        instance.on('result', callback);
        instance.start();
      } catch (error) {
        finish(undefined, error as Object);

        try {
          instance.cancel();
        } catch (failure) {
          console.warn(`Unable to cancel failed SecureStore authentication: ${(failure as BusinessError).code}`);
        }
      }
    });
  }

  cancelAll(): void {
    this.cancellations.forEach((cancel: () => void): void => cancel());
    this.cancellations.clear();
  }
}
