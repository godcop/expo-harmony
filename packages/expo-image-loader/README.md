# @expo-harmony/expo-image-loader

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-image-loader)

为 HarmonyOS 上的 React Native 应用提供 Expo ImageLoader 的原生实现，与官方同版本的 `expo-image-loader` 配套使用。这个包没有 JavaScript 接口，向外提供一个图片加载服务，应用内的 ArkTS 模块可以按地址取到图片。

## 安装

```bash
npm install @expo-harmony/expo-image-loader expo-image-loader@55.0.1
```

本包适配 Expo SDK 55 的 `expo-image-loader`，原生服务通过 Expo Harmony 自动链接，不需要配置插件。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

HAR 已经声明 `ohos.permission.INTERNET`，加载远程图片时应用不必另行申请网络权限。加载本地图片只校验应用已经拿到的访问授权，本包不申请相册或文件权限。

这个包供应用内的 ArkTS 模块使用。模块在自己的 `oh-package.json5` 中声明依赖：

```json
{
  "dependencies": {
    "@expo-harmony/expo-image-loader": "55.0.1-harmony.0"
  }
}
```

运行时从服务容器取出加载服务，再调用加载方法：

```ts
import { ImageLoaderInterfaceKey } from '@expo-harmony/expo-image-loader';

const loader = this.context.services.require(ImageLoaderInterfaceKey);
const pixel = await loader.loadImageForManipulationFromURL(uri);

try {
  const info = await pixel.getImageInfo();
} finally {
  await pixel.release();
}
```

## API 对照表

### Constants

#### `ImageLoaderInterfaceKey`

类型：`ExpoServiceKey<ImageLoaderInterface>`

服务容器中图片加载服务的键。`services.require(ImageLoaderInterfaceKey)` 返回当前的加载服务。

### Methods

#### `ImageLoaderInterface.loadImageForDisplayFromURL(url)`

返回 `Promise<image.PixelMap>`，加载用于展示的图片。`url` 支持这几种形式：

- `http://`、`https://` 远程地址。
- 应用沙箱内的绝对路径，以 `/` 开头。
- `file://` 地址，需要应用已经获得该路径的访问授权。
- base64 编码的图片 `data:` 地址。
- `asset://path` 对应 `rawfile/assets/path`；`rawfile://path` 或相对资源名对应 `rawfile/path`。

返回的是原始尺寸的图片，不做降采样。动画图片只取第一帧，系统能读到 EXIF 方向时按方向摆正。

远程图片走系统的 HTTP 缓存，响应体上限 100 MiB，超过时加载失败，这个上限不作用于本地图片。

地址为空、协议不受支持、打包资源路径非法、`data:` 地址不是 base64 图片、HTTP 响应码不在 2xx 范围内、解码失败等情况抛出 `ERR_IMAGE_LOADER`。

#### `ImageLoaderInterface.loadImageForDisplayFromURL(url, listener)`

无返回值，结果通过 `ImageLoaderResultListener` 回调返回，加载行为与 Promise 版本一致。从 `onSuccess` 被调用起，PixelMap 的释放责任归调用方，回调内抛出异常也一样。

#### `ImageLoaderInterface.loadImageForManipulationFromURL(url)`

返回 `Promise<image.PixelMap>`，加载用于编辑的图片。地址形式、方向摆正和大小上限与展示加载一致。每次调用返回一份独立的图片，修改其中一张不影响另一张；不使用 HTTP 缓存，每次调用都会重新下载远程图片。

#### `ImageLoaderInterface.loadImageForManipulationFromURL(url, listener)`

无返回值，结果通过 `ImageLoaderResultListener` 回调返回。PixelMap 的释放责任与展示加载的回调版本相同。

### Interfaces

#### `ImageLoaderInterface`

图片加载服务的接口，用 `ImageLoaderInterfaceKey` 取得。加载结果都是可编辑的 `image.PixelMap`，不再使用时调用 `release()` 释放。运行时销毁后，新的调用和进行中的请求都会失败，尚未交付的图片由服务释放。

#### `ImageLoaderResultListener`

回调方式的监听器，由调用方实现。

| 成员        | 类型                              | 说明                                          |
| ----------- | --------------------------------- | --------------------------------------------- |
| `onSuccess` | `(pixel: image.PixelMap) => void` | 加载成功，PixelMap 的释放责任从这时起归调用方 |
| `onFailure` | `(cause: Error) => void`          | 加载失败，错误码为 `ERR_IMAGE_LOADER`         |

### Error codes

#### `ERR_IMAGE_LOADER`

加载失败时抛出，覆盖地址不受支持、地址为空、打包资源路径非法、`data:` 地址不是 base64 图片、HTTP 响应码不在 2xx 范围内、响应体超过大小上限，以及解码失败等情况。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
