# @expo-harmony/expo-updates

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-updates)

为 HarmonyOS 上的 React Native 应用提供 Expo Updates 的原生实现，与官方同版本的 `expo-updates` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-updates expo-updates@55.0.24
```

在应用配置里设置更新服务和运行时版本：

```json
{
  "expo": {
    "runtimeVersion": "1.0.0",
    "updates": {
      "url": "https://example.com/manifest"
    }
  }
}
```

更新流程用官方 JavaScript API 驱动：

```ts
import * as Updates from 'expo-updates';

const result = await Updates.checkForUpdateAsync();
if (result.isAvailable) {
  await Updates.fetchUpdateAsync();
  await Updates.reloadAsync();
}
```

构建时 CLI 会生成内置更新清单和资源。普通 Metro 开发模式不启用 OTA，要验证原生更新流程，把 `updates.useNativeDebug` 设为 `true`。更新服务器需要支持 Harmony 平台和对应的 Expo Updates 协议，客户端支持不代表 EAS 云端已经支持 Harmony 的构建和发布。

客户端身份由 `expo-eas-client` 提供。日志存在 Updates 数据库之外，用 `readLogEntriesAsync` 读取、`clearLogEntriesAsync` 清理。错误观察由 Expo 宿主完成，错误恢复、回滚和最终终止由本包实现。重载时会显示 ArkUI 编写的重载画面。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
