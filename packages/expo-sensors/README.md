# @expo-harmony/expo-sensors

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-sensors) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/sensors/)

为 HarmonyOS 上的 React Native 应用提供 Expo Sensors 的原生实现，与官方同版本的 `expo-sensors` 配套使用。已实现加速度计、陀螺仪、磁力计、未校准磁力计、气压计、环境光、设备运动和计步器。

## 安装

```bash
npm install @expo-harmony/expo-sensors expo-sensors@55.0.19
```

本包适配 Expo SDK 55 的 `expo-sensors`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

HAR 声明了 `ohos.permission.ACCELEROMETER`、`ohos.permission.GYROSCOPE` 和 `ohos.permission.ACTIVITY_MOTION`。加速度和陀螺仪属于 `system_grant` 权限，随安装授予，不会弹窗；运动权限用于计步器，订阅前需要申请，权限的 `usedScene` 默认挂在 `EntryAbility` 的 `inuse` 场景上，宿主的入口 Ability 使用其他名称时要改成实际名称。

业务代码从官方包导入：

```ts
import { Accelerometer, DeviceMotion, Pedometer } from 'expo-sensors';

Accelerometer.addListener(({ x, y, z }) => console.log(x, y, z));
```

## API 对照表

### Classes

#### `Accelerometer`

测量三轴加速度，单位 `g`。

#### `Barometer`

测量气压，单位 `hPa`。

#### `DeviceMotion`

测量设备的运动状态，同时依赖加速度、线性加速度、重力、陀螺仪和旋转矢量五个传感器。`isAvailableAsync()` 要求五个传感器全部存在。订阅任一传感器失败时会停止已启动的订阅。首次样本异步到达，事件可能先包含部分字段，业务端应检查字段是否存在。更新间隔默认 `1000 / 60` 毫秒，其他传感器默认 100 毫秒。

加速度的单位和坐标约定与 Expo Android 一致。`rotation` 的 `alpha`、`beta`、`gamma` 是弧度，`rotationRate` 是度每秒。`orientation` 取屏幕旋转方向，值为 `0`、`90`、`180` 或 `-90`。

#### `Gyroscope`

测量三轴角速度，单位 `rad/s`。

#### `LightSensor`

测量环境光，单位 `lux`。

#### `Magnetometer`

测量三轴磁场强度，单位 `μT`。

#### `MagnetometerUncalibrated`

测量未经校准的三轴磁场强度，单位 `μT`。

#### `DeviceSensor`

传感器的基类，上面七个传感器都继承它。以下方法在所有传感器上都可用。

##### `addListener(listener)`

返回 `Subscription`，订阅测量更新。订阅前应先用 `isAvailableAsync()` 检查硬件。订阅期间应用切到后台会暂停上报，回到前台后恢复；订阅一时失败会自动重试三次。传感器不可用或缺少权限时订阅静默失败，不向调用方抛错，只是收不到更新。

##### `isAvailableAsync()`

返回 `Promise<boolean>`，设备是否提供该传感器。

##### `setUpdateInterval(intervalMs)`

设置更新间隔，单位毫秒，默认 100。传入负数、非有限数或超出安全整数范围的值时以 `ERR_SENSOR_INTERVAL` 报错。官方 JS 包里该方法返回 `void`，报错不会传给调用方，应先校验输入。实际频率受硬件和系统限制。上报按间隔节流，节流依据设备开机时长，不受系统时间调整影响。

##### `hasListeners()`

返回 `boolean`，是否有已注册的监听。

##### `getListenerCount()`

返回 `number`，已注册的监听数量。

##### `removeAllListeners()`

移除该传感器的全部监听。

##### `removeSubscription(subscription)`

取消指定的监听。官方已标记废弃，改调 `subscription.remove()`。

##### `getPermissionsAsync()`

返回 `Promise<PermissionResponse>`。加速度计、陀螺仪和设备运动读取系统权限状态；磁力计、未校准磁力计、气压计和环境光不需要权限，直接返回已授权。

##### `requestPermissionsAsync()`

返回 `Promise<PermissionResponse>`，取值与 `getPermissionsAsync()` 一致。加速度计和陀螺仪的权限随安装授予，不会弹出授权对话框。

### Constants

#### `DeviceMotion.Gravity`

类型：`number`，值为 `9.80665`。

### Methods

#### `Pedometer.watchStepCount(callback)`

返回 `Subscription`，订阅步数更新，需要运动权限。步数更新按默认的 100 毫秒间隔节流，`Pedometer` 上没有调整间隔的方法。没有运动权限或设备没有计步器时订阅静默失败，不抛错。

系统上报的是累计步数。与 Expo Android 一致，每轮订阅以首次收到的累计值减一作为基线，首次更新为 `steps: 1`，之后返回相对该基线的步数。前后台切换保留基线，移除最后一个监听后重新订阅会重置基线。设备记录被系统清零时，模块会接续之前的计数。暂停期间不会上报，但恢复后的累计值可能包含暂停期间的步数。

#### `Pedometer.isAvailableAsync()`

返回 `Promise<boolean>`，设备是否提供计步器。

#### `Pedometer.getPermissionsAsync()`

返回 `Promise<PermissionResponse>`，读取运动权限状态。

`status` 可能为 `'granted'`、`'denied'` 或 `'undetermined'`。API 20 及以上由系统区分未决定和已拒绝；API 13 到 API 19 的系统查询只能给出已授权或未授权，模块自己记录用户有没有被问过，没问过时按未决定返回。

#### `Pedometer.requestPermissionsAsync()`

返回 `Promise<PermissionResponse>`，弹出授权对话框，取值与 `getPermissionsAsync()` 一致。同时发起的多次调用合并为一次请求，授权成功后正在等待的订阅自动恢复。权限没有在 `module.json5` 中声明时抛出 `ERR_SENSOR_PERMISSION`。

> **未实现的内容**
>
> - `Pedometer.getStepCountAsync()`：iOS 专属接口，HarmonyOS 上没有按时间段查询步数的能力，调用抛出 `ERR_NOT_SUPPORTED`。

### Types

#### `AccelerometerMeasurement`

| 属性          | 类型     | 说明                     |
| ------------- | -------- | ------------------------ |
| `x`、`y`、`z` | `number` | 三个轴的加速度，单位 `g` |
| `timestamp`   | `number` | 测量时间，单位秒         |

#### `BarometerMeasurement`

| 属性        | 类型     | 说明             |
| ----------- | -------- | ---------------- |
| `pressure`  | `number` | 气压，单位 `hPa` |
| `timestamp` | `number` | 测量时间，单位秒 |

> **未实现的内容**
>
> - `BarometerMeasurement.relativeAltitude`：iOS 专属字段，HarmonyOS 上没有取值来源。

#### `GyroscopeMeasurement`

| 属性          | 类型     | 说明                         |
| ------------- | -------- | ---------------------------- |
| `x`、`y`、`z` | `number` | 三个轴的角速度，单位 `rad/s` |
| `timestamp`   | `number` | 测量时间，单位秒             |

#### `LightSensorMeasurement`

| 属性          | 类型     | 说明                   |
| ------------- | -------- | ---------------------- |
| `illuminance` | `number` | 环境光照度，单位 `lux` |
| `timestamp`   | `number` | 测量时间，单位秒       |

#### `MagnetometerMeasurement`

| 属性          | 类型     | 说明                        |
| ------------- | -------- | --------------------------- |
| `x`、`y`、`z` | `number` | 三个轴的磁场强度，单位 `μT` |
| `timestamp`   | `number` | 测量时间，单位秒            |

#### `MagnetometerUncalibratedMeasurement`

字段与 `MagnetometerMeasurement` 相同，数值未经校准。

#### `DeviceMotionMeasurement`

| 属性                           | 类型                                             | 说明                          |
| ------------------------------ | ------------------------------------------------ | ----------------------------- |
| `acceleration`                 | `{ x, y, z, timestamp } \| undefined`            | 不含重力的加速度，单位 `m/s²` |
| `accelerationIncludingGravity` | `{ x, y, z, timestamp } \| undefined`            | 含重力的加速度，单位 `m/s²`   |
| `rotation`                     | `{ alpha, beta, gamma, timestamp } \| undefined` | 设备在空间中的姿态，单位弧度  |
| `rotationRate`                 | `{ alpha, beta, gamma, timestamp } \| undefined` | 旋转速率，单位度每秒          |
| `interval`                     | `number`                                         | 更新间隔，单位毫秒            |
| `orientation`                  | `DeviceMotionOrientation`                        | 屏幕旋转方向                  |

#### `PedometerResult`

| 属性    | 类型     | 说明 |
| ------- | -------- | ---- |
| `steps` | `number` | 步数 |

#### `PedometerUpdateCallback`

`(result: PedometerResult) => void`。

#### `Listener`

`(event: Measurement) => void`。

#### `Subscription`

取消订阅的对象，实现见 `addListener()`。

#### `PermissionExpiration`

`'never' | number`，恒为 `'never'`。

#### `PermissionResponse`

| 属性          | 类型                   | 说明                                          |
| ------------- | ---------------------- | --------------------------------------------- |
| `status`      | `PermissionStatus`     | `'granted'`、`'denied'` 或 `'undetermined'`   |
| `granted`     | `boolean`              | 是否已授权                                    |
| `canAskAgain` | `boolean`              | 已授权或未决定时为 `true`，被拒绝后为 `false` |
| `expires`     | `PermissionExpiration` | 恒为 `'never'`                                |

### Enums

#### `DeviceMotionOrientation`

`Portrait = 0`、`RightLandscape = 90`、`UpsideDown = 180`、`LeftLandscape = -90`。

#### `PermissionStatus`

`'granted' | 'denied' | 'undetermined'`，三个取值都会出现。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors)

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
