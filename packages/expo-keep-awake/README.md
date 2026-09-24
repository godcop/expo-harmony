# @expo-harmony/expo-keep-awake

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-keep-awake) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/keep-awake/)

为 HarmonyOS 上的 React Native 应用提供 Expo KeepAwake 的原生实现，与官方同版本的 `expo-keep-awake` 配套使用。支持按标签保持屏幕常亮、释放常亮请求，以及查询功能可用性。

## 安装

```bash
npm install @expo-harmony/expo-keep-awake expo-keep-awake@55.0.8
```

鸿蒙适配会通过 Autolinking 自动接入。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也需满足此要求。

保持屏幕常亮基于窗口能力实现。应用进入后台时会暂停屏幕常亮，返回前台后按仍然有效的标签恢复；所有标签释放后恢复系统默认的屏幕休眠行为。系统仍可能根据自身策略恢复自动灭屏，异源虚拟屏不保证常亮，应只在导航、视频等必要的屏幕交互场景使用。前后台切换等生命周期中的系统操作失败只记录警告，系统持续故障时无法保证窗口常亮状态，后续请求或切换会重新尝试。

本包的原生实现依赖宿主 Ability 的生命周期事件，对应的订阅器已在包内声明。CNG 工程由 prebuild 自动生成所需入口；Bare 工程需按 [接入说明](https://github.com/renbaoshuo/expo-harmony/blob/master/docs/BareInstallation.md) 手动接入 AbilityStage 和 ExpoRNAbility。

业务代码依旧使用官方包：

```ts
import * as KeepAwake from 'expo-keep-awake';

await KeepAwake.activateKeepAwakeAsync('MyTag');
await KeepAwake.deactivateKeepAwake('MyTag');
```

## API 对照表

### Constants

#### `KeepAwake.ExpoKeepAwakeTag`

类型：`'ExpoKeepAwakeDefaultTag'`

未指定标签时使用的默认标签。

### Hooks

#### `useKeepAwake(tag, options)`

返回 `void`，组件挂载期间保持屏幕常亮，卸载时释放。`tag` 省略时使用该组件唯一的 ID。`options` 见 `KeepAwakeOptions`。

### Methods

#### `KeepAwake.activateKeepAwake(tag)`

已废弃，改用 `activateKeepAwakeAsync()`。返回 `Promise<void>`，转发给后者，调用时打印一条废弃提示。

#### `KeepAwake.activateKeepAwakeAsync(tag)`

返回 `Promise<void>`，按标签请求屏幕常亮。`tag` 省略时使用 `ExpoKeepAwakeTag`。同一标签重复激活不叠加，多个标签各自独立，全部释放前屏幕不会休眠。

设置的是当前 React Native 窗口的常亮状态，不修改系统屏幕休眠设置，也不影响其他窗口。窗口尚未就绪或设置失败时拒绝。常亮标志是窗口的共享属性，其他模块直接修改同一窗口的常亮状态时，需要业务层自行协调。

#### `KeepAwake.deactivateKeepAwake(tag)`

返回 `Promise<void>`，释放标签对应的常亮请求。`tag` 省略时使用 `ExpoKeepAwakeTag`。释放没有激活过的标签不会报错。

#### `KeepAwake.isAvailableAsync()`

返回 `Promise<boolean>`，普通 UI runtime 为 `true`，headless runtime 为 `false`。它表示能力可用性，不保证当前主窗口已就绪；headless runtime 调用激活或释放会拒绝。

### Event Subscriptions

> **未实现的内容**
>
> - `KeepAwake.addListener(tagOrListener, listener)`：HarmonyOS 没有常亮状态变化事件，调用抛出 `UnavailabilityError`。

### Types

#### `KeepAwakeOptions`

`useKeepAwake` 的选项。

| 属性                         | 类型                | 说明                                                                                            |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------------------------------- |
| `suppressDeactivateWarnings` | `boolean`           | 抑制 Hook 卸载时释放失败产生的未处理拒绝；HarmonyOS 上窗口操作失败、runtime 失效或 headless 调用也可能拒绝 |
| `listener`                   | `KeepAwakeListener` | Web 专属，HarmonyOS 上不触发                                                                    |

> **未实现的内容**
>
> - `KeepAwakeEvent`：Web 专属类型，HarmonyOS 上没有触发来源。
> - `KeepAwakeListener`：Web 专属类型，HarmonyOS 上不会调用。

### Enums

> **未实现的内容**
>
> - `KeepAwakeEventState`：Web 专属枚举，HarmonyOS 上没有取值来源。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
