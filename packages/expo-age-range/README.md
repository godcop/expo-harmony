# @expo-harmony/expo-age-range

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-age-range) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/age-range/)

为 HarmonyOS 上的 React Native 应用提供 Expo AgeRange 的原生实现，与官方同版本的 `expo-age-range` 配套使用。通过华为 Account Kit 读取系统未成年人模式提供的年龄段。

## 安装

```bash
npm install @expo-harmony/expo-age-range expo-age-range@0.2.17
```

本包适配 Expo SDK 55 的 `expo-age-range`，业务代码从官方包导入。原生模块由 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

## API 对照表

### Methods

#### `AgeRange.requestAgeRangeAsync(options)`

返回 `Promise<AgeRangeResponse>`，读取系统未成年人模式当前提供的年龄段。每次调用都重新查询，不缓存结果。调用不弹出系统界面，也不改变未成年人模式的开关状态。

```ts
import * as AgeRange from 'expo-age-range';

const range = await AgeRange.requestAgeRangeAsync({ threshold1: 18 });
```

未成年人模式开启且系统提供年龄段时，返回对应的整数年龄边界。上限是包含式的，与官方包在 Android 上的语义一致，iOS 上是排除式，跨平台使用时注意区别。

| 系统年龄段 | `lowerBound` | `upperBound` |
| --- | --- | --- |
| 不满 3 周岁 | `0` | `2` |
| 3 周岁及以上，不满 8 周岁 | `3` | `7` |
| 8 周岁及以上，不满 12 周岁 | `8` | `11` |
| 12 周岁及以上，不满 16 周岁 | `12` | `15` |
| 16 周岁及以上，不满 18 周岁 | `16` | `17` |
| 模式关闭或未提供年龄段 | `null` | `null` |

两个 `null` 表示年龄未知，不能据此认定用户成年。官方包在 Web 和 iOS 26 之前的系统上以 `{ lowerBound: 18, upperBound: null }` 模拟成年用户，HarmonyOS 上没有这个取值。

未成年人模式依赖华为账号体系，只在部分设备和账号地区提供，非中国大陆账号或隐私空间可能无法使用，具体条件参见[华为的未成年人模式文档](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/account-api-minorsprotection)。

### Types

#### `AgeRangeRequest`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `threshold1` | `number` | 必填年龄阈值，仅 iOS 使用 |
| `threshold2` | `number` | 可选年龄阈值，仅 iOS 使用 |
| `threshold3` | `number` | 可选年龄阈值，仅 iOS 使用 |

HarmonyOS 与 Android 一样接受并忽略阈值参数，年龄段由系统未成年人模式决定。

#### `AgeRangeResponse`

| 属性 | 类型 | HarmonyOS 行为 |
| --- | --- | --- |
| `lowerBound` | `number \| null` | 包含式年龄下限，未知时为 `null` |
| `upperBound` | `number \| null` | 包含式年龄上限，未知时为 `null` |

> **未实现的内容**
>
> - `ageRangeDeclaration`、`activeParentalControls`：iOS 专属字段，HarmonyOS 没有年龄声明和家长控制信息。
> - `installId`、`userStatus`、`mostRecentApprovalDate`：Android 专属字段，HarmonyOS 没有对应的年龄验证和监管信息。

### 错误码

调用失败时 Promise 拒绝，`code` 的取值如下。

| 错误码 | 说明 |
| --- | --- |
| `ERR_AGE_RANGE_NOT_AVAILABLE` | 设备或当前用户空间不支持未成年人模式 |
| `ERR_AGE_RANGE_UNKNOWN_RESPONSE` | 系统返回的年龄边界不合法 |
| Account Kit 错误码 | 其他查询失败时透传账号服务的错误码和消息 |
| `ERR_AGE_RANGE_REQUEST_FAILED` | 查询失败且系统没有返回错误码 |

> **未实现的内容**
>
> - `ERR_AGE_RANGE_USER_DECLINED`、`ERR_AGE_RANGE_INVALID_REQUEST`：iOS 专属错误码，HarmonyOS 上没有确认弹窗，阈值参数也不参与校验，不会出现。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
