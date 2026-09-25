import {
  ExpoFunction,
  ExpoModule,
  ExpoModuleContext,
  ExpoModuleDefinition,
  ExpoModuleError,
  ExpoValueType,
  ExpoValueTypes,
} from '@expo-harmony/expo-modules-core';
import { minorsProtection } from '@kit.AccountKit';
import { BusinessError } from '@kit.BasicServicesKit';

interface Response {
  lowerBound: number | null;
  upperBound: number | null;
}

const CAPABILITY: string = 'SystemCapability.AuthenticationServices.HuaweiID.MinorsProtection';

const REQUEST: ExpoValueType<Object> = ExpoValueTypes.custom<Object>(
  'Any',
  (value: ESObject): Object => value,
  (value: Object): ESObject => value,
);

export class ExpoAgeRangeModule extends ExpoModule {
  constructor(context: ExpoModuleContext) {
    super(context);
  }

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition().name('ExpoAgeRange').asyncFunction(
      'requestAgeRangeAsync',
      ExpoFunction.typed1(REQUEST, async (_options: Object): Promise<Response> => {
        return await this.request();
      }),
    );
  }

  private async request(): Promise<Response> {
    if (canIUse(CAPABILITY)) {
      let info: minorsProtection.MinorsProtectionInfo | undefined;

      try {
        if (minorsProtection.supportMinorsMode()) {
          info = await minorsProtection.getMinorsProtectionInfo();
        }
      } catch (error) {
        const failure = error as BusinessError;

        throw new ExpoModuleError(
          failure.code?.toString() ?? 'ERR_AGE_RANGE_REQUEST_FAILED',
          failure.message || 'Failed to request the age range from HarmonyOS.',
          error as Object,
        );
      }

      if (info === undefined) {
        throw new ExpoModuleError('ERR_AGE_RANGE_NOT_AVAILABLE', 'The Age Range service is not available');
      }

      const group = info.ageGroup;

      // Disabled youth mode does not prove adulthood.
      if (!info.minorsProtectionMode || group === undefined) {
        return { lowerBound: null, upperBound: null };
      }

      if (!Number.isSafeInteger(group.lowerAge) || !Number.isSafeInteger(group.upperAge) || group.lowerAge < 0 || group.upperAge <= group.lowerAge) {
        throw new ExpoModuleError('ERR_AGE_RANGE_UNKNOWN_RESPONSE', 'The Age Range service returned invalid age bounds');
      }

      // Account Kit excludes upperAge; Expo Android includes the last whole year.
      return { lowerBound: group.lowerAge, upperBound: group.upperAge - 1 };
    }

    throw new ExpoModuleError('ERR_AGE_RANGE_NOT_AVAILABLE', 'The Age Range service is not available');
  }
}
