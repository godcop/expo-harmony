# @expo-harmony/expo-video-thumbnails

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-video-thumbnails) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/video-thumbnails/)

为 HarmonyOS 上的 React Native 应用提供 Expo VideoThumbnails 的原生实现，与官方同版本的 `expo-video-thumbnails` 配套使用。支持从本地视频和 HTTP(S) 视频生成 JPEG 缩略图，以及指定时间、图片质量和请求头。

## 安装

```bash
npm install @expo-harmony/expo-video-thumbnails expo-video-thumbnails@55.0.19
```

本包适配 Expo SDK 55，业务代码继续从官方的 `expo-video-thumbnails` 导入。原生模块由 Expo Harmony 自动链接。最低支持 HarmonyOS 6.0.0（API 20），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

读取应用沙箱内的视频不需要权限。包内声明了普通权限 `ohos.permission.INTERNET`，用于访问远程视频。通过系统选择器选取的外部文件沿用选择时给出的授权，本包不申请媒体库读取等受限权限。

## API 对照表

### Methods

#### `VideoThumbnails.getThumbnailAsync(sourceFilename, options?)`

返回 `Promise<VideoThumbnailsResult>`，从视频里提取一帧并存成 JPEG 文件，结果包含 `uri`、`width` 和 `height`。`sourceFilename` 接受 HTTP(S) 地址、`file://` URI 和绝对路径。

| 选项 | HarmonyOS 行为 |
| --- | --- |
| `time` | 默认 0，单位毫秒。小数部分截断，提取距离该时间点最近的关键帧。 |
| `quality` | 默认 1，范围 0 到 1，数值越大质量越高。换算成整数百分比后交给系统的 JPEG 编码器。 |
| `headers` | HTTP(S) 请求头，默认空对象，只对远程视频生效。 |

时间上取最近的关键帧，与 Android 一致，iOS 则尽量取指定时间的帧，同一个时间点在不同平台可能得到不同画面。相邻的时间点也可能落在同一个关键帧上，得到同一张缩略图。时间为负或超出视频时长时交给系统处理，不保证返回哪一帧，也不保证报错。

每次调用生成一个独立的 JPEG 文件，放在应用缓存目录的 `VideoThumbnails` 子目录，返回 `file://` URI，可以直接交给图片组件显示。缩略图保留提取帧的原始尺寸，不做缩放，视频的旋转信息由系统处理。缓存目录可能被系统清理，需要长期保存的图片由应用自行复制。

远程视频支持 MP4、MPEG-TS 和 MKV 点播资源，不支持 HLS、DASH 和直播。本地视频支持的格式、编码、分辨率和 HDR 取决于设备的解码能力。HTTP 明文请求受宿主应用的网络安全策略限制。`content://`、`asset://`、`rawfile://` 和 data URI 传入会直接拒绝，打包在应用里的视频可以先通过 `expo-asset` 拿到本地地址再提取。

`quality` 不是有限数值或超出 0 到 1 会拒绝，`time` 不是有限数值或换算成微秒后超出安全整数范围也会拒绝。设备缺少提帧的系统能力，文件不存在、为空或不是普通文件，解码或写入失败，这些情况都会抛出错误，错误信息可能与 Android 和 iOS 不同。JPEG 编码和色彩转换的效果由系统决定，不保证与其他平台的图片逐像素一致。

### Types

#### `VideoThumbnailsOptions`

`getThumbnailAsync` 的第二个参数的类型，各字段在 HarmonyOS 上的行为见 Methods 一节的表格。

#### `VideoThumbnailsResult`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `uri` | `string` | JPEG 文件的 `file://` URI。 |
| `width` | `number` | 缩略图宽度，等于提取帧的原始宽度。 |
| `height` | `number` | 缩略图高度，等于提取帧的原始高度。 |

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
