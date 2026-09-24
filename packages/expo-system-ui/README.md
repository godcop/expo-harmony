# @expo-harmony/expo-system-ui

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-system-ui) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/system-ui/)

为 HarmonyOS 上的 React Native 应用提供 Expo SystemUI 的原生实现，与官方同版本的 `expo-system-ui` 配套使用。支持读取和设置根视图背景色，以及在构建期配置应用的界面模式。

## 安装

```bash
npm install @expo-harmony/expo-system-ui expo-system-ui@55.0.22
```

本包适配 Expo SDK 55 的 `expo-system-ui`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

## Config Plugin

要在构建期配置背景色和界面模式，在 `app.json` 的 `plugins` 中注册 `@expo-harmony/expo-system-ui`，配置写在 `harmony` 字段下。这两项在窗口页面加载完成后应用，不改变系统启动图：

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

`userInterfaceStyle` 在窗口页面加载完成和回到前台时应用。`light` 和 `dark` 把界面模式固定下来。`automatic` 取消本模块先前设置的模式，恢复系统默认的继承行为。API 18 及以上界面模式设置在当前 UIAbility 上，`automatic` 跟随宿主的应用级设置，没有时跟随系统。API 13–17 设置在整个应用上，多个 Ability 共享这一设置。

运行时读写背景色直接使用 `SystemUI.getBackgroundColorAsync` 和 `SystemUI.setBackgroundColorAsync`，插件只用于构建期的初始配置。

## API 对照表

### Methods

#### `SystemUI.getBackgroundColorAsync()`

返回 `Promise<ColorValue | null>`，本模块记录的当前窗口背景色。颜色以 `#rrggbb` 形式的十六进制字符串返回，不带透明度，设置过带透明度的颜色时返回去掉透明度后的值。本模块还没有对当前窗口应用过背景色时返回 `null`。HarmonyOS 不提供读取窗口背景色的接口，宿主绕过本模块直接修改的颜色不会反映在返回值里。

#### `SystemUI.setBackgroundColorAsync(color)`

返回 `Promise<void>`，把当前窗口的背景色改为 `color`。取值与官方一致，接受任意合法的 CSS 3 (SVG) 颜色。窗口背景在 React 树之外，内容渲染前露出的就是这层底色，官方建议在根文件、组件外调用。

窗口页面尚未加载完成时调用会等待页面就绪。等待期间窗口销毁或替换的话，调用被拒绝。宿主须使用 `ExpoRNAbility`，或完整转发生命周期和页面就绪通知。

运行时设置的背景色会持久保存，应用重启后在窗口页面加载完成时恢复，优先级高于构建期配置的背景色。上游 SDK 55 的 Android 会把颜色写入偏好但不做启动恢复，iOS 在启动时恢复，鸿蒙的行为与 iOS 一致。传入 `null` 时清除保存的背景色，恢复当前界面模式的默认色，之后背景色重新跟随界面模式变化。系统存储失败时记录警告，当前窗口的颜色仍然生效，下次启动不保证恢复。

没有设置过背景色时使用默认色：界面模式为 `light` 时白色，`dark` 时黑色，`automatic` 时跟随当前有效的深浅色模式，模式切换后背景跟着变化。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
