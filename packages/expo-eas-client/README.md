# @expo-harmony/expo-eas-client

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-eas-client)

为 HarmonyOS 上的 React Native 应用提供 Expo EAS Client 的原生实现，与官方同版本的 `expo-eas-client` 配套使用。提供 EAS 服务的客户端 ID，以及由这个 ID 派生的确定性采样值。

## 安装

```bash
npm install @expo-harmony/expo-eas-client expo-eas-client@55.0.5
```

本包适配 Expo SDK 55 的 `expo-eas-client`，原生模块通过 Expo Harmony 自动链接，不需要配置插件，也不需要申请权限。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

业务代码从官方包导入：

```ts
import { clientID, deterministicUniformValue } from 'expo-eas-client';
```

## API 对照表

### Constants

#### `clientID`

类型：`string`（官方声明为 `any`）

EAS 服务的客户端 ID。首次访问时生成，保存在应用沙箱的一个文件里，之后每次访问都返回这个值。ID 属于这一次安装：应用更新、React 重载、应用重启都不会改变它，卸载应用或清除应用数据后才会重新生成。应用内所有 Ability（包括 ExtensionAbility）读取到的是同一个值。

沙箱文件不存在时按顺序补齐：先沿用应用内已有的 ID 记录，包括 `expo-updates` 在旧版本存下的记录，都没有才生成随机 UUID。读取、校验或写入失败会抛出错误，不会静默换一个新 ID。

官方在 iOS 和 Android 上把 ID 存在系统托管、默认随备份保留的存储里；鸿蒙上 ID 在应用沙箱里，是否随系统备份保留取决于应用自身的备份配置。

#### `deterministicUniformValue`

类型：`number`

由 `clientID` 派生的确定性数值，官方标注范围为 [0, 1]。同一次安装内取值不变，每次安装各不相同，可用于固定比例的采样和分流。对随机生成的 UUID，实际取值集中在 [0.5, 0.75)，与官方各平台一致。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
