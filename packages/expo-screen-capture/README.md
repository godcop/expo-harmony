# @expo-harmony/expo-screen-capture

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-screen-capture) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/screen-capture/)

为 HarmonyOS 上的 React Native 应用提供 Expo ScreenCapture 的原生实现，与官方同版本的 `expo-screen-capture` 配套使用。支持阻止和恢复截屏、录屏，以及监听截图。

## 安装

```bash
npm install @expo-harmony/expo-screen-capture expo-screen-capture@55.0.18
```

本包适配 Expo SDK 55 的 `expo-screen-capture`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

HAR 声明 `ohos.permission.PRIVACY_WINDOW`，构建时合并到宿主。该权限从 API 11 起为 `normal` 等级、`system_grant` 授权，安装后由系统自动授予，不弹出授权对话框。截图监听不需要相册、存储或 `CAPTURE_SCREEN` 权限。

业务代码从官方包导入：

```ts
import * as ScreenCapture from 'expo-screen-capture';

await ScreenCapture.preventScreenCaptureAsync();
const subscription = ScreenCapture.addScreenshotListener(() => {
  console.log('用户截图了');
});
```

## API 对照表

### Hooks

#### `usePermissions(options)`

返回 `[PermissionResponse | null, request, get]`。HarmonyOS 上截图监听不需要权限，两者都返回已授权。

#### `usePreventScreenCapture(key)`

在组件挂载期间阻止截屏，卸载后恢复。`key` 用于区分多个调用方，见 `preventScreenCaptureAsync()`。

#### `useScreenshotListener(listener)`

在组件挂载期间监听截图，卸载后取消监听。

### Methods

#### `ScreenCapture.preventScreenCaptureAsync(key)`

返回 `Promise<void>`，通过 React Native 窗口的隐私模式阻止截屏和录屏。

`key` 用于区分多个调用方，不同的 `key` 相互独立，全部恢复前保护一直有效。启用后保护在后台继续生效，多任务界面由系统遮罩，其他独立窗口不受影响。应用重载或 runtime 释放时，已设置的隐私模式会被解除。

没有 UI 窗口的后台运行时无法调用，抛出 `ERR_SCREEN_CAPTURE_WINDOW`。运行时已销毁后调用抛出 `ERR_SCREEN_CAPTURE_DESTROYED`。

#### `ScreenCapture.allowScreenCaptureAsync(key)`

返回 `Promise<void>`，恢复截屏和录屏。要放开全部保护，需要把所有用过的 `key` 都恢复一次。遗留的隐私窗口释放失败时抛出 `ERR_SCREEN_CAPTURE_RELEASE`。

#### `ScreenCapture.getPermissionsAsync()`

返回 `Promise<PermissionResponse>`，恒为已授权。

#### `ScreenCapture.requestPermissionsAsync()`

返回 `Promise<PermissionResponse>`，恒为已授权，不弹出对话框。

#### `ScreenCapture.isAvailableAsync()`

返回 `Promise<boolean>`，恒为 `true`。

> **未实现的内容**
>
> - `enableAppSwitcherProtectionAsync()`、`disableAppSwitcherProtectionAsync()`：iOS 专属接口，HarmonyOS 上没有对应能力，调用抛出 `UnavailabilityError`。

### Event subscriptions

#### `ScreenCapture.addScreenshotListener(listener)`

返回 `Subscription`，监听用户截图。只在应用处于前台且存在订阅时触发。

通知只表示系统检测到截图操作，不代表截图文件已经保存成功。

事件对控制中心截屏、hdc 命令截屏和整屏截屏接口生效。回调不携带截图的图片或文件路径，也没有录屏开始、结束事件。

#### `ScreenCapture.removeScreenshotListener(subscription)`

取消监听。官方已标记废弃，改调 `subscription.remove()`。

### Types

#### `PermissionHookOptions`

`PermissionHookBehavior | Options`。

#### `PermissionResponse`

| 属性          | 类型                   | 说明             |
| ------------- | ---------------------- | ---------------- |
| `status`      | `PermissionStatus`     | 恒为 `'granted'` |
| `granted`     | `boolean`              | 恒为 `true`      |
| `canAskAgain` | `boolean`              | 恒为 `true`      |
| `expires`     | `PermissionExpiration` | 恒为 `'never'`   |

### Enums

#### `PermissionStatus`

`'granted' | 'denied' | 'undetermined'`。HarmonyOS 上只出现 `'granted'`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors)

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
