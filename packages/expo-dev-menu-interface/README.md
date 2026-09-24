# @expo-harmony/expo-dev-menu-interface

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-dev-menu-interface)

为 HarmonyOS 原生模块提供 Expo Dev Menu 的管理、桥接、宿主代理和键盘响应接口。与官方同版本的 `expo-dev-menu-interface` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-dev-menu-interface expo-dev-menu-interface@55.0.2
```

本包适配 Expo SDK 55 的 `expo-dev-menu-interface`，只包含鸿蒙端的 ArkTS 接口定义，JavaScript 侧继续使用官方包。原生 HAR 通过 Expo Harmony 自动链接。纯 ArkTS 模块也可以直接在 OHPM 清单中依赖 `@expo-harmony/expo-dev-menu-interface`。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

## API 对照表

### Interfaces

#### `DevMenuManagerProtocol`

定义菜单的可见状态和开关操作，成员有 `isVisible`、`openMenu(screen?)`、`closeMenu()`、`hideMenu()` 和 `toggleMenu()`。方法同步返回是否接受这次状态变更，界面随后异步完成。`screen` 省略或传入 `null` 时打开默认页面。

官方接口里 `closeMenu()` 用来发起收起，`hideMenu()` 用来完成隐藏。鸿蒙端的菜单由 ArkUI 原生对话框承载，两个方法走同一个异步关闭流程。

#### `DevMenuBridgeProtocol`

三个成员都是可选的。`module(name)` 按名称查找原生模块，不存在时返回 `null`，`modulesConforming(conforms)` 返回通过检查函数的全部模块，`requestReload()` 请求重载。

> **未实现的内容**
>
> - 桥协议的提供方。RNOH 的公开接口拿不到完整的原生模块列表，返回部分结果会误导调用方。

#### `DevMenuHostDelegate`

宿主通过可选成员介入菜单行为。`devMenuNavigateHome()` 返回宿主首页，`devMenuTogglePerformanceMonitor()` 和 `devMenuToggleElementInspector()` 接管对应工具，`devMenuShouldShowReactNativeDevMenu()` 控制是否显示 React Native 菜单入口，省略时默认 `true`。菜单检查到对应成员时使用宿主实现，否则执行默认行为。代理随 React Native 实例注册和解绑。

#### `DevMenuUIResponderExtensionProtocol`

`EXDevMenu_handleKeyCommand(key)` 接收 ArkUI 键盘事件，宿主可以在根视图的 `onKeyEvent` 中转交。本接口不安装全局键盘监听。

菜单的具体行为见 `@expo-harmony/expo-dev-menu` 的 README。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
