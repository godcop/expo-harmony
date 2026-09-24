# @expo-harmony/expo-image-picker

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-image-picker) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/)

为 HarmonyOS 上的 React Native 应用提供 Expo ImagePicker 的原生实现，与官方同版本的 `expo-image-picker` 配套使用。支持调用系统相机拍照录像，以及从系统图库选择图片和视频。

## 安装

```bash
npm install @expo-harmony/expo-image-picker expo-image-picker@55.0.24
```

本包适配 Expo SDK 55 的 `expo-image-picker`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

HAR 已经声明 `ohos.permission.CAMERA` 并附带默认的权限用途说明，拍摄前会向用户申请；权限的 `usedScene` 默认挂在 `EntryAbility` 的 `inuse` 场景上，宿主的入口 Ability 使用其他名称时要改成实际名称。

业务代码从官方包导入：

```ts
import * as ImagePicker from 'expo-image-picker';

const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images', 'videos'],
  allowsMultipleSelection: true,
  selectionLimit: 10,
});
```

## API 对照表

### Hooks

#### `useCameraPermissions(options)`

返回 `[PermissionResponse | null, request, get]`，分别是权限状态、申请权限和查询权限的方法。`options` 见 `PermissionHookOptions`。

#### `useMediaLibraryPermissions(options)`

返回 `[MediaLibraryPermissionResponse | null, request, get]`，用法与上一条相同，取值与 `getMediaLibraryPermissionsAsync()`、`requestMediaLibraryPermissionsAsync()` 一致。

### Methods

#### `ImagePicker.getCameraPermissionsAsync()`

返回 `Promise<PermissionResponse>`，相机权限状态。

`status` 可能为 `'granted'`、`'denied'` 或 `'undetermined'`。API 20 及以上由系统区分未决定和已拒绝；API 13 到 API 19 的系统查询只能给出已授权或未授权，模块自己记录用户有没有被问过，没问过时按未决定返回。

已授权或未决定时 `canAskAgain` 为 `true`，被拒绝后为 `false`。`expires` 恒为 `'never'`。

#### `ImagePicker.getMediaLibraryPermissionsAsync(writeOnly)`

返回 `Promise<MediaLibraryPermissionResponse>`。设备具备系统图库选择能力时恒为已授权，`accessPrivileges` 为 `'all'`；不具备时返回拒绝，`accessPrivileges` 为 `'none'`。

图库选择只读取用户在选择器里挑中的文件，不需要全库读写权限，所以这里不申请系统权限，也不弹出授权对话框。`accessPrivileges` 为 `'all'` 表示可以使用选择器，并不表示可以枚举或写入图库。`writeOnly` 不影响结果。

#### `ImagePicker.getPendingResultAsync()`

返回 `Promise<null>`。

#### `ImagePicker.launchCameraAsync(options)`

返回 `Promise<ImagePickerResult>`，打开系统相机界面拍照或录像。

调用时申请相机权限，用户拒绝后抛出 `ERR_MISSING_PERMISSION`。只有 `mediaTypes` 为 `videos` 时录像，同时包含 `images` 和 `videos` 时按拍照处理。

拍摄结果复制到应用缓存目录，`uri` 指向副本，需要长期保存时应再复制到其他位置。视频的尺寸、时长和旋转角取自系统元数据，不做转码。

用户取消返回 `{ canceled: true, assets: null }`。系统相机用 `-1` 表示取消，拍摄未成功时也返回这个值，两者无法区分。同一个 UIAbility 上已经有选择器或相机界面打开时，再次调用直接返回取消结果。

设备没有相机能力时抛出 `ERR_IMAGE_PICKER_UNAVAILABLE`，拍摄结果不完整时抛出 `ERR_IMAGE_PICKER_CAMERA`。启动相机需要处于前台的 UIAbility，在后台或无 UIAbility 的运行时中调用抛出 `ERR_IMAGE_PICKER_CONTEXT`。已经打开的系统界面返回结果时，宿主暂时在后台不影响结果返回。

#### `ImagePicker.launchImageLibraryAsync(options)`

返回 `Promise<ImagePickerResult>`，打开系统图库选择界面。

`allowsMultipleSelection` 为 `false` 时只能选一个，为 `true` 时上限取 `selectionLimit`，为 0 或超过 500 时按 500 处理。`allowsEditing` 为 `true` 且单选图片时，向系统请求编辑入口，是否显示由系统决定；与多选同时开启时忽略。

选中的文件复制到应用缓存目录，`uri` 指向副本，处理过程中出错会清掉本次已写入的文件。取消返回 `{ canceled: true, assets: null }`。同一个 UIAbility 上已经有选择器或相机界面打开时，再次调用直接返回取消结果。

设备没有图库选择能力，或者设备缺少读取视频元数据的能力时，抛出 `ERR_IMAGE_PICKER_UNAVAILABLE`。启动选择器需要处于前台的 UIAbility，在后台或无 UIAbility 的运行时中调用抛出 `ERR_IMAGE_PICKER_CONTEXT`。已经打开的系统界面返回结果时，宿主暂时在后台不影响结果返回。

#### `ImagePicker.requestCameraPermissionsAsync()`

返回 `Promise<PermissionResponse>`，弹出系统授权对话框，取值与 `getCameraPermissionsAsync()` 一致。同时发起的多次调用合并为一次请求。

用户在系统设置里关掉该权限、系统不再允许弹窗时，返回拒绝且 `canAskAgain` 为 `false`。权限没有在 `module.json5` 中声明时抛出 `ERR_IMAGE_PICKER_PERMISSION`。

#### `ImagePicker.requestMediaLibraryPermissionsAsync(writeOnly)`

返回 `Promise<MediaLibraryPermissionResponse>`，取值与 `getMediaLibraryPermissionsAsync()` 一致，不弹出授权对话框。

### Types

#### `CameraPermissionResponse`

`PermissionResponse` 的别名。

#### `CropShape`

`'rectangle' | 'oval'`。

#### `ImagePickerAsset`

| 属性       | 类型                  | 说明                                                              |
| ---------- | --------------------- | ----------------------------------------------------------------- |
| `uri`      | `string`              | 输出文件的 `file://` 地址，位于应用缓存目录                       |
| `assetId`  | `string \| null`      | 图库资源为 PhotoAsset 的 URI，拍摄结果为 `null`                   |
| `width`    | `number`              | 图片宽，按 EXIF 方向校正；视频旋转 90 度或 270 度时取校正后的宽度 |
| `height`   | `number`              | 图片高，按 EXIF 方向校正；视频旋转 90 度或 270 度时取校正后的高度 |
| `type`     | `'image' \| 'video'`  | 只会是这两个值                                                    |
| `fileName` | `string`              | 图库资源沿用系统显示的文件名，重新编码后扩展名跟随实际输出格式    |
| `fileSize` | `number`              | 实际输出文件的字节数                                              |
| `mimeType` | `string`              | 实际输出文件的 MIME 类型                                          |
| `base64`   | `string`              | 请求后包含，只作用于图片                                          |
| `exif`     | `Record<string, any>` | 请求后包含，只作用于图片                                          |
| `duration` | `number \| null`      | 视频时长，单位为毫秒，只作用于视频                                |
| `rotation` | `number \| null`      | 视频旋转角，只作用于视频，官方类型中没有这个字段                  |

图片不包含 `duration` 和 `rotation`，`base64` 和 `exif` 只在请求时出现。

`exif` 的字段取自系统图像框架（ImageKit）的属性定义，不含厂商 MakerNote，字段集合和带单位的取值可能与 Android、iOS 不同，读不到 EXIF 时返回空对象。GPS 经纬度换算为十进制度，方向用正负号表示；图像方向用 1 到 8 的整数表示。JPEG、PNG、HEIF 和 HEIC 始终可读，WebP 和 DNG 需要 API 23 及以上，其他格式返回空对象。

> **未实现的内容**
>
> - `pairedVideoAsset`：iOS 专属字段，HarmonyOS 上不返回。
> - `file`：Web 专属字段，HarmonyOS 上不返回。

#### `ImagePickerCanceledResult`

取消时的结果，`canceled` 为 `true`，`assets` 为 `null`。

#### `ImagePickerOptions`

| 选项                      | 默认值        | 说明                                                                                                                                                                                     |
| ------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowsEditing`           | `false`       | 单选图片时向系统请求编辑入口，是否显示由系统决定，多选时忽略。与拍摄、固定比例或椭圆裁剪组合时抛出 `ERR_IMAGE_PICKER_UNSUPPORTED_EDITING`                                                |
| `allowsMultipleSelection` | `false`       | 图库多选                                                                                                                                                                                 |
| `aspect`                  | —             | 固定裁剪比例。HarmonyOS 不支持，与 `allowsEditing` 一起传入时抛出 `ERR_IMAGE_PICKER_UNSUPPORTED_EDITING`，单独传入时忽略；取值不是两个正数时抛出 `ERR_INVALID_ARGUMENT`                   |
| `base64`                  | `false`       | 是否返回图片的 Base64 内容。原样复制时是文件本身；重新编码且输出不是 JPEG 时，另编一份 JPEG 作为 Base64                                                                                  |
| `cameraType`              | `'back'`      | 前置或后置摄像头，只作用于拍摄                                                                                                                                                           |
| `exif`                    | `false`       | 是否返回图片的 EXIF                                                                                                                                                                      |
| `mediaTypes`              | `'images'`    | 选择图片、视频或两者。取值不在 `MediaType` 中时抛出 `ERR_INVALID_ARGUMENT`                                                                                                               |
| `quality`                 | `1`           | 图片压缩质量，取值 0 到 1。为 1 时原样复制文件，保留 GIF 动画；小于 1 时重新编码，PNG、GIF、BMP 和 WebP 输出 PNG（GIF 只取首帧），其他图片输出 JPEG。超出范围抛出 `ERR_INVALID_ARGUMENT` |
| `selectionLimit`          | `0`           | 多选上限，为 0 或超过 500 时按 500 处理，取值必须是非负整数                                                                                                                              |
| `shape`                   | `'rectangle'` | 裁剪区域形状。`'oval'` 不支持，与 `allowsEditing` 一起传入时抛出 `ERR_IMAGE_PICKER_UNSUPPORTED_EDITING`                                                                                  |
| `videoMaxDuration`        | `0`           | 录像的最长秒数，为 0 表示不限，只作用于拍摄                                                                                                                                              |

`cameraType`、`shape`、`videoMaxDuration` 取值非法时同样抛出 `ERR_INVALID_ARGUMENT`。

`quality`、`base64` 和 `exif` 只作用于图片，录制视频时忽略。

> **未实现的内容**
>
> - `defaultTab`、`legacy`：Android 专属选项，HarmonyOS 的系统选择器没有对应设置。
> - `orderedSelection`、`preferredAssetRepresentationMode`、`presentationStyle`、`videoExportPreset`、`videoQuality`、`shouldDownloadFromNetwork`：iOS 专属选项，HarmonyOS 上没有对应设置。

#### `ImagePickerResult`

`ImagePickerSuccessResult | ImagePickerCanceledResult`。

#### `ImagePickerSuccessResult`

成功时的结果，`canceled` 为 `false`，`assets` 为资源数组。

#### `MediaLibraryPermissionResponse`

`PermissionResponse` 加上 `accessPrivileges`。HarmonyOS 上只会是 `'all'` 或 `'none'`，不会出现 `'limited'`。

#### `MediaType`

`'images' | 'videos' | 'livePhotos'`。过滤规则与上游 Android 一致，`livePhotos` 不单独参与过滤。只请求该类型或传入空数组时默认选择图片，与 `videos` 同时传入但不包含 `images` 时只选择视频。实况照片按普通图片返回，不导出配对视频。

#### `PermissionExpiration`

`'never' | number`，恒为 `'never'`。

#### `PermissionHookOptions`

`PermissionHookBehavior & Options`。

#### `PermissionResponse`

| 属性          | 类型                   | 说明                                          |
| ------------- | ---------------------- | --------------------------------------------- |
| `status`      | `PermissionStatus`     | `'granted'`、`'denied'` 或 `'undetermined'`   |
| `granted`     | `boolean`              | 是否已授权                                    |
| `canAskAgain` | `boolean`              | 已授权或未决定时为 `true`，被拒绝后为 `false` |
| `expires`     | `PermissionExpiration` | 恒为 `'never'`                                |

> **未实现的内容**
>
> - `DefaultTab`：Android 专属类型，HarmonyOS 的系统选择器没有标签页选项。
> - `ImagePickerErrorResult`：由 `getPendingResultAsync()` 返回，HarmonyOS 上该方法恒为 `null`，没有取值来源。

### Enums

#### `CameraType`

`'back' | 'front'`。

#### `MediaTypeOptions`

官方已标记废弃。在 HarmonyOS 上仍然可用，`All`、`Images`、`Videos` 分别按 `['images', 'videos']`、`['images']`、`['videos']` 处理。

#### `PermissionStatus`

`'granted' | 'denied' | 'undetermined'`，三个取值都会出现。

> **未实现的内容**
>
> - `VideoExportPreset`、`UIImagePickerControllerQualityType`、`UIImagePickerPreferredAssetRepresentationMode`、`UIImagePickerPresentationStyle`：iOS 专属枚举，HarmonyOS 上没有对应设置。

### Error codes

#### `ERR_INVALID_ARGUMENT`

`options` 中的取值非法时抛出。

#### `ERR_MISSING_PERMISSION`

相机权限被拒绝后调用 `launchCameraAsync()` 时抛出。

#### `ERR_IMAGE_PICKER_PERMISSION`

权限没有在 `module.json5` 中声明时抛出。

#### `ERR_IMAGE_PICKER_UNAVAILABLE`

设备没有相机或图库选择能力，或者缺少读取视频元数据的能力时抛出。

#### `ERR_IMAGE_PICKER_CONTEXT`

运行时已销毁、没有 UIAbility，或尝试从后台启动选择器时抛出。

#### `ERR_IMAGE_PICKER_UNSUPPORTED_EDITING`

`allowsEditing` 与拍摄、固定比例或椭圆裁剪组合使用时抛出。

#### `ERR_IMAGE_PICKER_CAMERA`

拍摄结果不完整时抛出。

#### `ERR_IMAGE_PICKER_CAPTURE_FILE`

相机输出文件创建失败时抛出。

#### `ERR_IMAGE_PICKER_MEDIA_PROCESSING`

图片或视频处理失败，或者所选资源的格式不受支持时抛出。

#### `ERR_IMAGE_PICKER_FILE_READ`

文件大小非法，或者文件读取不完整时抛出。

#### `ERR_IMAGE_PICKER_CACHE`

缓存路径不可用时抛出。

#### `ERR_IMAGE_PICKER_MEDIA_TYPE`

所选资源既不是图片也不是视频时抛出。

#### `ERR_IMAGE_PICKER`

其他未归类的失败时抛出。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
