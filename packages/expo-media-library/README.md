# @expo-harmony/expo-media-library

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-media-library) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/media-library/)

为 HarmonyOS 上的 React Native 应用提供 Expo MediaLibrary 的原生实现，与官方同版本的 `expo-media-library` 配套使用。支持图片和视频的查询、分页、元数据读取、保存、删除、相册成员管理，以及图库变更监听。

## 安装

```bash
npm install @expo-harmony/expo-media-library expo-media-library@55.0.17
```

本包适配 Expo SDK 55 的 `expo-media-library`，原生模块通过 Expo Harmony 自动链接，不需要配置插件。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

HAR 声明了 `ohos.permission.READ_IMAGEVIDEO` 和 `ohos.permission.WRITE_IMAGEVIDEO`。这两项属于受限开放权限，应用需要符合华为的申请条件；权限的 `usedScene` 默认挂在 `EntryAbility` 的 `inuse` 场景上，宿主的入口 Ability 使用其他名称时要改成实际名称。

业务代码从官方包导入：

```ts
import * as MediaLibrary from 'expo-media-library';

const { assets, endCursor, hasNextPage } = await MediaLibrary.getAssetsAsync({
  first: 20,
  mediaType: ['photo', 'video'],
});
```

## API 对照表

### Constants

#### `MediaLibrary.MediaType`

类型：`{ audio: 'audio', photo: 'photo', video: 'video', unknown: 'unknown' }`

媒体类型取值。HarmonyOS 的公开接口不管理音频，`audio` 只作为取值存在，不能用于筛选出音频资源。

#### `MediaLibrary.SortBy`

类型：`SortByObject`

`getAssetsAsync` 支持的排序键：`default`、`mediaType`、`width`、`height`、`creationTime`、`modificationTime`、`duration`。

### Hooks

#### `usePermissions(options)`

返回 `[PermissionResponse | null, request, get]`，分别是权限状态、申请权限和查询权限的方法。`options` 见 `PermissionHookOptions`。

### Methods

#### `MediaLibrary.isAvailableAsync()`

返回 `Promise<boolean>`。设备提供系统图库能力时为 `true`；不提供时只注册常量与事件，返回 `false`。

#### `MediaLibrary.getPermissionsAsync(writeOnly)`

返回 `Promise<PermissionResponse>`，查询图库权限。

`writeOnly` 省略或为 `false` 时同时检查读和写权限，为 `true` 时只检查写权限。`status` 可能为 `'granted'`、`'denied'` 或 `'undetermined'`。API 20 及以上由系统区分未决定和已拒绝；API 13 到 API 19 的系统查询只能给出已授权或未授权，模块自己记录用户有没有被问过，没问过时按未决定返回。

`accessPrivileges` 只会是 `'all'` 或 `'none'`，HarmonyOS 不提供部分授权，不会出现 `'limited'`。`expires` 恒为 `'never'`。

#### `MediaLibrary.requestPermissionsAsync(writeOnly)`

返回 `Promise<PermissionResponse>`，弹出系统授权对话框，取值与 `getPermissionsAsync()` 一致。`granularPermissions` 参数不生效。

权限没有在 `module.json5` 中声明时，申请抛出 `ERR_MEDIA_LIBRARY_PERMISSION_REQUEST`。未授权时调用需要权限的方法抛出 `ERR_MEDIA_LIBRARY_PERMISSION`。

#### `MediaLibrary.getAssetsAsync(assetsOptions)`

返回 `Promise<PagedInfo<Asset>>`，查询一页图片或视频，需要读权限。

`first` 默认 20。`after` 传上一页的 `endCursor`；这个值必须是同一次查询结果中的资源标识，找不到时抛出 `ERR_MEDIA_LIBRARY_INVALID_CURSOR`。`album` 限定相册，相册标识不存在时抛出 `ERR_MEDIA_LIBRARY_ALBUM_NOT_FOUND`。

`mediaType` 默认 `['photo']`，可以传 `'all'`、`'photo'`、`'video'`；传 `'all'` 时不按类型过滤。`'audio'` 和 `'unknown'` 在 HarmonyOS 上查不到内容，只传这两个值时返回空页，与图片或视频一起传时忽略。取值不在这些值中时抛出错误。

`sortBy` 支持 `SortBy` 里的键，默认按平台顺序。`SortBy.default` 忽略方向。按 `creationTime` 排序或使用 `createdAfter`、`createdBefore` 筛选时，会先加载符合其余条件的资源再选出这一页，内存用量随候选集规模增长，不推荐在大图库上使用。

`resolveWithFullInfo` 为 `true` 时同时读出图片的 EXIF。资源的方向已在读取时校正，宽高按校正后的值返回。

#### `MediaLibrary.getAssetInfoAsync(asset, options)`

返回 `Promise<AssetInfo | null>`，读取单个资源的详细信息，需要读权限。资源不存在时返回 `null`。`options.shouldDownloadFromNetwork` 不生效。

`localUri` 是资源的原始地址。`location` 从 EXIF 的 GPS 字段换算成十进制度，读不到时为 `null`。`exif` 的字段集合和带单位的取值来自系统图像框架，与 Android、iOS 可能不同。`isFavorite` 取系统的收藏标记。

#### `MediaLibrary.getAlbumsAsync(options)`

返回 `Promise<Album[]>`，查询用户相册，需要读权限。`includeSmartAlbums` 为 `true` 时一并返回系统相册，这些相册的 `type` 为 `'smartAlbum'`。

#### `MediaLibrary.getAlbumAsync(title)`

返回 `Promise<Album | null>`，按名称查询用户相册，需要读权限。找不到时返回 `null`。系统相册不参与匹配。

#### `MediaLibrary.createAssetAsync(localUri, album)`

返回 `Promise<Asset>`，把本地文件导入图库，需要读权限和写权限。

`localUri` 必须指向应用沙箱内的文件，并带有图片或视频的扩展名，否则抛出 `ERR_MEDIA_LIBRARY_MISSING_EXTENSION`、`ERR_MEDIA_LIBRARY_UNSUPPORTED_MEDIA_TYPE` 或 `ERR_MEDIA_LIBRARY_INVALID_URI`。传入 `album` 时，资源创建后加入该相册；相册必须存在而且是用户相册。

保存已经生效、但后续读取资源信息或加入相册失败时，Promise 拒绝，创建的资源留在图库里，不会回滚。

#### `MediaLibrary.saveToLibraryAsync(localUri)`

返回 `Promise<void>`，把本地文件保存到图库，只写权限即可，不需要读权限。文件要求与 `createAssetAsync()` 相同。

#### `MediaLibrary.addAssetsToAlbumAsync(assets, album, copy)`

返回 `Promise<boolean>`，把资源加入相册，需要读权限和写权限。

加入相册不复制文件，`copy` 取任何值行为都一样。相册必须是用户相册，资源标识必须存在，否则抛出 `ERR_MEDIA_LIBRARY_UNSUPPORTED_ALBUM_OPERATION` 或 `ERR_MEDIA_LIBRARY_ASSET_NOT_FOUND`。传入空的资源数组时直接返回 `true`。

#### `MediaLibrary.removeAssetsFromAlbumAsync(assets, album)`

返回 `Promise<boolean>`，把资源移出相册，需要读权限和写权限。相册和资源的要求与 `addAssetsToAlbumAsync()` 相同。

#### `MediaLibrary.deleteAssetsAsync(assets)`

返回 `Promise<boolean>`，删除资源，需要写权限。系统会弹出删除确认，超过 300 个资源时分批处理，前面的批次已删除、后面的批次被取消或失败时，Promise 拒绝，删除不会整体回滚。

> **未实现的内容**
>
> - `createAlbumAsync()`、`deleteAlbumsAsync()`：HarmonyOS 没有对第三方应用公开的相册创建和删除接口，调用抛出 `ERR_MEDIA_LIBRARY_UNSUPPORTED_ALBUM_OPERATION`。
> - `getMomentsAsync()`：iOS 专属接口，HarmonyOS 上没有对应能力。
> - `albumNeedsMigrationAsync()`、`migrateAlbumIfNeededAsync()`：Android 专属接口，HarmonyOS 上不需要迁移。
> - `presentPermissionsPickerAsync()`：Android 14+ 与 iOS 专属接口，HarmonyOS 上不提供部分授权的调整入口。
> - `expo-media-library/next` 入口：官方实验性接口，HarmonyOS 上没有实现。

### Event subscriptions

#### `MediaLibrary.addListener(listener)`

返回 `Subscription`，订阅图库变更，需要读权限。没有读权限时不订阅系统变更，收不到事件。只在应用处于前台且存在订阅时触发。

事件对象的 `hasIncrementalChanges` 恒为 `false`，不附带增删改的资源列表，收到通知后应重新查询。

#### `MediaLibrary.removeSubscription(subscription)`

取消指定的监听。官方已标记废弃，改调 `subscription.remove()`。

#### `MediaLibrary.removeAllListeners()`

移除全部图库变更监听。

### Types

#### `Album`

| 属性         | 类型        | 说明                        |
| ------------ | ----------- | --------------------------- |
| `id`         | `string`    | 相册标识，取自系统相册地址  |
| `title`      | `string`    | 相册名称                    |
| `assetCount` | `number`    | 相册中的资源数量            |
| `type`       | `AlbumType` | `'album'` 或 `'smartAlbum'` |

#### `AlbumType`

`'album' | 'moment' | 'smartAlbum'`。HarmonyOS 只返回 `'album'` 和 `'smartAlbum'`。

#### `AlbumRef`

`Album | string`。

#### `AlbumsOptions`

| 属性                 | 类型      | 说明                           |
| -------------------- | --------- | ------------------------------ |
| `includeSmartAlbums` | `boolean` | 是否包含系统相册，默认 `false` |

#### `Asset`

| 属性               | 类型             | 说明                                |
| ------------------ | ---------------- | ----------------------------------- |
| `id`               | `string`         | 资源标识，与 `uri` 相同             |
| `filename`         | `string`         | 系统显示的文件名                    |
| `uri`              | `string`         | 资源地址                            |
| `mediaType`        | `MediaTypeValue` | `'photo'`、`'video'` 或 `'unknown'` |
| `width`            | `number`         | 宽，单位像素，按方向校正            |
| `height`           | `number`         | 高，单位像素，按方向校正            |
| `creationTime`     | `number`         | 创建时间，Unix 纪元以来的毫秒数     |
| `modificationTime` | `number`         | 修改时间，Unix 纪元以来的毫秒数     |
| `duration`         | `number`         | 时长，单位秒，图片为 0              |

资源没有拍摄时间时，`creationTime` 取入库时间。

#### `AssetInfo`

`Asset` 基础上增加以下属性：`localUri`、`location`、`exif`、`isFavorite`。见 `getAssetInfoAsync()`。

#### `AssetRef`

`Asset | string`。

#### `AssetsOptions`

| 属性                  | 类型                                 | 说明                                   |
| --------------------- | ------------------------------------ | -------------------------------------- |
| `first`               | `number`                             | 单页最多返回的数量，默认 20            |
| `after`               | `AssetRef`                           | 上一页的 `endCursor`                   |
| `album`               | `AlbumRef`                           | 只查询该相册中的资源                   |
| `mediaType`           | `MediaTypeValue[] \| MediaTypeValue` | 资源类型，默认 `MediaType.photo`       |
| `sortBy`              | `SortByValue[] \| SortByValue`       | 排序键，可以传 `[key, ascending]` 组合 |
| `createdAfter`        | `Date \| number`                     | 只返回该时间之后创建的资源             |
| `createdBefore`       | `Date \| number`                     | 只返回该时间之前创建的资源             |
| `resolveWithFullInfo` | `boolean`                            | 是否一并读出 EXIF，默认 `false`        |

> **未实现的内容**
>
> - `AssetsOptions.mediaSubtypes`：iOS 专属选项，HarmonyOS 上不读取。

#### `Location`

| 属性        | 类型     | 说明         |
| ----------- | -------- | ------------ |
| `latitude`  | `number` | 纬度，单位度 |
| `longitude` | `number` | 经度，单位度 |

#### `MediaLibraryAssetInfoQueryOptions`

| 属性                        | 类型      | 说明                     |
| --------------------------- | --------- | ------------------------ |
| `shouldDownloadFromNetwork` | `boolean` | HarmonyOS 上不读取该选项 |

#### `MediaLibraryAssetsChangeEvent`

| 属性                    | 类型      | 说明                               |
| ----------------------- | --------- | ---------------------------------- |
| `hasIncrementalChanges` | `boolean` | 恒为 `false`，变更内容需要重新查询 |

#### `MediaTypeObject`

见 `MediaLibrary.MediaType`。

#### `MediaTypeValue`

`'audio' | 'photo' | 'video' | 'unknown' | 'pairedVideo'`。HarmonyOS 上只会出现 `'photo'`、`'video'` 和 `'unknown'`。

#### `PagedInfo`

| 属性          | 类型      | 说明                                     |
| ------------- | --------- | ---------------------------------------- |
| `assets`      | `Asset[]` | 当前页的资源                             |
| `endCursor`   | `string \| null` | 本页最后一项的标识，作为下一页的 `after`；结果为空且没有传 `after` 时为 `null` |
| `hasNextPage` | `boolean` | 是否还有下一页                           |
| `totalCount`  | `number`  | 符合条件的资源总数                       |

#### `PermissionExpiration`

`'never' | number`，恒为 `'never'`。

#### `PermissionHookOptions`

`PermissionHookBehavior | Options`。

#### `PermissionResponse`

| 属性               | 类型                           | 说明                                        |
| ------------------ | ------------------------------ | ------------------------------------------- |
| `status`           | `PermissionStatus`             | `'granted'`、`'denied'` 或 `'undetermined'` |
| `granted`          | `boolean`                      | 是否已授权                                  |
| `canAskAgain`      | `boolean`                      | 被系统阻止再次询问时为 `false`              |
| `expires`          | `PermissionExpiration`         | 恒为 `'never'`                              |
| `accessPrivileges` | `'all' \| 'limited' \| 'none'` | 只会是 `'all'` 或 `'none'`                  |

#### `SortByKey`

`'default' | 'mediaType' | 'width' | 'height' | 'creationTime' | 'modificationTime' | 'duration'`。

#### `SortByObject`

见 `MediaLibrary.SortBy`。

#### `SortByValue`

`[SortByKey, boolean] | SortByKey`。

> **未实现的内容**
>
> - `GranularPermission`：Android 13+ 专属类型，HarmonyOS 的权限申请没有粒度选项。
> - `MediaSubtype`：iOS 专属类型，HarmonyOS 不提供媒体子类型。
> - `MediaTypeFilter`：Android 14+ 与 iOS 专属类型，配合部分授权使用。
> - `Asset.albumId`、`Asset.mediaSubtypes`：Android 与 iOS 专属字段，HarmonyOS 上不返回。
> - `AssetInfo.isNetworkAsset`、`AssetInfo.orientation`、`AssetInfo.pairedVideoAsset`：iOS 专属字段，HarmonyOS 上没有取值来源。
> - `Album.startTime`、`Album.endTime`、`Album.approximateLocation`、`Album.locationNames`：iOS moment 相册专属字段，HarmonyOS 上没有取值来源。

### Enums

#### `PermissionStatus`

`'granted' | 'denied' | 'undetermined'`，三个取值都会出现。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors)

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
