# @expo-harmony/expo-network

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-network) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/network/)

为 HarmonyOS 上的 React Native 应用提供 Expo Network 的原生实现，与官方同版本的 `expo-network` 配套使用。支持查询网络类型、连接状态、互联网可达状态、IPv4 地址和飞行模式，以及订阅网络状态变化。

## 安装

```bash
npm install @expo-harmony/expo-network expo-network@55.0.14
```

本包适配 Expo SDK 55 的 `expo-network`，原生模块通过 Expo Harmony 自动链接，不需要配置插件。HAR 已声明 `ohos.permission.GET_NETWORK_INFO`，这是系统授权权限，应用不需要额外申请。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

业务代码从官方包导入：

```ts
import * as Network from 'expo-network';
```

## API 对照表

### Hooks

#### `useNetworkState()`

返回 `NetworkState`。首次渲染返回空对象，挂载后取得当前网络状态，之后随状态变化更新，组件卸载时移除监听。

### Methods

#### `Network.getNetworkStateAsync()`

返回 `Promise<NetworkState>`，当前网络状态。读取系统的默认数据网络：

- 没有默认网络时 `type` 为 `NONE`，`isConnected` 和 `isInternetReachable` 都是 `false`。
- 网络句柄无效或查询网络能力失败时 `type` 为 `UNKNOWN`，两个布尔值都是 `false`。
- 有默认网络时 `isConnected` 为 `true`。`isInternetReachable` 要求网络具备上网能力且系统已验证可以上网，刚接入网络、系统还没完成验证时可能是 `false`。

`type` 按默认网络的承载类型返回。同时具备多种承载时按蜂窝、Wi-Fi、蓝牙、以太网、VPN 的顺序取第一个，都不匹配时为 `UNKNOWN`。该方法不抛错，异常情况都归入 `UNKNOWN`。

#### `Network.getIpAddressAsync()`

返回 `Promise<string>`，默认网络接口的 IPv4 地址。从网络的地址列表里取第一个可用的 IPv4 地址，跳过 `0.0.0.0`、回环地址和 IPv6 地址。没有默认网络或没有可用地址时返回 `"0.0.0.0"`，与官方行为一致。查询系统网络失败时抛出 `ERR_NETWORK_IP_ADDRESS`。

#### `Network.isAirplaneModeEnabledAsync()`

返回 `Promise<boolean>`，飞行模式开关状态。官方标注为 Android 专属接口，在鸿蒙上可用。读取系统设置里的飞行模式开关，开启返回 `true`，关闭或系统没有这项设置时返回 `false`。读取失败或取到不合法的值时抛出 `ERR_NETWORK_AIRPLANE_MODE`。

### Event Subscriptions

#### `Network.addNetworkStateListener(listener)`

订阅网络状态变化，回调收到 `NetworkStateEvent`。返回 `EventSubscription`，调用 `remove()` 取消订阅。

系统的网络可用、丢失、不可用和能力变化都会触发回调，订阅成功后会先回调一次当前状态。底层变化到回调之间约有 250 毫秒的延迟。

### Types

#### `NetworkState`

| 属性                  | 类型               | 说明                 |
| --------------------- | ------------------ | -------------------- |
| `type`                | `NetworkStateType` | 当前网络连接类型     |
| `isConnected`         | `boolean`          | 是否有活动的网络连接 |
| `isInternetReachable` | `boolean`          | 当前网络是否可以上网 |

官方类型把三个字段都声明为可选，鸿蒙上始终有值。`isInternetReachable` 取系统对网络的验证结果；官方在 iOS 上让这个值始终等于 `isConnected`，鸿蒙上两者可以不同。

#### `NetworkStateEvent`

`NetworkState` 的类型别名，作为状态变化回调的参数。

### Enums

#### `NetworkStateType`

| 成员        | 含义               |
| ----------- | ------------------ |
| `NONE`      | 没有活动的网络连接 |
| `UNKNOWN`   | 无法判断连接类型   |
| `CELLULAR`  | 蜂窝移动网络       |
| `WIFI`      | Wi-Fi              |
| `BLUETOOTH` | 蓝牙               |
| `ETHERNET`  | 以太网             |
| `VPN`       | VPN                |

> **未实现的内容**
>
> - `WIMAX`、`OTHER`：Android 专属取值，鸿蒙上没有对应的网络承载类型，不会被返回，未识别的承载类型归入 `UNKNOWN`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
