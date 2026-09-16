# @expo-harmony/expo-document-picker

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-document-picker) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/document-picker/)

为 HarmonyOS 上的 React Native 应用提供 Expo DocumentPicker 的原生实现，与官方同版本的 `expo-document-picker` 配套使用。支持调用系统文件选择器选取一个或多个文档，读取文件名、大小、MIME 类型和修改时间。

## 安装

```bash
npm install @expo-harmony/expo-document-picker expo-document-picker@55.0.13
```

本包适配 Expo SDK 55 的 `expo-document-picker`，原生模块通过 Expo Harmony 自动链接，不需要配置插件，也不需要申请权限。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

业务代码从官方包导入：

```ts
import * as DocumentPicker from 'expo-document-picker';

const result = await DocumentPicker.getDocumentAsync({
  type: ['application/pdf', 'image/*'],
  multiple: true,
});
```

## API 对照表

### Methods

#### `DocumentPicker.getDocumentAsync(options?)`

返回 `Promise<DocumentPickerResult>`，打开系统文件选择器。选择成功后 `canceled` 为 `false`，`assets` 是所选文件数组；用户取消时 `canceled` 为 `true`，`assets` 为 `null`。

`options` 省略时按 `type` 为 `'*/*'`、`multiple` 为 `false`、`copyToCacheDirectory` 为 `true` 处理。

同一时间只允许一次选择，上一次还没结束就再次调用会抛出 `ERR_PICKING_IN_PROGRESS`。接口需要有活跃的 UIAbility，后台无窗口的运行时无法调用，抛出 `ERR_DOCUMENT_PICKER_UNAVAILABLE`。系统选择器自身出错时抛出 `ERR_DOCUMENT_PICKER_FAILED`。

### Types

#### `DocumentPickerOptions`

| 属性                   | 类型                 | 说明                                                          |
| ---------------------- | -------------------- | ------------------------------------------------------------- |
| `type`                 | `string \| string[]` | 允许选择的 MIME 类型，支持 `image/*` 这类通配符，默认 `'*/*'` |
| `multiple`             | `boolean`            | 一次能否选中多个文件，默认 `false`                            |
| `copyToCacheDirectory` | `boolean`            | 是否把所选文件复制到应用缓存目录，默认 `true`                 |

HarmonyOS 的系统选择器按文件后缀过滤，`type` 里的 MIME 类型会先换成后缀。`*/*` 不加过滤；以 `/*` 结尾的通配符按 MIME 前缀匹配系统已注册的类型；精确的 MIME 类型按注册表查询。换不到后缀时抛出 `ERR_DOCUMENT_PICKER_UNSUPPORTED_MIME_TYPE`，要选这类格式可以改用 `*/*`。系统注册的格式随系统版本变化，同一份 `type` 在不同设备上的过滤结果可能不同。`type` 传空数组会在打开选择器之前被拒绝，抛出 `ERR_DOCUMENT_PICKER_OPTIONS_EMPTY_LIST`。

多选数量上限由系统决定：API 20 及以前最多 500 个文件，API 21 起不再限制。实际能不能一次选中多个文件，取决于系统选择器界面。

`copyToCacheDirectory` 为 `true` 时，所选文件复制到应用缓存目录，`uri` 指向副本，其他 Expo 模块可以直接读取。副本文件名是随机 UUID，后缀沿用原文件。复制过程中出错会清掉这次创建的缓存目录，并抛出 `ERR_FAILED_TO_READ_DOCUMENT`。设为 `false` 时 `uri` 是系统选择器返回的原始地址，读权限由系统下发，有效期和可读范围取决于系统。

#### `DocumentPickerAsset`

| 属性           | 类型     | 说明                                |
| -------------- | -------- | ----------------------------------- |
| `uri`          | `string` | 文件地址，默认指向缓存目录中的副本  |
| `name`         | `string` | 文件原始名称                        |
| `size`         | `number` | 文件大小，单位字节，读不到时省略    |
| `mimeType`     | `string` | 文件的 MIME 类型，读不到时省略      |
| `lastModified` | `number` | 最后修改时间，Unix 纪元以来的毫秒数 |

没有后缀的文件不带 `mimeType`。系统读不到修改时间时，`lastModified` 取当前时间。选中的对象不是普通文件，或者文件名不合法时，抛出 `ERR_FAILED_TO_READ_DOCUMENT`。

#### `DocumentPickerResult`

`DocumentPickerSuccessResult | DocumentPickerCanceledResult`。

#### `DocumentPickerSuccessResult`

| 属性       | 类型                    | 说明         |
| ---------- | ----------------------- | ------------ |
| `canceled` | `false`                 | 恒为 `false` |
| `assets`   | `DocumentPickerAsset[]` | 所选文件     |

#### `DocumentPickerCanceledResult`

| 属性       | 类型   | 说明        |
| ---------- | ------ | ----------- |
| `canceled` | `true` | 恒为 `true` |
| `assets`   | `null` | 恒为 `null` |

> **未实现的内容**
>
> - `DocumentPickerOptions.base64`：Web 专属参数，用于让结果带上 Base64 内容，HarmonyOS 上不生效。
> - `DocumentPickerAsset.file`、`DocumentPickerAsset.base64`：Web 专属字段，HarmonyOS 上不返回。
> - `DocumentPickerSuccessResult.output`、`DocumentPickerCanceledResult.output`：Web 专属字段，HarmonyOS 上不返回。

### Error codes

#### `ERR_DOCUMENT_PICKER_OPTIONS_EMPTY_LIST`

`type` 传空数组时抛出，在打开选择器之前拒绝。

#### `ERR_DOCUMENT_PICKER_UNSUPPORTED_MIME_TYPE`

`type` 里的 MIME 类型换不到文件后缀时抛出。

#### `ERR_PICKING_IN_PROGRESS`

上一次选择还没结束时再次调用 `getDocumentAsync()` 时抛出。

#### `ERR_DOCUMENT_PICKER_UNAVAILABLE`

运行时没有 UIAbility，无法打开系统选择器时抛出。

#### `ERR_FAILED_TO_READ_DOCUMENT`

所选对象不是普通文件、文件名不合法，或者文件信息读取失败时抛出。

#### `ERR_DOCUMENT_PICKER_FAILED`

系统选择器出错，或者选择结果无法处理时抛出。

#### `ERR_DOCUMENT_PICKER_DESTROYED`

模块所在的运行时已经销毁后调用时抛出。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
