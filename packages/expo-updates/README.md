# @expo-harmony/expo-updates

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-updates) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/updates/)

为 HarmonyOS 上的 React Native 应用提供 Expo Updates 的原生实现，与官方同版本的 `expo-updates` 配套使用。支持检查和下载远程更新、重载应用切换到新版本、查询当前运行的更新信息和读取更新日志。

## 安装

```bash
npm install @expo-harmony/expo-updates expo-updates@55.0.24
```

本包适配 Expo SDK 55 的 `expo-updates`，原生模块通过 Expo Harmony 自动链接，不需要配置插件。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

在应用配置里设置更新服务器和运行时版本：

```json
{
  "expo": {
    "runtimeVersion": "1.0.0",
    "updates": {
      "url": "https://example.com/updates"
    }
  }
}
```

业务代码从官方包导入：

```ts
import * as Updates from 'expo-updates';

const result = await Updates.checkForUpdateAsync();
if (result.isAvailable) {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}
```

构建时 CLI 会生成内置更新清单和资源。Metro 开发模式默认不启用更新，要在开发模式调试更新流程，把 `updates.useNativeDebug` 设为 `true`。

更新服务器需要支持 Expo Updates 协议中的 Harmony 平台。客户端支持不代表 EAS Update 云端已经支持 Harmony 的构建和发布。

## API 对照表

### Constants

#### `Updates.channel`

类型：`string | null`

更新渠道名，取自应用配置 `updates.requestHeaders` 里的 `expo-channel-name`。未配置渠道时为空字符串，官方类型声明是 `string | null`。

#### `Updates.checkAutomatically`

类型：`'ON_LOAD' | 'ON_ERROR_RECOVERY' | 'WIFI_ONLY' | 'NEVER'`

启动时自动检查、下载更新的策略，取自应用配置的 `updates.checkAutomatically`，默认 `ON_LOAD`。更新未启用时为 `NEVER`。

#### `Updates.createdAt`

类型：`Date | null`

当前运行更新的发布时间，来自更新清单的提交时间。开发模式或更新未启用时为 `null`。

#### `Updates.emergencyLaunchReason`

类型：`string | null`

紧急启动的原因。`isEmergencyLaunch` 为 `true` 时是对应的错误信息，否则为 `null`。

#### `Updates.isEmbeddedLaunch`

类型：`boolean`

当前运行的是不是构建时内置的更新。

#### `Updates.isEmergencyLaunch`

类型：`boolean`

本次启动是不是紧急启动。更新加载失败、应用回退到内置更新时为 `true`。

#### `Updates.isEnabled`

类型：`boolean`

更新功能是否启用。应用配置关闭更新、缺少更新地址或运行时版本、更新存储初始化失败时为 `false`，应用按内置更新启动，检查和下载方法抛出 `ERR_UPDATES_DISABLED`。Metro 开发模式没有开启 `useNativeDebug` 时同样为 `false`。

#### `Updates.isUsingEmbeddedAssets`

类型：`boolean`

当前加载的资源是否来自内置更新。运行的更新带自己的资源文件时为 `false`。

#### `Updates.launchDuration`

类型：`number | null`

本次启动加载更新花费的毫秒数。更新未启用时为 `0`。

#### `Updates.localAssets`

类型：`Record<string, string>`

当前运行的更新里，资源 key 到本地 `file://` 地址的映射。

#### `Updates.manifest`

类型：`object`

当前运行更新的清单。开发模式或更新未启用时为空对象。

#### `Updates.runtimeVersion`

类型：`string | null`

当前构建的运行时版本，取自应用配置的 `runtimeVersion`。更新未启用时为空字符串。

#### `Updates.updateId`

类型：`string | null`

当前运行更新的 ID，小写 UUID。开发模式或更新未启用时为 `null`。

### Hook

#### `Updates.useUpdates()`

返回 `UseUpdatesReturnType`，包含检查和下载的状态与进度，比如 `isChecking`、`isDownloading`、`downloadProgress`、`availableUpdate`、`downloadError`。更新流程每有变化就触发组件重新渲染。

### Methods

#### `Updates.checkForUpdateAsync()`

返回 `Promise<UpdateCheckResult>`。向服务器查询有没有新更新，不下载。有更新时 `isAvailable` 为 `true`，附带清单；没有时 `isAvailable` 为 `false`，`reason` 说明原因，比如服务器没有可用更新、更新被选择策略拒绝。服务器下发回滚指令时返回回滚结果。

#### `Updates.fetchUpdateAsync()`

返回 `Promise<UpdateFetchResult>`。把最新更新下载到本地。`isNew` 为 `true` 表示下载到与当前不同的版本；服务器下发回滚指令时 `isRollBackToEmbedded` 为 `true`。下载完成后调用 `reloadAsync()` 立即生效，否则等下次冷启动。

#### `Updates.getExtraParamsAsync()`

返回 `Promise<Record<string, string>>`。读取当前设置的额外参数。参数随更新请求的 `Expo-Extra-Params` 头发送，服务器可以用它给不同设备下发不同更新。

#### `Updates.readLogEntriesAsync(maxAge?)`

返回 `Promise<UpdatesLogEntry[]>`。读取更新日志。`maxAge` 是日志保留的最长毫秒数，默认一小时。日志持久保存，重启后仍可读取。

#### `Updates.reloadAsync(options?)`

返回 `Promise<void>`。用最近下载的更新重载应用。重载期间显示重载画面，`options.reloadScreenOptions` 可以配置背景色、图片和加载指示器。

#### `Updates.setExtraParamAsync(key, value)`

设置一个额外参数，`value` 传 `null` 时删除该参数。

#### `Updates.setUpdateRequestHeadersOverride(requestHeaders)`

运行时覆盖更新请求头，只能替换构建时配置过的请求头名字。传 `null` 恢复构建时配置。

#### `Updates.setUpdateURLAndRequestHeadersOverride(configOverride)`

运行时覆盖更新服务器地址和请求头，要求应用配置里 `updates.disableAntiBrickingMeasures` 为 `true`，否则抛出 `ERR_UPDATES_RUNTIME_OVERRIDE`。覆盖持久保存，重启应用后仍然生效。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
