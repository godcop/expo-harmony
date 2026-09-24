# @expo-harmony/expo-navigation-bar

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-navigation-bar) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/navigation-bar/)

为 HarmonyOS 上的 React Native 应用提供 Expo NavigationBar 的原生实现和 JavaScript 适配，与官方同版本的 `expo-navigation-bar` 配套使用。支持读取和设置导航栏背景色、按钮样式、显示状态和布局位置，订阅显示状态变化，以及通过配置插件设置启动时的导航栏外观。

## 安装

```bash
npm install @expo-harmony/expo-navigation-bar expo-modules-core@55.0.26 expo-navigation-bar@55.0.17
```

本包适配 Expo SDK 55 的 `expo-navigation-bar`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

业务代码从官方包导入：

```ts
import * as NavigationBar from 'expo-navigation-bar';

await NavigationBar.setBackgroundColorAsync('#FFFFFF');
NavigationBar.setStyle('auto');
```

如果需要在启动时应用导航栏初始设置，请在 `app.json` 的 `plugins` 中传入 `@expo-harmony/expo-navigation-bar`：

```json
{
  "expo": {
    "plugins": [
      [
        "@expo-harmony/expo-navigation-bar",
        {
          "backgroundColor": "#FFFFFF",
          "barStyle": "dark",
          "position": "relative",
          "visibility": "visible"
        }
      ]
    ]
  }
}
```

配置插件接受 `backgroundColor`（背景色）、`barStyle`（按钮样式，`light` 或 `dark`）、`position`（布局位置，`relative` 或 `absolute`）和 `visibility`（显示状态，`visible` 或 `hidden`），取值与对应的运行时接口一致，在窗口创建时应用。运行时接口可以独立使用。

HarmonyOS 没有导航栏分隔线颜色、Android 导航栏唤出行为和强制对比度，配置插件不接受 `borderColor`、`behavior` 和 `enforceContrast`，传入会报错。

2in1 设备不支持设置系统栏外观。分屏、悬浮等非全屏且非最大化的窗口中，外观和显示状态的设置可能延后生效或不生效，Promise 完成不代表系统栏已经更新。

本包的原生实现依赖宿主 Ability 的生命周期事件，订阅器已在包内声明。CNG 工程由 prebuild 自动生成所需入口；Bare 工程需按[接入说明](https://github.com/renbaoshuo/expo-harmony/blob/master/docs/BareInstallation.md)手动接入 AbilityStage 和 ExpoRNAbility。

## API 对照表

### Hook

#### `useVisibility()`

返回 `NavigationBarVisibility | null`，导航栏当前的显示状态。首次读取完成前为 `null`，之后随显示状态变化更新。

### Methods

#### `NavigationBar.setBackgroundColorAsync(color)`

返回 `Promise<void>`，设置三键导航栏背景色。`color` 接受 React Native 支持的颜色格式，无法解析时抛出 `TypeError`。该接口在 Android 上已被官方废弃且不生效，HarmonyOS 上设置有效。

#### `NavigationBar.getBackgroundColorAsync()`

返回 `Promise<string>`，当前导航栏背景色，形如 `#rrggbbaa`。HarmonyOS 未返回背景色时抛出错误。

#### `NavigationBar.setButtonStyleAsync(style)`

返回 `Promise<void>`，设置三键导航栏按钮颜色，`light` 为浅色按钮，`dark` 为深色按钮。官方已废弃该接口并建议改用 `setStyle`，HarmonyOS 上仍然可用，不控制手势指示条颜色。

#### `NavigationBar.getButtonStyleAsync()`

返回 `Promise<NavigationBarButtonStyle>`，由系统导航栏内容的颜色按亮度判断。系统未返回内容颜色时抛出错误。

#### `NavigationBar.setPositionAsync(position)`

返回 `Promise<void>`，设置系统栏布局位置，同时影响状态栏和导航栏。`absolute` 表示应用内容延伸到系统栏下方，属于沉浸式布局，应用需要自行处理安全区。`relative` 表示内容避开系统栏。该接口在 Android 上已被官方废弃且不生效，HarmonyOS 上设置有效。

RNOH 页面默认运行在沉浸式布局下，关闭沉浸式会影响 `SafeAreaView` 的避让。使用 `relative` 时需检查应用的安全区布局，避免重复避让。

#### `NavigationBar.unstable_getPositionAsync()`

返回 `Promise<NavigationBarPosition>`，当前布局位置。Android 上恒返回 `relative`，HarmonyOS 上返回真实值。

#### `NavigationBar.setVisibilityAsync(visibility)`

返回 `Promise<void>`，显示或隐藏导航栏。`hidden` 会连同手势指示条一起隐藏；设备没有手势指示条时只处理导航栏本身。

#### `NavigationBar.getVisibilityAsync()`

返回 `Promise<NavigationBarVisibility>`，由系统避让区判断导航栏是否可见。

#### `NavigationBar.setStyle(style)`

返回值为空，按调用时应用的颜色方案把样式映射成按钮颜色：`light` 配深色按钮，`dark` 配浅色按钮，`auto` 使用当前颜色方案，`inverted` 与当前颜色方案相反。只调整三键导航栏按钮颜色，不改变背景色或手势指示条颜色，设置失败时输出警告。样式在调用时确定，不跟随之后的主题变化，主题切换后需要再次调用。

> **未实现的内容**
>
> - `setBorderColorAsync()`、`getBorderColorAsync()`：HarmonyOS 没有导航栏分隔线。读取恒返回透明色 `'#00000000'`，设置只输出警告。
> - `setBehaviorAsync()`、`getBehaviorAsync()`：Android 的导航栏唤出行为在 HarmonyOS 上没有对应设置。读取恒返回 `'inset-touch'`，设置只输出警告。

### Event Subscriptions

#### `NavigationBar.addVisibilityListener(listener)`

返回 `EventSubscription`，导航栏显示状态变化时触发回调。与官方行为一致，状态栏显隐变化也会触发。

### Types

#### `NavigationBarVisibility`

`'visible' | 'hidden'`，导航栏显示状态。

#### `NavigationBarButtonStyle`

`'light' | 'dark'`，导航栏按钮颜色。`light` 是浅色按钮，配深色导航栏；`dark` 是深色按钮，配浅色导航栏。

#### `NavigationBarStyle`

`'auto' | 'inverted' | 'light' | 'dark'`，`setStyle()` 的取值。`light` 表示浅色导航栏，`dark` 表示深色导航栏，`auto` 跟随应用主题，`inverted` 与应用主题相反。

#### `NavigationBarVisibilityEvent`

| 属性            | 类型                      | 说明         |
| --------------- | ------------------------- | ------------ |
| `visibility`    | `NavigationBarVisibility` | 当前显示状态 |
| `rawVisibility` | `number`                  | 原始可见性值 |

HarmonyOS 没有完整的 Android 系统 UI 位掩码，`rawVisibility` 只保留两个兼容值：`2` 表示导航栏隐藏，`0` 表示导航栏可见。

#### `NavigationBarBehavior`

`'overlay-swipe' | 'inset-swipe' | 'inset-touch'`，官方已废弃。HarmonyOS 上没有对应的唤出行为，只有 `'inset-touch'` 会作为读取值出现。

#### `NavigationBarPosition`

`'relative' | 'absolute'`，导航栏布局位置。官方已废弃，HarmonyOS 上 `setPositionAsync()` 和 `unstable_getPositionAsync()` 仍在使用。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
