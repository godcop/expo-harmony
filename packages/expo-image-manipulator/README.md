# @expo-harmony/expo-image-manipulator

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-image-manipulator) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/imagemanipulator/)

为 HarmonyOS 上的 React Native 应用提供 Expo ImageManipulator 的原生实现，与官方同版本的 `expo-image-manipulator` 配套使用。支持缩放、旋转、翻转、裁剪，以及 JPEG、PNG、WebP 文件和 Base64 输出。

## 安装

```bash
npm install @expo-harmony/expo-image-manipulator expo-image-manipulator@55.0.21
```

本包适配 Expo SDK 55 的 `expo-image-manipulator`，业务代码照常从官方包导入。原生模块和它依赖的 ImageLoader 由 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

加载远程图片所需的 `ohos.permission.INTERNET` 已由依赖的 ImageLoader 声明。访问系统选择器返回的地址时，沿用应用已经拿到的授权。

## API 对照表

### Methods

#### `ImageManipulator.manipulate(source)`

返回新的 `ImageManipulatorContext`。`source` 接受本地路径、`file://` 地址、Base64 data URI、HTTP(S) 地址，或兼容的 `SharedRef<'image'>`，例如 `expo-image` 的 `ImageRef`。

URI 图片交给依赖的 ImageLoader 加载，动画图片只取第一帧，系统能读到 EXIF 方向时先按方向摆正。远程图片的响应体上限是 100 MiB，每次调用都会重新下载，不走缓存。共享引用在调用时复制成独立位图，不修改来源图片，之后释放来源引用也不影响 Context，大图复制会带来一次性的内存和耗时开销。

```tsx
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const context = ImageManipulator.manipulate(uri);
try {
  context.resize({ width: 320 }).rotate(90);
  const image = await context.renderAsync();
  try {
    const result = await image.saveAsync({ format: SaveFormat.PNG });
    console.log(result.uri, result.width, result.height);
  } finally {
    image.release();
  }
} finally {
  context.release();
}
```

#### `useImageManipulator(source)`

返回由 React 管理生命周期的 `ImageManipulatorContext`，来源变化或组件卸载时自动释放旧的 Context，其余行为与 `ImageManipulator.manipulate()` 一致。

#### `context.crop({ originX, originY, width, height })`

返回当前 Context。裁剪区域必须完整落在当前图片内，宽高至少一像素。坐标和尺寸会像官方 Android 实现一样截断成整数，传入分数值时结果可能与 iOS 不同。

#### `context.flip(flipType)`

返回当前 Context。接受 `FlipType.Horizontal` 或 `FlipType.Vertical`，分别做水平、垂直翻转，要同时翻转两个方向需要调用两次。

#### `context.reset()`

返回当前 Context，清空已排队的操作并重新加载原图。尚未完成的渲染会失败，已经返回的 ImageRef 不受影响。正在进行的远程下载不会被取消，会继续占用网络直到结束，下载的结果直接丢弃。

#### `context.resize({ width, height })`

返回当前 Context。宽高至少提供一个正数，只给一个时另一个按原图宽高比推算，两个都给时按指定尺寸缩放。尺寸会像官方 Android 实现一样截断成整数，缩放结果不足一像素时报错。

#### `context.rotate(degrees)`

返回当前 Context。正数顺时针旋转，负数逆时针旋转，任意有限角度都可以。

#### `context.renderAsync()`

返回 `Promise<ImageRef>`，等待队列中的操作全部完成，生成一份独立的快照，之后继续修改、重置或释放 Context 都不影响它。`width`、`height` 是像素尺寸，ImageRef 可以直接传给接受图片共享引用的模块。

需要固定操作顺序时，先 `await renderAsync()` 再继续变换或 reset。未等待的异步调用可能在 reset 之后才开始执行，这一点与官方包一致，不能依赖它读取重置前的状态。

#### `image.saveAsync(options)`

返回 `Promise<ImageResult>`，包含 `uri`、`width`、`height`，请求 `base64` 时还返回编码后的字符串，不含 data URI 前缀。默认保存 JPEG、质量为 1，`format` 接受 `SaveFormat.JPEG`、`SaveFormat.PNG`、`SaveFormat.WEBP`，`compress` 取 0 到 1。PNG 是无损格式，压缩参数不一定改变文件大小。

文件写入应用的缓存目录，每次保存生成一个新文件，不会覆盖来源图片。缓存文件可能被系统清理，需要长期保留时由应用自己转存。发起保存后立刻释放 ImageRef 是安全的，保存会照常完成。

#### `manipulateAsync(uri, actions, saveOptions)`

官方标记为废弃的旧版接口，返回 `Promise<ImageResult>`，在鸿蒙上与新的 Context API 走同一套处理，行为一致。新代码建议使用 `ImageManipulator.manipulate()` 或 `useImageManipulator()`。

> **未实现的内容**
>
> - `context.extent(options)`：Web 专用 API，官方包在 Android 和 iOS 上同样不提供。

### Types

> **未实现的内容**
>
> - `ActionExtent`：`context.extent()` 对应的操作类型，同样只在 Web 上可用。

### Enums

#### `FlipType`

`Horizontal`、`Vertical` 两个取值都可用。

#### `SaveFormat`

`JPEG`、`PNG`、`WEBP` 三个取值都可用。

### 平台差异

变换和编码使用 HarmonyOS 的 Image Kit，缩放插值和编码器与其他平台不同，同一张图处理后的像素和文件字节不保证与 Android、iOS 完全一致。

图片按 SDR RGBA 位图处理，输出的文件不保留原始 EXIF、HDR 辅助图和完整的色彩元数据。参数无效、裁剪越界、加载或写入失败都会抛出错误，错误信息可能与 Android、iOS 不同。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
