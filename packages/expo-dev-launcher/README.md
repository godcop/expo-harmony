# @expo-harmony/expo-dev-launcher

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-dev-launcher) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/dev-client/)

为 HarmonyOS 上的 Expo 开发构建提供原生启动器，支持项目地址、最近项目、mDNS 发现、系统扫码和返回主页。与官方同版本的 `expo-dev-launcher` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-dev-launcher expo-dev-launcher@55.0.36
```

本包适配 Expo SDK 55 的 `expo-dev-launcher`，提供鸿蒙端的原生启动器，原生模块通过 Expo Harmony 自动链接。启动器只在开发构建中生效，配置插件负责写入开发链接入口和所需权限，见下文。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

使用 `@expo-harmony/expo-dev-client` 时本包由其引入，无需单独安装，但仍需按下文显式注册本包的配置插件。`@expo-harmony/expo-dev-client` 只聚合依赖，不提供插件入口。

## Config Plugin

```json
{
  "expo": {
    "plugins": [
      [
        "@expo-harmony/expo-dev-launcher",
        {
          "launchMode": "launcher",
          "toolsButton": true
        }
      ]
    ],
    "harmony": {
      "bundleName": "com.example.app"
    }
  }
}
```

`launchMode` 取 `most-recent`（默认）或 `launcher`。前者尝试加载最近项目，失败时留在启动器并显示错误。后者跳过最近项目，始终显示启动器。`toolsButton` 控制开发菜单 FAB 的默认值，用户保存的偏好优先。

插件在原生工程中添加 `expo-harmony://open?url=...` 的链接入口、网络权限和启动模式配置。开发链接在普通 Linking 分发前被消费，应用自身的深链接不受影响。扫码使用系统扫码界面，不额外申请应用相机权限。Release 构建保留链接入口，启动器不启用，开发链接也不被消费。

## API 对照表

### Methods

#### `ExpoDevLauncher.loadApp(url)`

返回 `Promise<void>`，加载并启动一个开发项目。接受 HTTP(S) 项目地址、`exp://`、`exps://` 地址和开发客户端链接（`expo-harmony://open?url=...`），带凭据、fragment 或编码无效的地址会被拒绝，错误也会显示在启动器界面。一次加载未完成时又收到新地址，以最新的为准。Release 构建中调用直接返回。

以 `.bundle` 或 `.js` 结尾的地址按 Metro bundle 加载，其余地址按开发清单处理。清单会与客户端内置的运行时信息逐项比较，runtimeVersion、Expo / RNOH / Hermes 版本、已编入的原生模块和权限要求都要匹配，项目不能要求客户端没有编入的原生能力。已发布的项目需要客户端编入 `@expo-harmony/expo-updates`，由 Updates 下载并提供本地 bundle，没有 Updates 时这类项目拒绝加载。

### Native Modules

#### `EXDevLauncher.getConstants()`

提供 `manifestString` 和 `manifestURL`，分别是当前项目清单的 JSON 字符串和清单地址。未选择项目时两者均为 `null`。只在开发构建中可用。

### 启动器

启动器界面列出最近项目和局域网内 mDNS 发现的开发服务，也可以手动输入地址或系统扫码。最近项目按地址去重，保存三天。扫码使用系统扫码界面，不申请相机权限，设备不支持时提示错误。

开发菜单中的 Home 退出当前项目，回到启动器界面。上一次启动的运行时错误会记录下来，最多 32 KiB，保留三天。下次启动时读取一次并显示在启动器界面，应用停留在启动器，不自动重新进入失败的项目。系统原生崩溃不在此列。

> **未实现的内容**
>
> - 账户登录、EAS 分支浏览。HarmonyOS 开发客户端没有接入 EAS 账户体系。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
