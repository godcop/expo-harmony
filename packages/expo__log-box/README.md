# @expo-harmony/expo__log-box

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo__log-box)

为 HarmonyOS 开发构建提供 Expo LogBox 的日志检查器和原生错误页面，与官方 `@expo/log-box` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo__log-box @expo/log-box@55.0.12
```

本包适配 Expo SDK 55 的 `@expo/log-box`，提供鸿蒙端的原生视图和错误页。原生模块和视图通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。Expo LogBox 是实验功能，安装后还需要注册配置插件并组合 Metro 配置，两者都要求设置 `EXPO_UNSTABLE_LOG_BOX=1`，见下文。

## Config Plugin

在 `app.json` 的 `plugins` 中注册插件。

```json
{
  "expo": {
    "plugins": ["@expo-harmony/expo__log-box"],
    "harmony": { "bundleName": "com.example.app" }
  }
}
```

再在 `metro.config.js` 中组合配置。

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withHarmonyConfig } = require('@expo-harmony/metro-config');
const { withLogBox } = require('@expo-harmony/expo__log-box/metro');

module.exports = withLogBox(withHarmonyConfig(getDefaultConfig(__dirname)));
```

prebuild、原生构建和 Metro 启动均需设置 `EXPO_UNSTABLE_LOG_BOX=1`（也接受 `true`）。插件把开关写入原生工程配置，原生端只在 debug 构建中启用。变更开关后需重新生成并构建应用，只启用 Metro 时会报告原生配置不匹配。

`@expo-harmony/expo__log-box` 的 `withLogBox` 只改写 HarmonyOS 平台上的模块解析，其他平台和其他包不受影响。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
