import { ExpoModuleContext, ExpoModuleDefinition } from '@expo-harmony/expo-modules-core';
import { sensor } from '@kit.SensorServiceKit';
import { SensorModule } from './SensorModule';
import { BarometerMeasurement, GRAVITY_EARTH, LightMeasurement, VectorMeasurement } from './SensorMeasurements';
import { SensorPermissionResponse } from './SensorPermissions';

export class AccelerometerModule extends SensorModule {
  constructor(context: ExpoModuleContext) {
    super(context, 'ExponentAccelerometer', 'accelerometerDidUpdate', ['ohos.permission.ACCELEROMETER']);
    this.addSensor<sensor.AccelerometerResponse>(
      sensor.SensorId.ACCELEROMETER,
      (callback, options): void => {
        sensor.on(sensor.SensorId.ACCELEROMETER, callback, options);
      },
      (callback): void => {
        sensor.off(sensor.SensorId.ACCELEROMETER, callback);
      },
      (value): void => {
        this.emitMeasurement(new VectorMeasurement(value.x / GRAVITY_EARTH, value.y / GRAVITY_EARTH, value.z / GRAVITY_EARTH, value.timestamp));
      },
    );
  }

  definition(): ExpoModuleDefinition {
    return super
      .definition()
      .asyncFunction('getPermissionsAsync', async (): Promise<SensorPermissionResponse> => {
        return this.systemPermissions();
      })
      .asyncFunction('requestPermissionsAsync', async (): Promise<SensorPermissionResponse> => {
        return this.systemPermissions();
      });
  }
}

export class GyroscopeModule extends SensorModule {
  constructor(context: ExpoModuleContext) {
    super(context, 'ExponentGyroscope', 'gyroscopeDidUpdate', ['ohos.permission.GYROSCOPE']);
    this.addSensor<sensor.GyroscopeResponse>(
      sensor.SensorId.GYROSCOPE,
      (callback, options): void => {
        sensor.on(sensor.SensorId.GYROSCOPE, callback, options);
      },
      (callback): void => {
        sensor.off(sensor.SensorId.GYROSCOPE, callback);
      },
      (value): void => {
        this.emitMeasurement(new VectorMeasurement(value.x, value.y, value.z, value.timestamp));
      },
    );
  }

  definition(): ExpoModuleDefinition {
    return super
      .definition()
      .asyncFunction('getPermissionsAsync', async (): Promise<SensorPermissionResponse> => {
        return this.systemPermissions();
      })
      .asyncFunction('requestPermissionsAsync', async (): Promise<SensorPermissionResponse> => {
        return this.systemPermissions();
      });
  }
}

export class MagnetometerModule extends SensorModule {
  constructor(context: ExpoModuleContext) {
    super(context, 'ExponentMagnetometer', 'magnetometerDidUpdate');
    this.addSensor<sensor.MagneticFieldResponse>(
      sensor.SensorId.MAGNETIC_FIELD,
      (callback, options): void => {
        sensor.on(sensor.SensorId.MAGNETIC_FIELD, callback, options);
      },
      (callback): void => {
        sensor.off(sensor.SensorId.MAGNETIC_FIELD, callback);
      },
      (value): void => {
        this.emitMeasurement(new VectorMeasurement(value.x, value.y, value.z, value.timestamp));
      },
    );
  }
}

export class MagnetometerUncalibratedModule extends SensorModule {
  constructor(context: ExpoModuleContext) {
    super(context, 'ExponentMagnetometerUncalibrated', 'magnetometerUncalibratedDidUpdate');
    this.addSensor<sensor.MagneticFieldUncalibratedResponse>(
      sensor.SensorId.MAGNETIC_FIELD_UNCALIBRATED,
      (callback, options): void => {
        sensor.on(sensor.SensorId.MAGNETIC_FIELD_UNCALIBRATED, callback, options);
      },
      (callback): void => {
        sensor.off(sensor.SensorId.MAGNETIC_FIELD_UNCALIBRATED, callback);
      },
      (value): void => {
        this.emitMeasurement(new VectorMeasurement(value.x, value.y, value.z, value.timestamp));
      },
    );
  }
}

export class BarometerModule extends SensorModule {
  constructor(context: ExpoModuleContext) {
    super(context, 'ExpoBarometer', 'barometerDidUpdate');
    this.addSensor<sensor.BarometerResponse>(
      sensor.SensorId.BAROMETER,
      (callback, options): void => {
        sensor.on(sensor.SensorId.BAROMETER, callback, options);
      },
      (callback): void => {
        sensor.off(sensor.SensorId.BAROMETER, callback);
      },
      (value): void => {
        this.emitMeasurement(new BarometerMeasurement(value.pressure, value.timestamp));
      },
    );
  }
}

export class LightSensorModule extends SensorModule {
  constructor(context: ExpoModuleContext) {
    super(context, 'ExpoLightSensor', 'lightSensorDidUpdate');
    this.addSensor<sensor.LightResponse>(
      sensor.SensorId.AMBIENT_LIGHT,
      (callback, options): void => {
        sensor.on(sensor.SensorId.AMBIENT_LIGHT, callback, options);
      },
      (callback): void => {
        sensor.off(sensor.SensorId.AMBIENT_LIGHT, callback);
      },
      (value): void => {
        this.emitMeasurement(new LightMeasurement(value.intensity, value.timestamp));
      },
    );
  }
}
