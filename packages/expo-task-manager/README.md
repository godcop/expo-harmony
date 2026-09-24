# @expo-harmony/expo-task-manager

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-task-manager) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/task-manager/)

为 HarmonyOS 上的 React Native 应用提供 Expo Task Manager 的原生实现，与官方同版本的 `expo-task-manager` 配套使用。TaskManager 是后台任务的基础设施：系统触发任务时，它负责启动 JS 运行环境、执行 `defineTask` 定义的任务函数，再把结果回传给注册任务的模块。鸿蒙上通过它运行后台任务的是 expo-background-fetch 和 expo-background-task，任务的注册和系统调度由这两个包各自的接口负责。

## 安装

```bash
npm install @expo-harmony/expo-task-manager expo-task-manager@~55.0.20
```

本包适配 Expo SDK 55 的 `expo-task-manager`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

业务代码从官方包导入：

```ts
import * as TaskManager from 'expo-task-manager';
```

## API 对照表

### Methods

#### `TaskManager.defineTask(taskName, taskExecutor)`

定义名为 `taskName` 的任务函数。任务触发时以 `TaskManagerTaskBody` 为参数调用，函数 resolve 的值作为执行结果回传给注册该任务的模块。`taskName` 要与注册时使用的名称一致。

调用必须发生在 JS 全局作用域，不能放在 React 组件的生命周期方法里：任务可能在应用未启动时触发，那时只加载 JS 代码，没有组件被挂载。

已注册但未定义的任务被执行时，会打印警告并自动注销该任务。

#### `TaskManager.getRegisteredTasksAsync()`

返回 `Promise<TaskManagerTask[]>`，当前应用注册的全部任务。注册信息保存在应用的持久存储中，应用重启后仍保留。

#### `TaskManager.getTaskOptionsAsync(taskName)`

返回 `Promise<TaskOptions>`，注册该任务时传入的选项。任务不存在时返回 `null`。

#### `TaskManager.isAvailableAsync()`

返回 `Promise<boolean>`，HarmonyOS 上始终为 `true`。官方文档提到的 Expo Go 限制不适用于鸿蒙。

#### `TaskManager.isTaskDefined(taskName)`

返回 `boolean`，任务是否已用 `defineTask` 定义。

#### `TaskManager.isTaskRegisteredAsync(taskName)`

返回 `Promise<boolean>`，任务是否已注册。注册信息跨会话保留。

#### `TaskManager.unregisterTaskAsync(taskName)`

注销任务，返回 `Promise<void>`。任务未注册时拒绝。官方建议优先使用注册该任务的模块提供的注销方法，例如 `BackgroundFetch.unregisterTaskAsync`。

#### `TaskManager.unregisterAllTasksAsync()`

注销当前应用注册的全部任务，返回 `Promise<void>`。没有已注册任务时直接返回。适合用户退出登录这类不再需要后台任务的场景。

### Interfaces

#### `TaskManagerError`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `code` | `string \| number` | 错误码 |
| `message` | `string` | 错误信息 |

任务失败时，错误通过 `TaskManagerTaskBody` 的 `error` 字段送达。

#### `TaskManagerTask`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `taskName` | `string` | 注册时使用的任务名 |
| `taskType` | `string` | 任务类型，由注册它的模块决定 |
| `options` | `any` | 注册时传入的选项 |

#### `TaskManagerTaskBody`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `data` | `T` | 任务数据，结构由任务类型决定 |
| `error` | `TaskManagerError \| null` | 任务携带的错误，否则为 `null` |
| `executionInfo` | `TaskManagerTaskBodyExecutionInfo` | 本次执行的信息 |

#### `TaskManagerTaskBodyExecutionInfo`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `eventId` | `string` | 本次执行的 ID，任务完成时随结果回传 |
| `taskName` | `string` | 任务名 |
| `appState?` | `'active' \| 'background' \| 'inactive'` | 应用状态。官方标记为 iOS 专属字段，鸿蒙上不返回 |

### Types

#### `TaskManagerTaskExecutor`

任务函数的类型：`(body: TaskManagerTaskBody<T>) => Promise<any>`，作为 `defineTask` 的第二个参数传入。单次执行最长两分钟，超时后本次执行结束，任务函数之后 resolve 的结果会被丢弃。系统可能在任务完成前终止应用进程，HarmonyOS 不保证任务恰好执行一次，任务函数中的副作用需要业务代码容忍重复或丢失。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
