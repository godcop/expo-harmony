# @expo-harmony/expo-symbols

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-symbols) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/symbols/) | [鸿蒙图标库](https://developer.huawei.com/consumer/cn/design/harmonyos-symbol)

为 HarmonyOS 上的 React Native 应用提供 Expo Symbols 的原生实现，与官方同版本的 `expo-symbols` 配套使用。支持显示鸿蒙系统图标、调整尺寸与字重，以及单色、分层和多色渲染。

## 安装

```bash
npm install @expo-harmony/expo-symbols expo-symbols@55.0.9
```

本包适配 Expo SDK 55 的 `expo-symbols`，原生模块通过 Expo Harmony 自动链接，不需要配置插件或申请权限。最低支持 HarmonyOS 6.0.0（API 20），宿主的 `compatibleSdkVersion` 也要满足这一要求。

业务代码从官方包导入，分别指定各平台的图标名称：

```tsx
import { SymbolView } from 'expo-symbols';

const home = {
  ios: 'house.fill',
  android: 'home',
  web: 'home',
  harmony: 'house_fill',
} as const;

<SymbolView name={home} size={24} tintColor="#007AFF" />;
```

只提供鸿蒙名称时，使用本包的类型声明：

```tsx
import { SymbolView } from 'expo-symbols';
import type { HarmonySymbolName } from '@expo-harmony/expo-symbols/src';

const home: HarmonySymbolName = { harmony: 'house_fill' };

<SymbolView name={home} />;
```

上游 TypeScript 声明不包含 `harmony` 字段，需使用上述变量写法，不能直接在上游组件上内联 `name={{ harmony: 'house_fill' }}`。

## API 对照表

### Component

#### `SymbolView`

显示鸿蒙系统图标的视图，除下列属性外还接受 `ViewProps`。

#### `name`

类型：`string | HarmonySymbolName`，必填

只读取对象形式中的 `harmony` 字段，值为鸿蒙系统图标的短名称，例如 `house_fill`。名称为空、写法无效或系统中没有对应资源时渲染 `fallback`。

传字符串时保持上游的 SF Symbols 语义，在鸿蒙上渲染 `fallback`。对象中只有 `ios`、`android` 或 `web` 字段时同样渲染 `fallback`，不做名称转换。不支持 `sys.symbol.` 前缀、资源 ID、Unicode 字符和 `app.symbol` 自定义资源。

系统图标库随 HarmonyOS 版本扩充。较旧系统上缺少新图标的资源，也会渲染 `fallback`。

#### `fallback`

类型：`React.ReactNode`

`name` 没有取到鸿蒙图标时渲染的内容，不设置时不渲染任何元素。

#### `size`

类型：`number`，默认 `24`

图标字号，单位 vp，不随系统字体大小设置变化。接受非负的有限数值，`0` 隐藏图形，负数或非有限数值抛出 `RangeError`。

容器默认为 `size × size`，`style` 中的尺寸优先。容器大于图形时字形不会随之放大，在容器内居中显示。

#### `weight`

类型：`SymbolWeight | { ios, android }`，默认 `'unspecified'`

接受上游的字重字符串，`ultraLight` 到 `black` 映射为系统字重 100 到 900。省略、`unspecified` 或传入对象时按 400 显示，不读取其他平台的字重值。

能否变重由图标资源决定，部分图标没有提供多字重，仍按资源的默认字重显示。

#### `type`

类型：`SymbolType`，默认 `'monochrome'`

`monochrome` 单色渲染，`hierarchical` 按图层透明度分层，`palette` 使用 `colors` 调色板，`multicolor` 使用系统多色。同一名称的图标与 SF Symbols 的图层划分和配色不同，实际效果以鸿蒙图标资源为准。

#### `tintColor`

类型：`ColorValue`

接受 React Native 颜色，包括透明色。无法转换的颜色抛出 `TypeError`，例如部分动态颜色对象。

设置后整体着色，优先于 `colors`。`hierarchical` 类型保留分层透明度，其余类型整图使用同一颜色。移除属性后恢复 `colors` 调色板或系统默认配色。

#### `colors`

类型：`ColorValue | ColorValue[]`

接受单个颜色或颜色数组，仅在 `type` 为 `palette` 且没有设置 `tintColor` 时生效。与上游 iOS 一致，至少两个颜色才应用调色板，最多使用前三个。

> **未实现的内容**
>
> - `scale`、`resizeMode`：忽略，保持固定字号和居中显示。
> - `animationSpec`：忽略，图标静态显示。

### Methods

#### `unstable_getMaterialSymbolSourceAsync(symbol, size, color)`

返回 `Promise<null>`，与上游在 iOS 上的行为一致。鸿蒙没有 Material 图标，也不会通过这个接口导出鸿蒙图标。

### Types

#### `HarmonySymbolName`

在上游平台名称对象的基础上增加可选的 `harmony?: string`，从 `@expo-harmony/expo-symbols/src` 以 `import type` 导入。其余公共类型复用上游声明。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
