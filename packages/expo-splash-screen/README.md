# @expo-harmony/expo-splash-screen

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-splash-screen) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/splash-screen/)

为 HarmonyOS 上的 React Native 应用提供 Expo SplashScreen 的原生实现，与官方同版本的 `expo-splash-screen` 配套使用。支持控制启动画面的自动隐藏、手动隐藏和淡出过渡，以及通过配置插件设置启动图片、背景色和深色模式资源。

## 安装

```bash
npm install @expo-harmony/expo-splash-screen expo-splash-screen@55.0.25
```

本包适配 Expo SDK 55 的 `expo-splash-screen`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也需满足此要求。

启动画面的外观在预构建时生成，需要在 `app.json` 的 `plugins` 中传入 `@expo-harmony/expo-splash-screen`：

```json
{
  "expo": {
    "plugins": [
      [
        "@expo-harmony/expo-splash-screen",
        {
          "backgroundColor": "#FFFFFF",
          "image": "./assets/splash.png",
          "imageWidth": 160,
          "resizeMode": "contain",
          "dark": {
            "backgroundColor": "#000000",
            "image": "./assets/splash-dark.png"
          }
        }
      ]
    ]
  }
}
```

插件把背景色和图片写入应用资源，冷启动时先由系统启动窗口显示，应用窗口就绪后由应用内的启动画面接续，直到自动隐藏或被 `hide()` 隐藏。应用内的启动画面覆盖整个窗口，显示期间拦截触摸事件。不注册这个插件时，鸿蒙上没有应用内的启动画面。

`backgroundColor` 接受 `#RRGGBB` 或 `#RRGGBBAA`，默认 `#FFFFFF`。`image` 支持 png、jpg、jpeg、svg、webp、gif，未配置时只显示背景色。`resizeMode` 支持 `contain`（默认，按 `imageWidth` 等比缩放后居中显示，宽度默认 100）、`cover`（铺满窗口，超出部分裁剪）和 `native`（原始尺寸居中显示）。

深色模式在 `dark` 中单独配置，背景色缺省时沿用 `backgroundColor`，未配置深色图片时深色模式沿用基础图片。`expo.userInterfaceStyle` 设为 `automatic` 时深浅色资源分开生成，不设置或固定为 `light`、`dark` 时深浅色使用同一套外观。这些选项也可以放在 `harmony` 键下，只对鸿蒙生效。修改配置后需要重新 prebuild。

运行时启动画面默认在首帧内容出现后自动隐藏。要等字体、接口数据等准备就绪后再隐藏，在模块顶层调用 `SplashScreen.preventAutoHideAsync()`，就绪后调用 `SplashScreen.hide()`：

```ts
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

// 加载字体、请求接口等
await SplashScreen.hide();
```

## API 对照表

### Methods

#### `SplashScreen.hide()`

隐藏启动画面。默认在 `duration` 毫秒内淡出，`fade` 为 `false` 或 `duration` 为 0 时直接消失。启动画面未显示时调用无效果。应用内容尚未就绪时调用会直接露出应用界面。

#### `SplashScreen.hideAsync()`

返回 `Promise<void>`。`hide()` 的异步版本，行为一致，官方为向后兼容保留。

#### `SplashScreen.preventAutoHideAsync()`

返回 `Promise<boolean>`，恒为 `true`。阻止启动画面自动隐藏，直到调用 `hide()` 或 `hideAsync()`，不调用隐藏方法的话启动画面会一直显示。官方建议在模块顶层尽早调用、不要等待结果；放在组件或 Hook 里可能调用过晚，启动画面已经自动隐藏，之后再调用也不会让它重新出现。

#### `SplashScreen.setOptions(options)`

设置隐藏启动画面时的淡出动画，在隐藏前设置才有效果。参数为 `SplashScreenOptions`，每次调用整体生效，省略的字段恢复默认值，取值不合法时抛出 `ERR_SPLASH_SCREEN_OPTIONS`。

### Types

#### `SplashScreenOptions`

| 属性       | 类型      | 说明                                        |
| ---------- | --------- | ------------------------------------------- |
| `duration` | `number`  | 淡出动画时长，毫秒，取非负数值，默认 `400` |
| `fade`     | `boolean` | 是否以淡出动画隐藏启动画面，默认 `true`     |

`fade` 在官方文档中标注为 iOS 专属、默认 `false`；鸿蒙上该选项生效且默认开启。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
