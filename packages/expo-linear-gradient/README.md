# @expo-harmony/expo-linear-gradient

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-linear-gradient) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/linear-gradient/)

为 HarmonyOS 上的 React Native 应用提供 Expo LinearGradient 的原生实现，与官方同版本的 `expo-linear-gradient` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-linear-gradient expo-linear-gradient@55.0.18
```

本包适配 Expo SDK 55 的 `expo-linear-gradient`，业务代码继续从官方包导入，原生部分由 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。渐变由系统绘制能力渲染，颜色插值、抗锯齿和透明色混合与 Android / iOS 不保证逐像素一致。

## API 对照表

### Component

#### `LinearGradient`

线性渐变视图组件。渐变铺满视图，子组件叠加在渐变之上。渐变层不接收触摸事件，触摸会落到子组件上。

`style` 上的 `borderRadius` 和各角圆角属性用于裁剪渐变。

#### `colors`

类型：`readonly [ColorValue, ColorValue, ...ColorValue[]]`

渐变的颜色序列，按顺序参与渲染。至少需要两个颜色，少于两个时不绘制，保留上一次的渐变。

#### `locations`

类型：`readonly [number, number, ...number[]] | null`，默认 `null`

每个颜色在渐变轴上的位置，取值 0 到 1，数量与 `colors` 一致。不传时颜色均匀分布。位置必须从小到大排列，取相同值可以得到硬过渡。位置数量多于颜色时会先在控制台警告并截断到相同长度；少于颜色、取值越界或顺序不对时同样不绘制。`locations` 没有覆盖 0 到 1 的两端时，首尾颜色向渐变轴两端延伸。

#### `start`

类型：`LinearGradientPoint | null`，默认 `{ x: 0.5, y: 0 }`

渐变起点，`x`、`y` 是相对视图宽高的比例，可以写成 `{ x, y }` 或 `[x, y]`。取值可以超出 0 到 1，渐变轴延伸到视图之外。

#### `end`

类型：`LinearGradientPoint | null`，默认 `{ x: 0.5, y: 1 }`

渐变终点，写法与 `start` 相同。

> **未实现的内容**
>
> - `dither`：Android 专属属性，用于控制渐变渲染的抖动，HarmonyOS 上不生效。

### Types

#### `LinearGradientPoint`

渐变端点，`{ x: number; y: number }` 或 `[x: number, y: number]`。

#### `NativeLinearGradientPoint`

渐变端点的数组形式，`[x: number, y: number]`。

#### `LinearGradientProps`

`LinearGradient` 的属性类型，在 `ViewProps` 之上增加 `colors`、`locations`、`start`、`end` 和 Android 专属的 `dither`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
