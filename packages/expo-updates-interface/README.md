# @expo-harmony/expo-updates-interface

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-updates-interface)

为 HarmonyOS 原生模块提供 Updates 控制器、开发启动器和状态订阅的接口定义，宿主和开发工具通过它们访问已注册的 Updates 实现。

## 安装

```bash
npm install @expo-harmony/expo-updates-interface
```

本包适配 Expo SDK 55 的 `expo-updates-interface`，只有原生接口，没有 JavaScript API，也不需要配置插件。安装 `@expo-harmony/expo-updates` 时会自动带上这个包；单独安装是为了在自己的 ArkTS 模块里读取更新状态。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

模块在自己的 `oh-package.json5` 中声明依赖：

```json
{
  "dependencies": {
    "@expo-harmony/expo-updates-interface": "55.1.6-harmony.0"
  }
}
```

运行时从注册表拿到当前控制器，再读取属性或订阅状态变化：

```ts
import { UpdatesControllerRegistry } from '@expo-harmony/expo-updates-interface';

const controller = UpdatesControllerRegistry.controller;
const subscription = controller?.subscribeToUpdatesStateChanges({
  updatesStateDidChange: (event) => console.info(JSON.stringify(event)),
});
const context = subscription?.getContext();
subscription?.remove();
```

HAR 没有其他依赖，不依赖 expo-modules-core 和 RNOH，任何 ArkTS 模块都能直接使用。应用侧的更新流程请使用 `expo-updates` 的 JavaScript 接口。

## API 对照表

### Classes

#### `UpdatesControllerRegistry`

持有当前 Updates 控制器的注册表，成员都是静态的，每个进程一份。

`UpdatesControllerRegistry.controller` 的类型是 `UpdatesInterface | undefined`。应用装了 `@expo-harmony/expo-updates` 时，控制器在 Updates 初始化时注册进来；没有任何实现时读取得到 `undefined`。注册表用弱引用保存控制器，控制器的生命周期由注册方管理，控制器被回收后读取也得到 `undefined`。

### Interfaces

#### `UpdatesInterface`

Updates 控制器的接口，所有控制器（启用、停用和开发启动器）都实现它。

| 成员                                       | 类型                             | 说明                                            |
| ------------------------------------------ | -------------------------------- | ----------------------------------------------- |
| `isEnabled`                                | `boolean`                        | 更新功能是否启用                                |
| `runtimeVersion`                           | `string \| null`                 | 运行时版本，未启用更新时为 `null`               |
| `updateUrl`                                | `string \| null`                 | 更新服务地址，未启用更新时为 `null`             |
| `launchedUpdateId`                         | `string \| null`                 | 正在运行的更新 ID，未启用更新时为 `null`        |
| `embeddedUpdateId`                         | `string \| null`                 | 随应用打包的更新 ID，未启用更新时为 `null`      |
| `launchAssetPath`                          | `string \| null`                 | 当前 JS 包在本机上的路径，未启用更新时为 `null` |
| `subscribeToUpdatesStateChanges(listener)` | `UpdatesStateChangeSubscription` | 订阅更新状态机变化，`listener` 见下文           |

> **未实现的内容**
>
> - `requestHeaders`：官方接口的更新请求头属性，鸿蒙实现不通过接口公开请求头。

#### `UpdatesStateChangeListener`

状态变化监听器，由使用方实现。

| 成员                           | 说明                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `updatesStateDidChange(event)` | 状态机每次变化时调用。`event` 带 `type` 字段标明发生的动作，其余字段是事件负载 |

#### `UpdatesStateChangeSubscription`

`subscribeToUpdatesStateChanges()` 返回的订阅。

`remove()` 取消订阅，之后不再收到事件，重复调用没有副作用。

`getContext()` 返回 `UpdatesNativeInterfaceStateContext | null`，是当前状态的一份独立快照，时间字段都是 `Date`。监听器注册前发生的状态变化也能从这里读到。控制器未激活时返回 `null`。

#### `UpdatesInterfaceCallbacks`

宿主实现的重载回调接口。

| 成员                  | 说明                                     |
| --------------------- | ---------------------------------------- |
| `onRequestRelaunch()` | 开发启动器请求重载应用以让更新生效时调用 |

#### `UpdatesDevLauncherInterface`

开发启动器专用的控制器接口，在 `UpdatesInterface` 基础上增加开发流程需要的方法，由开发客户端的控制器实现。

| 成员                                                    | 类型                                     | 说明                                                                 |
| ------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `updatesInterfaceCallbacks`                             | `UpdatesInterfaceCallbacks \| undefined` | 宿主注册的重载回调，开发启动器通过它请求重载                         |
| `reset()`                                               |                                          | 丢弃当前的开发更新会话，回到初始状态                                 |
| `fetchUpdateWithConfiguration(configuration, callback)` |                                          | 按配置拉取开发更新，进度和结果通过 `UpdatesDevLauncherCallback` 返回 |
| `isValidUpdatesConfiguration(configuration)`            | `boolean`                                | 校验开发更新配置是否合法                                             |

> **未实现的内容**
>
> - `setIsUsingEmbeddedAssets()`：官方接口的方法，开发更新在鸿蒙上没有对应的开关。

#### `UpdatesDevLauncherCallback`

开发更新拉取过程的回调，由调用方实现。

| 成员                                    | 说明                                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `onManifestLoaded(manifest)`            | 清单下载完成时调用，返回 `false` 中止下载该清单描述的更新，`onSuccess` 随即收到 `null` |
| `onProgress(successful, failed, total)` | 资源下载进度，三个参数分别是成功、失败和总数                                           |
| `onSuccess(update)`                     | 拉取结束，`update` 是 `UpdatesDevLauncherResult \| null`                               |
| `onFailure(error)`                      | 拉取失败，`error` 是 `Error \| null`                                                   |

### Types

#### `UpdatesDevLauncherResult`

| 属性              | 类型                       | 说明                |
| ----------------- | -------------------------- | ------------------- |
| `manifest`        | `Record<string, ESObject>` | 拉到的更新清单      |
| `launchAssetPath` | `string`                   | JS 包在本机上的路径 |

#### `UpdatesNativeInterfaceStateContext`

更新状态机的状态快照，从 `UpdatesStateChangeSubscription` 的 `getContext()` 取得。

| 属性                     | 类型                               | 说明                                 |
| ------------------------ | ---------------------------------- | ------------------------------------ |
| `isUpdateAvailable`      | `boolean`                          | 检查到有可用更新                     |
| `isUpdatePending`        | `boolean`                          | 已下载的更新在等重载生效             |
| `isChecking`             | `boolean`                          | 正在检查更新                         |
| `isDownloading`          | `boolean`                          | 正在下载更新                         |
| `isRestarting`           | `boolean`                          | 正在重载应用                         |
| `restartCount`           | `number`                           | 本次会话内重载的次数                 |
| `latestManifest`         | `Record<string, ESObject> \| null` | 最近一次拿到的清单                   |
| `downloadedManifest`     | `Record<string, ESObject> \| null` | 已下载更新的清单                     |
| `rollback`               | `UpdatesRollback \| null`          | 回滚信息，没有时为 `null`            |
| `checkError`             | `Record<string, string> \| null`   | 检查失败的错误信息，没有时为 `null`  |
| `downloadError`          | `Record<string, string> \| null`   | 下载失败的错误信息，没有时为 `null`  |
| `downloadProgress`       | `number`                           | 下载进度，0 到 1                     |
| `lastCheckForUpdateTime` | `Date \| null`                     | 上次检查更新的时间                   |
| `sequenceNumber`         | `number`                           | 状态变化的序号，每次变化递增         |
| `downloadStartTime`      | `Date \| null`                     | 下载开始的时间，一次下载完成后才有值 |
| `downloadFinishTime`     | `Date \| null`                     | 下载结束的时间，一次下载完成后才有值 |

#### `UpdatesRollback`

| 属性         | 类型   | 说明           |
| ------------ | ------ | -------------- |
| `commitTime` | `Date` | 回滚发生的时间 |

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
