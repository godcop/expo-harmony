# @expo-harmony/expo-tracking-transparency

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-tracking-transparency) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/tracking-transparency/)

为 HarmonyOS 上的 React Native 应用提供 Expo TrackingTransparency 的原生实现，与官方同版本的 `expo-tracking-transparency` 配套使用。支持查询和请求跨应用跟踪权限，并通过异步扩展读取系统广告标识 OAID。

## 安装

```bash
npm install @expo-harmony/expo-tracking-transparency expo-tracking-transparency@55.0.18
```

本包适配 Expo SDK 55，与官方包 `expo-tracking-transparency` 搭配使用。业务代码照常从官方包导入，原生模块由 Expo Harmony 自动链接。读取 OAID 的扩展接口是本包新增的能力，从 `@expo-harmony/expo-tracking-transparency` 导入。

跨应用跟踪权限已随本包声明，相关注意事项见「权限」一节。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

## 权限

本包声明了用户授权类权限 `ohos.permission.APP_TRACKING_CONSENT`，用途说明默认使用字符串资源 `expo_tracking_transparency_permission_reason`。权限声明挂在 `EntryAbility` 名下，宿主入口 Ability 使用其他名称时，需要在应用的 `module.json5` 中按实际名称声明同名权限，用途说明也可以换成应用自己的字符串资源。

是否弹出授权对话框由系统设置中的「要求应用请求关联」开关决定，开关关闭时请求可能直接获得授权，不能假设每次调用都会弹窗。官方配置插件的 `userTrackingPermission` 只配置 iOS 的用途说明，对 HarmonyOS 没有影响。

## API 对照表

### Hooks

#### `TrackingTransparency.useTrackingPermissions(options)`

复用官方的权限 Hook，接入 HarmonyOS 的原生权限状态，返回当前权限响应和请求、刷新权限的方法。`options` 的取值和含义与官方一致。

### Methods

#### `TrackingTransparency.getTrackingPermissionsAsync()`

返回 `Promise<PermissionResponse>`，查询跨应用跟踪权限的当前状态，不触发授权弹窗。官方包在 Android 和 Web 上恒返回已授权，HarmonyOS 上返回系统的真实授权状态。

响应包含 `status`、`granted`、`canAskAgain` 和 `expires`，`expires` 恒为 `'never'`。状态查询随系统版本有差异。API 20 起系统提供完整的权限状态，三种 `status` 都能直接区分。API 13–19 的系统查询只能得到授权与否，未授权时本包依据记录的拒绝历史区分 `denied` 和 `undetermined`，权限在系统设置中被外部改动或历史记录读取失败时，状态细分和 `canAskAgain` 可能不准确。

#### `TrackingTransparency.requestTrackingPermissionsAsync()`

返回 `Promise<PermissionResponse>`，向用户请求跨应用跟踪权限。并发调用依次执行，不会同时弹出多个授权窗口。用户拒绝或系统不再允许弹窗后，`canAskAgain` 为 `false`，需要用户到系统设置中自行调整。请求后仍未作出选择时保留 `undetermined`，不会仅因调用过请求方法就记为拒绝。

#### `TrackingTransparency.isAvailable()`

返回 `boolean`，表示设备上是否具备 TrackingTransparency 能力。HarmonyOS 上原生模块始终存在，这个方法恒返回 `true`。它只说明能力可用，不代表已经取得授权。

> **未实现的内容**
>
> - `getAdvertisingId()`：HarmonyOS 只提供异步的 OAID 接口，没有对应的同步读取能力，调用抛出包含 `ERR_UNAVAILABLE` 的错误，请改用下方的 `getAdvertisingIdAsync()`。

### Types

#### `PermissionResponse`

权限查询和请求方法共用的返回类型。`status` 是 `PermissionStatus` 的三种状态之一，`granted` 表示是否已授权，`canAskAgain` 为 `false` 时应引导用户去系统设置开启权限，`expires` 恒为 `'never'`。

#### `PermissionExpiration`

权限的过期时间。跨应用跟踪权限一经授权长期有效，只取值 `'never'`。

#### `PermissionHookOptions`

传给 `useTrackingPermissions` 的选项，控制 Hook 挂载时只查询权限还是直接请求权限，取值和含义与官方一致。

### Enums

#### `PermissionStatus`

跟踪权限的三种状态。`granted`、`denied` 和 `undetermined` 在 HarmonyOS 上都会出现，分别对应用户同意、用户拒绝和尚未请求。

### HarmonyOS 扩展

#### `getAdvertisingIdAsync()`

从 `@expo-harmony/expo-tracking-transparency` 导入，返回 `Promise<string | null>`，每次调用都从系统广告服务读取当前的 OAID，不缓存、不持久化，也不会自动请求权限。未授权、读到空值或全零的标识符时返回 `null`，系统服务出错时拒绝 Promise。读取完成时还会复查一次权限，用户在读取过程中撤回授权的话同样返回 `null`。

```ts
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { getAdvertisingIdAsync } from '@expo-harmony/expo-tracking-transparency';

const permission = await requestTrackingPermissionsAsync();
const id = permission.granted ? await getAdvertisingIdAsync() : null;
```

OAID 是 HarmonyOS 上可由用户重置的广告标识，与 iOS 的 IDFA 和 Android 的广告 ID 不互通。模拟器或未提供 OAID 服务的设备可能拿不到有效的标识符。接口细节参见 [华为 OAID 文档](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-oaid)。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
