# @expo-harmony/expo-screen-orientation

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-screen-orientation) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/screen-orientation/)

为 HarmonyOS 上的 React Native 应用提供 Expo ScreenOrientation 的原生实现，与官方同版本的 `expo-screen-orientation` 配套使用。支持方向查询、横竖屏锁定、默认策略恢复和方向变化监听。

## 安装

```bash
npm install @expo-harmony/expo-screen-orientation expo-screen-orientation@55.0.20
```

本包适配 Expo SDK 55 的 `expo-screen-orientation`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

业务代码从官方包导入：

```ts
import * as ScreenOrientation from 'expo-screen-orientation';

await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
const orientation = await ScreenOrientation.getOrientationAsync();
await ScreenOrientation.unlockAsync();
```

应用的启动方向在宿主 `module.json5` 中 UIAbility 的 `orientation` 字段配置。

## API 对照表

### Methods

#### `ScreenOrientation.lockAsync(orientationLock)`

返回 `Promise<void>`，把所属 UIAbility 的主窗口锁定到指定方向。

锁定用的策略映射到系统窗口方向：`DEFAULT` 对应系统默认策略，`ALL`、`PORTRAIT`、`LANDSCAPE` 分别对应全方向、竖屏和横屏的自动旋转，`PORTRAIT_UP`、`PORTRAIT_DOWN`、`LANDSCAPE_LEFT`、`LANDSCAPE_RIGHT` 对应固定方向。

自动旋转策略不受控制中心旋转锁定开关的限制，与官方 Android 实现一致。传入 `OTHER` 不会更改当前策略，传入 `UNKNOWN` 会被拒绝。

Promise 完成表示系统接受了策略，不代表旋转动画结束。多窗口、后台运行和没有传感器的设备可能暂不旋转，2-in-1 设备不保证支持方向设置。没有窗口的运行时调用会抛出 `ERR_SCREEN_ORIENTATION_WINDOW`，运行时已销毁后调用抛出 `ERR_SCREEN_ORIENTATION_DESTROYED`。

模块记录每个主窗口首次修改前的策略，runtime 释放或 WindowStage 替换、销毁时恢复。reload 会等待恢复完成，普通销毁时只能尽力恢复。策略是窗口的共享属性，多个 runtime 或其他原生模块同时修改时需要宿主自行协调。

#### `ScreenOrientation.lockPlatformAsync(options)`

返回 `Promise<void>`。`options` 只定义了 Android、iOS 和 Web 的平台参数，HarmonyOS 没有对应取值，调用会被拒绝。

#### `ScreenOrientation.unlockAsync()`

返回 `Promise<void>`，恢复成系统默认策略，与 `lockAsync(OrientationLock.DEFAULT)` 等价。

#### `ScreenOrientation.getOrientationAsync()`

返回 `Promise<Orientation>`，读取当前窗口方向。

API 23 起优先调用系统的方向换算接口，由显示器方向换算出结果，设备不具备对应系统能力时改用推断。推断按显示器旋转角度和显示器自身的尺寸进行，不受分屏、悬浮窗的窗口尺寸影响，折叠屏仍是近似值。窗口尺寸无效，或方向与主窗口实际形状不一致时返回 `Orientation.UNKNOWN`。换算接口的其他错误抛出 `ERR_SCREEN_ORIENTATION_CONVERSION`。

#### `ScreenOrientation.getOrientationLockAsync()`

返回 `Promise<OrientationLock>`，读取当前生效的策略。窗口方向不在 `lockAsync()` 支持的映射中时返回 `OrientationLock.OTHER`。

#### `ScreenOrientation.getPlatformOrientationLockAsync()`

返回 `Promise<PlatformOrientationInfo>`，HarmonyOS 上没有对应的平台参数，读取当前策略成功后返回空对象，窗口不可用时拒绝。

#### `ScreenOrientation.supportsOrientationLockAsync(orientationLock)`

返回 `Promise<boolean>`，查询该策略在 HarmonyOS 上是否有对应实现。`OTHER` 和 `UNKNOWN` 返回 `false`。

返回值只说明策略有映射，不保证当前设备或窗口模式可以旋转。

### Event subscriptions

#### `ScreenOrientation.addOrientationChangeListener(listener)`

返回 `Subscription`，窗口尺寸变化时触发，`OrientationChangeEvent` 里带查询到的当前策略和方向。

监听基于 React Native 的 `Dimensions` 事件，横竖屏切换和窗口缩放都会触发，180° 旋转因为尺寸不变可能不触发回调。

#### `ScreenOrientation.removeOrientationChangeListeners()`

移除全部方向变化监听。官方已标记废弃，建议自行保存订阅。

#### `ScreenOrientation.removeOrientationChangeListener(subscription)`

取消指定的监听。官方已标记废弃，改调 `subscription.remove()`。

### Types

#### `OrientationChangeEvent`

| 属性              | 类型                    | 说明         |
| ----------------- | ----------------------- | ------------ |
| `orientationLock` | `OrientationLock`       | 当前策略     |
| `orientationInfo` | `ScreenOrientationInfo` | 当前方向信息 |

#### `OrientationChangeListener`

`(event: OrientationChangeEvent) => void`。

#### `PlatformOrientationInfo`

HarmonyOS 上没有对应的平台参数，恒为空对象。

#### `ScreenOrientationInfo`

| 属性          | 类型          | 说明     |
| ------------- | ------------- | -------- |
| `orientation` | `Orientation` | 当前方向 |

> **未实现的内容**
>
> - `ScreenOrientationInfo.verticalSizeClass`、`ScreenOrientationInfo.horizontalSizeClass`：iOS 专属字段，HarmonyOS 不提供尺寸级别。

### Enums

#### `Orientation`

`UNKNOWN = 0`、`PORTRAIT_UP = 1`、`PORTRAIT_DOWN = 2`、`LANDSCAPE_LEFT = 3`、`LANDSCAPE_RIGHT = 4`。

#### `OrientationLock`

`DEFAULT = 0`、`ALL = 1`、`PORTRAIT = 2`、`PORTRAIT_UP = 3`、`PORTRAIT_DOWN = 4`、`LANDSCAPE = 5`、`LANDSCAPE_LEFT = 6`、`LANDSCAPE_RIGHT = 7`、`OTHER = 8`、`UNKNOWN = 9`。HarmonyOS 上可用的策略是前八个。

> **未实现的内容**
>
> - `SizeClassIOS`：iOS 专属枚举，HarmonyOS 不提供尺寸级别。
> - `WebOrientation`、`WebOrientationLock`：Web 专属枚举，HarmonyOS 上没有取值来源。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors)

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
