# @expo-harmony/expo-system-ui

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-system-ui) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/system-ui/)

为 HarmonyOS 上的 React Native 应用提供 Expo SystemUI 的原生实现，与官方同版本的 `expo-system-ui` 配套使用。支持读取和设置根视图背景色，以及在构建期配置应用的界面模式。

## 安装

```bash
npm install @expo-harmony/expo-system-ui expo-system-ui@55.0.18
```

本包适配 Expo SDK 55 的 `expo-system-ui`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

## Config Plugin

背景色和界面模式需要在 JavaScript 启动前应用时，在 `app.json` 的 `plugins` 中注册 `@expo-harmony/expo-system-ui`，配置写在 `harmony` 字段下：

```json
{
  "expo": {
    "plugins": ["@expo-harmony/expo-system-ui"],
    "harmony": {
      "bundleName": "com.example.app",
      "backgroundColor": "#FFFFFF",
      "userInterfaceStyle": "automatic"
    }
  }
}
```

`backgroundColor` 接受任意合法的 CSS 颜色。`userInterfaceStyle` 取 `light`、`dark` 或 `automatic`，省略时按 `light` 处理。两项都优先取 `harmony` 字段下的值，没有时回退到 Expo 顶层的同名配置；官方插件里这两项分别只对 Android 和 iOS 生效，鸿蒙统一从 `harmony` 字段读取。

`userInterfaceStyle` 在应用启动和回到前台时应用：`light` 和 `dark` 把界面模式固定下来，不再跟随系统设置；`automatic` 跟随系统。API 18 及以上把界面模式设置在当前 UIAbility 上，API 13–17 设置在整个应用，单 Ability 应用两种行为没有区别。

只通过 `SystemUI.getBackgroundColorAsync` 和 `SystemUI.setBackgroundColorAsync` 在运行时读写背景色的话，不需要注册插件。

## API 对照表

### Methods

#### `SystemUI.getBackgroundColorAsync()`

返回 `Promise<ColorValue | null>`，当前窗口的背景色。颜色以 `#rrggbb` 形式的十六进制字符串返回，不带透明度，设置过带透明度的颜色时返回去掉透明度后的值。当前窗口还没有应用过背景色时返回 `null`。

#### `SystemUI.setBackgroundColorAsync(color)`

返回 `Promise<void>`，把当前窗口的背景色改为 `color`。取值与官方一致，接受任意合法的 CSS 3 (SVG) 颜色。窗口背景在 React 树之外，内容渲染前露出的就是这层底色，官方建议在根文件、组件外调用。

运行时设置的背景色会持久保存，应用重启后从窗口创建起就恢复保存的颜色，不用等 JavaScript 执行，优先级高于构建期配置的背景色；官方平台上运行时设置不做持久化。传入 `null` 时清除保存的背景色，恢复当前界面模式的默认色，之后背景色重新跟随界面模式变化。

没有设置过背景色时使用默认色：界面模式为 `light` 时白色，`dark` 时黑色，`automatic` 时跟随系统深浅色模式，系统切换模式后背景跟着变化。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
