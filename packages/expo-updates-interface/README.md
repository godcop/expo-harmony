# @expo-harmony/expo-updates-interface

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-updates-interface)

为 HarmonyOS 原生模块提供 Updates 控制器、开发启动器和状态订阅的接口定义，宿主和开发工具通过它们访问已注册的 Updates 实现。

## 安装

```bash
npm install @expo-harmony/expo-updates-interface
```

原生代码通过注册表拿到当前控制器：

```ts
import { UpdatesControllerRegistry } from '@expo-harmony/expo-updates-interface';

const controller = UpdatesControllerRegistry.controller;
const subscription = controller?.subscribeToUpdatesStateChanges({
  updatesStateDidChange: event => console.info(JSON.stringify(event)),
});
const context = subscription?.getContext();
subscription?.remove();
```

事件带 `type` 和对应的负载。`getContext()` 返回一份独立的状态快照，时间字段是 `Date`，控制器未激活时可能返回 `null`。订阅不用了要调用 `remove()`，重复调用没有副作用。

注册表在每个进程里保存控制器的弱引用，控制器的生命周期由实现方管理。本包不依赖 expo-modules-core、RNOH 和 Manifest，也没有 JavaScript 原生桥接 API。应用侧的更新功能请使用官方 `expo-updates`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
