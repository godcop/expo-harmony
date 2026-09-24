# @expo-harmony/expo-mesh-gradient

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-mesh-gradient) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/mesh-gradient/)

为 HarmonyOS 上的 React Native 应用提供 Expo MeshGradient 的原生实现，与官方同版本的 `expo-mesh-gradient` 配套使用。支持网格顶点、颜色插值、透明度和子视图，直接使用官方 JavaScript 实现。

## 安装

```bash
npm install @expo-harmony/expo-mesh-gradient expo-mesh-gradient@55.0.18
```

本包适配 Expo SDK 55 的 `expo-mesh-gradient`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 6.1.0（API 23），宿主的 `compatibleSdkVersion` 也要满足这一要求。网格绘制使用从 API 23 开始提供的 ArkTS `drawing.Canvas.drawVertices`。

## API 对照表

### Component

#### `MeshGradientView`

网格渐变视图，从 `expo-mesh-gradient` 导入。支持 React Native `ViewProps`，子视图显示在渐变上方并保留交互。

```tsx
import { MeshGradientView } from 'expo-mesh-gradient';

<MeshGradientView
  style={{ width: 300, height: 300 }}
  columns={2}
  rows={2}
  points={[[0, 0], [1, 0], [0, 1], [1, 1]]}
  colors={['red', 'orange', 'blue', 'purple']}
/>;
```

#### `columns` / `rows`

类型：`number`，默认 `0`。分别为每行、每列的顶点数量，取非负整数。空网格以及不足两行或两列的网格不绘制三角形。

#### `points`

类型：`number[][]`，默认 `[]`。按行排列的二维顶点，长度须为 `columns * rows`。每个坐标相对于视图宽高，必须是有限数值，允许超出 `[0, 1]`，超出视图的图形会被裁剪。坐标重合的边保留重合端点。

#### `colors`

类型：`ColorValue[]`，默认 `[]`。每个顶点的颜色，长度须为 `columns * rows`，支持透明度。官方 JavaScript 使用 `processColor` 转换为 ARGB 整数；与 Android 一样，不支持对象形式的动态原生颜色。

#### `smoothsColors`

类型：`boolean`，默认 `true`。开启时使用 sRGB 通道的 smoothstep 三次插值；关闭时采用 Oklab 色彩空间插值，与上游 Android 的 Compose `lerp` 一致。几何形状始终使用三次曲线，先横向、后纵向按曲线长度采样。

HarmonyOS 遵循上游 Android 的网格算法，包括矩形网格纵向边界使用列数判断的行为。系统路径测量、光栅化和浮点精度可能产生细微差异，不保证与 Android 或 SwiftUI 逐像素一致。

#### `resolution`

类型：`{ x?: number; y?: number }`，`x`、`y` 各自默认 `8`，取正整数。控制每条边的采样段数；默认值与上游 Android 原生实现一致，上游类型注释中的默认值 `1` 与原生实现不同。

采样后的顶点数 `((columns - 1) * x + 1) * ((rows - 1) * y + 1)` 不得超过 `65536`，以满足 Drawing 的 16 位顶点索引范围。超限、非法维度或分辨率、顶点与颜色数量不匹配等输入会清除渐变并输出警告，恢复有效属性后重新绘制；桥接类型错误由 Expo Modules Core 拒绝。

> **未实现的内容**
>
> - `mask`：iOS 专属的子视图 alpha 蒙版，HarmonyOS 上不生效，子视图仍正常显示并接收交互。
> - `ignoresSafeArea`：iOS 专属的安全区设置，HarmonyOS 始终按 React Native 布局范围绘制。

### Types

#### `MeshGradientViewProps`

沿用官方类型，在 `ViewProps` 上增加网格维度、顶点、颜色、采样分辨率及平台专属属性，具体行为见上文。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
