# @expo-harmony/expo-sharing

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-sharing) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/sharing/)

为 HarmonyOS 上的 React Native 应用提供 Expo Sharing 的原生实现，与官方同版本的 `expo-sharing` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-sharing expo-modules-core@55.0.26 expo-sharing@55.0.24
```

本包适配 Expo SDK 55 的 `expo-sharing`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

如果需要接收其他应用的分享，在 `app.json` 的 `plugins` 中传入 `@expo-harmony/expo-sharing`：

```json
{
  "expo": {
    "plugins": ["@expo-harmony/expo-sharing"]
  }
}
```

插件在目标 Ability 上注册接收分享的入口，默认接收文本、文件和 HTTP(S) 链接，单次最多 50 个文件。可以通过 `utds`、`maxFileSupported`、`allowMultiple` 和 `abilityName` 调整接收的统一数据类型（UTD）、文件数量上限、是否允许一次接收多个文件和目标 Ability，其中 `maxFileSupported` 取值范围是 1 到 50。目标 Ability 必须已存在，并设置 `exported: true`。插件只在接收分享数据时用到。

本包的原生实现依赖宿主 Ability 的生命周期事件，对应的订阅器已随包声明。CNG 工程由 prebuild 自动生成所需入口；Bare 工程需按 [接入说明](https://github.com/renbaoshuo/expo-harmony/blob/master/docs/BareInstallation.md) 手动接入 AbilityStage 和 ExpoRNAbility，否则模块无法加载。

## API 对照表

### Hooks

#### `useIncomingShare()`

返回 `UseIncomingShareResult`。组件挂载期间读取接收到的分享数据并解析，收到新分享或应用回到前台时刷新，卸载后停止。

接收的分享数据已经就绪时，首次渲染即可同步获得 `sharedPayloads`。数据仍在加载时先返回空数组，就绪后自动刷新。

### Methods

#### `Sharing.shareAsync(url, options)`

返回 `Promise<void>`，调起系统分享面板分享本地文件。面板关闭后 Promise 完成，不包含用户的选择结果。

`url` 必须是本地文件的 `file://` 地址，支持应用沙箱内的路径，也支持有读权限的应用文件 URI（如图库选择器返回的地址）。字符串为空时抛出 `ERR_SHARING_INVALID_ARGS`；不是 `file://` 地址、缺少路径、指向的不是普通文件或读不出来时抛出 `ERR_SHARING_INVALID_URL`。

分享内容的类型按 `options.mimeType` 判定，未提供时按文件扩展名判定。识别为图片或视频时，面板中展示内容预览；其余类型和识别不出的内容展示普通卡片。

同一时间只允许一次分享，上一次还没结束就再次调用抛出 `ERR_SHARING_IN_PROGRESS`。接口需要活跃的 UIAbility，后台无窗口的运行时中调用抛出 `ERR_SHARING_UNAVAILABLE`，设备不具备系统分享能力时同样抛出。运行时销毁后调用抛出 `ERR_SHARING_RUNTIME_DESTROYED`，调起面板失败抛出 `ERR_SHARING_FAILED`。

#### `Sharing.isAvailableAsync()`

返回 `Promise<boolean>`。设备具备系统分享能力，且当前运行时有效、UIAbility 位于前台时为 `true`，否则为 `false`。

#### `Sharing.getSharedPayloads()`

返回 `SharePayload[]`，最近一次接收的原始分享数据，没有数据时返回空数组。每条数据对应分享中的一个条目，内容为空的条目会被跳过。`shareType` 和 `mimeType` 按分享方声明的统一数据类型（UTD）换算，换不出时按内容推断：HTTP(S) 链接是 `'url'`，带文件地址的是 `'file'`，其余是 `'text'`。

单次分享的条目数超过 50 条时，读取抛出 `ERR_FAILED_TO_RESOLVE_SHARED_DATA`。后台无窗口的运行时中返回空数组。

#### `Sharing.getResolvedSharedPayloadsAsync()`

返回 `Promise<ResolvedSharePayload[]>`，在原始数据上补充读取内容所需的信息，解析 URL 时需要网络连接。

文本类数据的扩展字段都是 `null`。链接类数据会发起请求跟随重定向，连接和读取超时各为 5 秒，`contentUri` 是重定向后的地址，`value` 保留原始链接，MIME 类型、大小和文件名取自响应头，缺失时按缺省值处理。文件类数据复制到应用缓存目录的 `expo-sharing` 子目录，`contentUri` 指向副本；单个文件上限 100 MiB，单次分享总大小上限 250 MiB，超出限制或复制失败时整个 Promise 拒绝，并删除本次已复制的文件。

再次接收分享后会重新解析，即使内容和上一次相同，副本也会重新生成。已经返回的副本保留在缓存目录中，清空接收状态或再次接收分享都不会删除。

#### `Sharing.clearSharedPayloads()`

清空接收状态，之后 `getSharedPayloads()` 返回空数组。已经返回的缓存文件不会被删除。

### Types

#### `SharePayload`

一条原始分享数据。`value`、`shareType`、`mimeType` 三个字段始终有值。

| 属性        | 类型        | 说明                                                  |
| ----------- | ----------- | ----------------------------------------------------- |
| `value`     | `string`    | 文件地址或文本内容                                    |
| `shareType` | `ShareType` | 分享内容的类型                                        |
| `mimeType`  | `string`    | 内容的 MIME 类型，按 UTD 换算，换不出时按类型取默认值 |

#### `ResolvedSharePayload`

`UriBasedResolvedSharePayload | TextBasedResolvedSharePayload`。

#### `BaseResolvedSharePayload`

`SharePayload` 加上以下字段：

| 属性              | 类型                  | 说明                                                                                               |
| ----------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `contentUri`      | `string \| null`      | 内容地址。链接是重定向后的 URL，文件是缓存副本的地址，纯文本为 `null`                              |
| `contentType`     | `ContentType \| null` | 内容类型，纯文本为 `null`                                                                          |
| `contentMimeType` | `string \| null`      | 内容的 MIME 类型，纯文本为 `null`                                                                  |
| `originalName`    | `string \| null`      | 文件名。链接取 `Content-Disposition` 或 URL 的最后一段，文件沿用分享方的名称，纯文本为 `null`      |
| `contentSize`     | `number \| null`      | 内容大小，单位字节。链接取 `Content-Length`，文件取副本的实际大小，纯文本或缺失该响应头时为 `null` |

#### `UriBasedResolvedSharePayload`

文件和链接类数据的解析结果，`contentType` 为 `'audio' | 'file' | 'video' | 'image' | 'website'`，`contentUri` 必有值。

#### `TextBasedResolvedSharePayload`

纯文本数据的解析结果，扩展字段全部为 `null`。官方类型中 `contentType` 为 `'text'`，这里为 `null`。

#### `ContentType`

`'text' | 'audio' | 'image' | 'video' | 'file' | 'website'`。按 MIME 类型换算：`text/html` 和 XHTML 归为 `'website'`，其余按前缀归类，匹配不到时按分享类型兜底。链接按响应的 `Content-Type` 判定，响应头缺失时按 `text/plain` 处理。

#### `ShareType`

`'text' | 'url' | 'audio' | 'image' | 'video' | 'file'`。按分享方声明的 UTD 归类，归不出时按内容推断。

#### `SharingOptions`

| 选项          | 说明                                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `anchor`      | 分享面板的弹出位置。`x`、`y` 是相对窗口的偏移，`width`、`height` 是锚点区域的尺寸，负的尺寸按 0 处理；省略时位置由系统决定 |
| `dialogTitle` | 不生效。系统分享面板不支持自定义标题，传入时会输出一条警告                                                                 |
| `mimeType`    | 分享内容的 MIME 类型，用于判定面板中的展示形态，未提供时按文件扩展名判定                                                   |
| `UTI`         | iOS 专属选项，传入后忽略                                                                                                   |

`anchor` 在官方文档中仅用于 iPad，这里用于定位系统分享面板。

#### `UseIncomingShareResult`

| 属性                     | 类型                     | 说明                                   |
| ------------------------ | ------------------------ | -------------------------------------- |
| `sharedPayloads`         | `SharePayload[]`         | 未解析的原始数据                       |
| `resolvedSharedPayloads` | `ResolvedSharePayload[]` | 解析后的数据，解析中或失败时为空数组   |
| `isResolving`            | `boolean`                | 是否正在解析                           |
| `error`                  | `Error \| null`          | 解析失败时的错误，成功为 `null`        |
| `clearSharedPayloads`    | `() => void`             | 清空接收状态，已返回的缓存文件不受影响 |
| `refreshSharePayloads`   | `() => void`             | 重新读取并解析，解析失败后可以用它重试 |

> **未实现的内容**
>
> - `ActivationRuleOptions`：iOS 专属类型，配置 iOS 分享扩展可接收的数据类型。HarmonyOS 上接收范围由插件的 `utds`、`maxFileSupported` 和 `allowMultiple` 决定。

### Error codes

#### `ERR_SHARING_INVALID_ARGS`

`url` 为空字符串时抛出。

#### `ERR_SHARING_INVALID_URL`

`url` 不是合法 URI、不是 `file://` 地址、缺少路径、指向的不是普通文件，或文件读不出来时抛出。

#### `ERR_SHARING_UNAVAILABLE`

运行时没有可用的窗口，或设备不具备系统分享能力时抛出。

#### `ERR_SHARING_IN_PROGRESS`

上一次分享还没结束时再次调用 `shareAsync()` 抛出。

#### `ERR_SHARING_FAILED`

调起系统分享面板失败，或分享文件的 URI 生成失败时抛出。

#### `ERR_SHARING_RUNTIME_DESTROYED`

模块所在的运行时销毁后调用时抛出。

#### `ERR_FAILED_TO_RESOLVE_SHARED_DATA`

读取或解析接收的分享数据失败时抛出，如单次分享的条目超过 50 条、文件超过大小限制、URL 请求失败等。

#### `ERR_SHARING_ABILITY_NOT_INITIALIZED`

宿主没有接入模块依赖的 Ability 生命周期订阅器，模块无法加载时抛出。Bare 工程需按接入说明手动接入。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
