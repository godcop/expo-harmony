# @expo-harmony/expo-eas-client

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-eas-client)

为 HarmonyOS 上的 React Native 应用提供 EAS 客户端身份，与官方同版本的 `expo-eas-client` 配套使用。对外提供两个值：安装级的客户端 ID，以及从这个 ID 派生的确定性采样值。

## 安装

```bash
npm install @expo-harmony/expo-eas-client expo-eas-client@55.0.5
```

应用侧从官方包读取：

```ts
import { clientID, deterministicUniformValue } from 'expo-eas-client';
```

ID 存在应用沙箱的一个文件里，和 Updates 数据库分开。读写这个文件前会先加文件锁，新值先写临时文件再改名替换，所以 UIAbility 和 ExtensionAbility 拿到的是同一个 ID。React 重载和应用重启都不会改变它，卸载应用或清掉沙箱数据后才会重新生成。

文件不存在时，先迁移旧的 Preferences 记录，再执行消费者通过 `EASClientID.registerMigration` 登记的迁移（`expo-updates` 用它从旧数据库读取 ID），都没有才生成随机 UUID。读取、校验或写入失败会直接抛错，不会静默换一个新 ID。原生消费者可以从 HAR 导入 `EASClientID`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
