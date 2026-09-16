import { ExpoFunction, ExpoModuleContext, ExpoModuleDefinition, ExpoModuleError, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import { sensor } from '@kit.SensorServiceKit';
import { SensorModule } from './SensorModule';
import { PedometerMeasurement } from './SensorMeasurements';
import { PedometerPermissions, SensorPermissionResponse } from './SensorPermissions';

export class PedometerModule extends SensorModule {
  private readonly permissions: PedometerPermissions;
  private baseline?: number;
  private previous?: number;
  private offset: number = 0;

  constructor(context: ExpoModuleContext) {
    super(context, 'ExponentPedometer', 'Exponent.pedometerUpdate', ['ohos.permission.ACTIVITY_MOTION']);
    this.permissions = new PedometerPermissions(context);
    this.addSensor<sensor.PedometerResponse>(
      sensor.SensorId.PEDOMETER,
      (callback, options): void => {
        sensor.on(sensor.SensorId.PEDOMETER, callback, options);
      },
      (callback): void => {
        sensor.off(sensor.SensorId.PEDOMETER, callback);
      },
      (value): void => {
        this.onSteps(value);
      },
    );
  }

  definition(): ExpoModuleDefinition {
    return super
      .definition()
      .asyncFunction('getPermissionsAsync', async (): Promise<SensorPermissionResponse> => {
        return this.permissions.get();
      })
      .asyncFunction('requestPermissionsAsync', async (): Promise<SensorPermissionResponse> => {
        const response = await this.permissions.request();

        if (response.granted) this.resumeSafely();

        return response;
      })
      .asyncFunction(
        'getStepCountAsync',
        ExpoFunction.typed2(ExpoValueTypes.number(), ExpoValueTypes.number(), async (_start: number, _end: number): Promise<void> => {
          throw new ExpoModuleError('ERR_NOT_SUPPORTED', 'Getting step count for a date range is not supported on HarmonyOS.');
        }),
      );
  }

  protected resetObservation(): void {
    this.baseline = undefined;
    this.previous = undefined;
    this.offset = 0;
  }

  private onSteps(value: sensor.PedometerResponse): void {
    if (!Number.isSafeInteger(value.steps) || value.steps < 0) throw new RangeError('Invalid pedometer step count.');

    // Match Expo Android: the first counter event represents the first step.
    if (this.baseline === undefined) this.baseline = value.steps - 1;
    if (this.previous !== undefined && value.steps < this.previous) {
      this.offset += this.previous - this.baseline;
      this.baseline = value.steps - 1;
    }
    this.previous = value.steps;

    this.emitMeasurement(new PedometerMeasurement(this.offset + value.steps - this.baseline));
  }
}
