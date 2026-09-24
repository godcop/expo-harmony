# @expo-harmony/expo-dev-client

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-dev-client) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/dev-client/)

为 HarmonyOS 上的 React Native 应用提供 Expo 开发客户端的依赖聚合，与官方同版本的 `expo-dev-client` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-dev-client expo-dev-client@55.0.40
```

本包适配 Expo SDK 55，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13）。启动器和开发菜单仅在开发构建中启用。

开发构建需要注册 `@expo-harmony/expo-dev-launcher` 的 Config Plugin，插件接受 `launchMode`（默认 `most-recent`，可选 `launcher`）和 `toolsButton`（FAB 初始可见性）两个选项。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
