# @expo-harmony/expo-image

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-image) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/image/)

为 HarmonyOS 上的 React Native 应用提供 Expo Image 的原生实现，与官方同版本的 `expo-image` 配套使用。支持图片显示、占位图、动画播放、缓存、BlurHash 和 ThumbHash。

## 安装

```bash
npm install @expo-harmony/expo-image expo-image@55.0.11
```

本包适配 Expo SDK 55 的 `expo-image`，原生模块通过 Expo Harmony 自动链接，不需要配置插件。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。HAR 已声明 `ohos.permission.INTERNET`，应用不需要额外申请网络权限；能解码的图片格式以系统 Image Kit 为准。

业务代码从官方包导入：

```tsx
import { Image } from 'expo-image';

<Image
  source={{ uri: 'https://example.com/photo.jpg' }}
  style={{ width: 240, height: 160 }}
  contentFit="cover"
  cachePolicy="memory-disk"
  transition={200}
/>;
```

## API 对照表

### Components

#### `Image`

加载并渲染图片的视图组件，支持占位图、内容适配、过渡和缓存。

#### `source`

类型：`number | ImageSource | string | ImageRef | ImageSource[] | string[]`

图片来源。支持以下地址形式：

- `http://`、`https://` 远程地址。
- `data:` 图片地址，base64 或百分号转义均可。
- 应用沙箱内的绝对路径，以 `/` 开头。
- `file://` 地址。带 provider authority 的地址需要应用已获得访问授权。
- `asset://path` 对应 `rawfile/assets/path`。
- `rawfile://path` 或相对资源名对应 `rawfile/path`。

其他协议的地址抛出 `ERR_IMAGE_UNSUPPORTED_SOURCE`，`sf:` 前缀的 SF Symbols 同样不支持。单个来源最大 100 MiB，超过时抛出 `ERR_IMAGE_TOO_LARGE`。解码后的全部帧按宽 × 高 × 4 估算，超过 256 MiB 时拒绝加载。

传入数组时，按宽 × 高 × `scale` 的平方选择与视图尺寸最接近的一张。`ImageRef` 直接使用内存中已有的图片。

BlurHash 解码后的尺寸每边最多 512 像素，未提供 `width`、`height` 时按 16 处理。

#### `placeholder`

加载完成前或未设置 `source` 时显示的图片源，取值形式与 `source` 相同，但不接受 `ImageRef`。占位图始终居中显示，`blurRadius` 和 `tintColor` 不作用于占位图。占位图加载失败只记录日志，不触发 `onError`。

#### `defaultSource`、`loadingIndicatorSource`

React Native `Image` 的兼容属性，已废弃，用作占位图。`placeholder` 同时提供时以 `placeholder` 为准。

#### `contentFit`

类型：`ImageContentFit`，默认 `'cover'`

图片适配容器的方式。

- `cover`：保持比例铺满容器，超出部分裁剪。
- `contain`：保持比例完整放入容器。
- `fill`：拉伸填满容器，不保持比例。
- `none`：不缩放，位置由 `contentPosition` 控制。
- `scale-down`：取 `none` 与 `contain` 中显示更小的一种。

#### `resizeMode`

React Native `Image` 的兼容属性，已废弃，等价于 `contentFit`。`'stretch'` 映射为 `'fill'`，`'center'` 映射为 `'scale-down'`，`'repeat'` 按 `'cover'` 处理。`contentFit` 同时提供时以 `contentFit` 为准。

#### `placeholderContentFit`

类型：`ImageContentFit`，默认 `'scale-down'`

占位图的适配方式。哈希占位图改用 `contentFit`。

#### `contentPosition`

类型：`ImageContentPosition`，默认 `'center'`

图片在容器内的位置，写法与 CSS `object-position` 一致。可以传对象，也可以传 `'top right'` 这样的字符串简写。对象中的数字表示距离对应边缘的逻辑像素，字符串表示百分比。

#### `transition`

类型：`number | ImageTransition | null`

切换图片源时的过渡。传数字表示淡入淡出时长，单位毫秒。

- `duration`：时长，单位毫秒，默认 0。
- `timing`：速度曲线，取 `'ease-in-out'`、`'ease-in'`、`'ease-out'`、`'linear'`，默认 `'ease-in-out'`。
- `effect`：过渡效果，默认 `'cross-dissolve'`，传 `'none'` 关闭过渡。

HarmonyOS 上只做淡入淡出，`flip`、`curl` 等其他效果同样按淡入淡出处理。

#### `fadeDuration`

类型：`number`

React Native `Image` 的兼容属性，已废弃，作为淡入淡出时长（毫秒）传给 `transition`。`transition` 同时提供时以 `transition` 为准。

#### `cachePolicy`

类型：`'none' | 'disk' | 'memory' | 'memory-disk' | null`，默认 `'disk'`

缓存位置。磁盘缓存只用于远程图片，键名取 `cacheKey`，未设置时取 `uri`。磁盘缓存不区分请求头，鉴权身份不同的同一地址应传入不同的 `cacheKey`，否则会读到其他身份的缓存。磁盘缓存文件解码失败时会删除该文件并重新下载一次。

#### `blurRadius`

类型：`number`，默认 `0`

模糊半径，取值必须非负，`0` 表示不模糊。

#### `tintColor`

类型：`ColorValue | null`，默认 `null`

着色，作用于每个不透明像素。以 `ImageRef` 作为 `source` 时，建议改用 `useImage` 或 `loadAsync` 的 `tintColor` 选项。

#### `allowDownscaling`

类型：`boolean`，默认 `true`

是否按显示尺寸下采样。开启时按视图尺寸乘以屏幕像素密度解码，可以降低大图的内存占用。关闭后按原始像素解码；`contentFit` 为 `none` 或 `fill` 时同样不下采样。

#### `priority`

类型：`'low' | 'normal' | 'high' | null`，默认 `'normal'`

下载优先级，只对远程图片生效。同时排队时优先级高的先开始，不保证完成顺序。

#### `recyclingKey`

类型：`string | null`，默认 `null`

取值变化时先清空当前内容，再加载新图片。用于列表复用，避免显示上一项残留的图片。

#### `autoplay`

类型：`boolean`，默认 `true`

动画图片是否自动播放。设为 `false` 时暂停播放。

GIF 的循环次数读自文件，没有循环扩展时只播放一次；WebP 在 API 24 及以上读系统元数据，更早的系统循环播放。应用切到后台时动画暂停，回到前台继续。

#### `decodeFormat`

类型：`ImageDecodeFormat`，默认 `'argb'`

解码格式。官方标记为 Android 专属属性，在 HarmonyOS 上可用。取 `'rgb'` 时解码为不含透明通道的 16 位色，内存占用更小；同时设置 `tintColor` 时该取值不生效。

#### `accessible`

类型：`boolean`，默认 `false`

是否为无障碍元素。为 `true` 时把内部内容合并成一个可选中节点。

#### `accessibilityLabel`

类型：`string`，默认 `undefined`

读屏朗读的文本。

#### `alt`

`accessibilityLabel` 的别名。两者同时提供时以 `accessibilityLabel` 为准。

#### `focusable`

类型：`boolean`，默认 `false`

是否可以用非触摸输入设备聚焦。官方标记为 Android 专属属性，在 HarmonyOS 上可用。

#### `style`

视图样式，`borderRadius` 和各角圆角属性用于裁剪图片。

#### `onLoadStart`

类型：`() => void`

开始加载时调用。

#### `onProgress`

类型：`(event: ImageProgressEventData) => void`

加载过程中调用，可能触发多次。只在下载远程图片时上报，长度未知时 `total` 为 0。

#### `onLoad`

类型：`(event: ImageLoadEventData) => void`

加载成功后调用，返回图片信息和缓存来源。

#### `onError`

类型：`(event: ImageErrorEventData) => void`

加载失败时调用，`error` 为带错误码的文本。

#### `onDisplay`

类型：`() => void`

图片渲染完成后调用。

#### `onLoadEnd`

类型：`() => void`

加载成功或失败后都会调用。

> **未实现的内容**
>
> - `draggable`、`loading`、`responsivePolicy`：Web 专属属性，HarmonyOS 上不生效。
> - `enableLiveTextInteraction`、`enforceEarlyResizing`、`preferHighDynamicRange`、`sfEffect`、`useAppleWebpCodec`：iOS 专属属性，HarmonyOS 上没有对应实现。

#### `ImageBackground`

以图片作为背景，并在其上渲染子组件的容器。属性与 `Image` 相同，另有 `style` 和 `imageStyle`。`style` 作用于容器，`imageStyle` 作用于背景图片。

### Static methods

#### `Image.loadAsync(source, options)`

返回 `Promise<ImageRef>`，把图片加载到内存。`options` 见 `ImageLoadOptions`。结果按 `memory-disk` 策略进入内存和磁盘缓存。

#### `Image.prefetch(urls, cachePolicy)`

#### `Image.prefetch(urls, options)`

返回 `Promise<boolean>`，预取一张或多张图片。第二个参数的两种重载分别接受缓存策略和 `ImagePrefetchOptions`，缓存策略默认 `'memory-disk'`。全部成功时返回 `true`，任一张失败立即返回 `false`。

#### `Image.getCachePathAsync(cacheKey)`

返回 `Promise<string | null>`，磁盘缓存文件的路径。键名默认是图片地址，未命中时返回 `null`。

#### `Image.clearMemoryCache()`

返回 `Promise<boolean>`，清理内存缓存。仍被引用的图片会保留，可以继续显示。系统内存告警时内存缓存也会被清空。

#### `Image.clearDiskCache()`

返回 `Promise<boolean>`，清理磁盘缓存。正在使用的缓存文件会保留，有文件删除失败时返回 `false`。

#### `Image.configureCache(config)`

同步方法，用于设置缓存上限。官方标记为 iOS 专属接口，在 HarmonyOS 上可用。

| 选项             | 说明                                 |
| ---------------- | ------------------------------------ |
| `maxDiskSize`    | 磁盘缓存上限，单位字节，0 表示不限制 |
| `maxMemoryCost`  | 内存缓存上限，单位字节，0 表示不限制 |
| `maxMemoryCount` | 内存缓存条目数上限，0 表示不限制     |

三项都取非负整数，取值非法时抛出 `ERR_IMAGE_INVALID_CACHE_CONFIG`。

#### `Image.generateBlurhashAsync(source, numberOfComponents)`

返回 `Promise<string>`，从图片生成 BlurHash。`source` 可以是地址或 `ImageRef`。`numberOfComponents` 接受 `[number, number]` 或 `{ width, height }`，每项取 1 到 9 的整数，默认 `[4, 3]`，取值非法时抛出 `ERR_IMAGE_INVALID_HASH_COMPONENTS`。

#### `Image.generateThumbhashAsync(source)`

返回 `Promise<string>`，从图片生成 ThumbHash。`source` 可以是地址或 `ImageRef`。作为输入的图片最大 100 × 100 像素，超出时先缩小。

### Component methods

#### `lockResourceAsync()`

锁定当前资源，属性变化不再触发重新加载。

#### `unlockResourceAsync()`

解除锁定，恢复常规的重新加载。

#### `reloadAsync()`

忽略锁定，强制重新加载。

#### `startAnimating()`

播放动画图片。

#### `stopAnimating()`

暂停动画图片。

#### `getAnimatableRef()`

返回组件自身，供动画库使用。

### Hooks

#### `useImage(source, options, dependencies)`

返回 `ImageRef | null`，加载成功后返回引用。`source` 的 `uri` 变化时重新加载，也可以传 `dependencies` 指定其他重新加载的时机。`options` 见 `ImageLoadOptions`。

返回的引用可以作为 `Image` 的 `source` 传回。大图应通过 `maxWidth` 或 `maxHeight` 限制尺寸，否则可能因内存占用过高而崩溃。不再使用时应调用 `release()`。

### Classes

#### `ImageRef`

原生图片实例的引用。可以作为 `source` 传给 `Image`，此时直接使用内存中已有的图片；也可以作为 `generateBlurhashAsync` 和 `generateThumbhashAsync` 的输入。不再使用时应调用 `release()` 释放。

#### `ImageRef.width`

类型：`number`，只读

逻辑宽度，乘以 `scale` 得到像素宽度。

#### `ImageRef.height`

类型：`number`，只读

逻辑高度，乘以 `scale` 得到像素高度。

#### `ImageRef.scale`

类型：`number`，只读

逻辑尺寸与像素尺寸的比例，取自 `source.scale`，默认 1。

#### `ImageRef.isAnimated`

类型：`boolean`，只读

是否为动画图片。

#### `ImageRef.mediaType`

类型：`string | null`，只读

图片的 MIME 类型，未知时为 `null`。官方标记为 iOS 专属属性，在 HarmonyOS 上可用。

#### `ImageRef.nativeRefType`

类型：`string`

引用类型，取值为 `'image'`。

### Types

#### `ImageProps`

`Image` 的属性类型，在 `ViewProps` 基础上增加图片相关属性。

#### `ImageBackgroundProps`

`ImageBackground` 的属性类型，在 `ImageProps` 基础上增加容器样式 `style` 和图片样式 `imageStyle`。

#### `ImageSource`

| 属性                    | 类型                     | 说明                                                                |
| ----------------------- | ------------------------ | ------------------------------------------------------------------- |
| `uri`                   | `string`                 | 图片地址                                                            |
| `headers`               | `Record<string, string>` | 请求头，用于远程图片                                                |
| `width`、`height`       | `number \| null`         | 已知尺寸，参与数组来源的选择，也作为 `blurhash` 的解码尺寸，默认 16 |
| `scale`                 | `number`                 | 像素比例，默认 1，参与数组来源的选择                                |
| `cacheKey`              | `string`                 | 缓存键名，默认使用 `uri`                                            |
| `blurhash`、`thumbhash` | `string`                 | 作为占位图的哈希，与 `uri` 同时提供时忽略                           |
| `isAnimated`            | `boolean`                | 官方标记为 Android、iOS 专属字段，HarmonyOS 上不生效                |
| `webMaxViewportWidth`   | `number`                 | Web 专属字段，HarmonyOS 上不读取                                    |

#### `ImageLoadOptions`

| 属性                    | 类型                     | 说明                                              |
| ----------------------- | ------------------------ | ------------------------------------------------- |
| `maxWidth`、`maxHeight` | `number`                 | 解码后的最大宽高，单位像素，等比缩放              |
| `tintColor`             | `ColorValue \| number`   | 着色，默认 `null`                                 |
| `onError`               | `(error, retry) => void` | 加载失败回调，`useImage` 使用，`loadAsync` 不读取 |

#### `ImagePrefetchOptions`

| 属性          | 类型                                  | 说明                           |
| ------------- | ------------------------------------- | ------------------------------ |
| `cachePolicy` | `'disk' \| 'memory-disk' \| 'memory'` | 缓存策略，默认 `'memory-disk'` |
| `headers`     | `Record<string, string>`              | 请求头                         |

#### `ImageCacheConfig`

`configureCache` 的配置项。

| 属性             | 类型     | 说明                           |
| ---------------- | -------- | ------------------------------ |
| `maxDiskSize`    | `number` | 磁盘缓存上限，单位字节，默认 0 |
| `maxMemoryCost`  | `number` | 内存缓存上限，单位字节，默认 0 |
| `maxMemoryCount` | `number` | 内存缓存条目数上限，默认 0     |

#### `ImageTransition`

| 属性       | 类型                                                   | 说明                                                    |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `duration` | `number`                                               | 时长，单位毫秒，默认 0                                  |
| `timing`   | `'ease-in-out' \| 'ease-in' \| 'ease-out' \| 'linear'` | 速度曲线，默认 `'ease-in-out'`                          |
| `effect`   | `string`                                               | 过渡效果，默认 `'cross-dissolve'`，传 `'none'` 关闭过渡 |

#### `ImageContentFit`

`'cover' | 'contain' | 'fill' | 'none' | 'scale-down'`，默认 `'cover'`。

#### `ImageDecodeFormat`

`'argb' | 'rgb'`，默认 `'argb'`。

#### `ImageContentPosition`

图片在容器内的位置，可以传对象或字符串简写。对象支持 `top`、`bottom`、`left`、`right` 四组值，字符串简写包括 `'center'`、`'top right'`、`'bottom'` 等形式。

#### `ImageContentPositionValue`

类型：`number | string`

数字表示距离对应边缘的逻辑像素，字符串表示百分比，`'center'` 等价于 `'50%'`。

#### `ImageLoadEventData`

| 属性        | 类型                                            | 说明         |
| ----------- | ----------------------------------------------- | ------------ |
| `cacheType` | `'none' \| 'disk' \| 'memory'`                  | 本次图片来源 |
| `source`    | `{ url, width, height, mediaType, isAnimated }` | 图片信息     |

#### `ImageProgressEventData`

| 属性     | 类型     | 说明                 |
| -------- | -------- | -------------------- |
| `loaded` | `number` | 已加载字节数         |
| `total`  | `number` | 总字节数，未知时为 0 |

#### `ImageErrorEventData`

| 属性    | 类型     | 说明     |
| ------- | -------- | -------- |
| `error` | `string` | 错误文本 |

#### `ImageStyle`

React Native `ImageStyle` 的别名。

> **未实现的内容**
>
> - `SFSymbolEffect`、`SFSymbolEffectObject`、`SFSymbolEffectType`：iOS 专属类型，HarmonyOS 上没有取值来源。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
