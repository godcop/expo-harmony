# @expo-harmony/expo-speech

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-speech) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/speech/)

为 HarmonyOS 上的 React Native 应用提供 Expo Speech 的原生实现，与官方同版本的 `expo-speech` 配套使用。支持离线语音合成、音色查询、排队播报和停止播放。

## 安装

```bash
npm install @expo-harmony/expo-speech expo-speech
```

本包适配 Expo SDK 55，与官方包 `expo-speech` 搭配使用。原生部分由 Expo Harmony 自动链接，不需要额外配置，业务代码照常从 `expo-speech` 导入。最低支持 HarmonyOS 5.1.1（API 19），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

语音合成使用系统 Core Speech Kit 的离线能力，不需要申请权限，也不会自动下载语音模型。设备需要具备语音合成的系统能力，并安装好需要的音色。播报在前台进行，不启用后台播报。

## API 对照表

### Constants

#### `Speech.maxSpeechInputLength`

值为 `10000`，按 JS 字符串长度（UTF-16 代码单元）计算。更长的文本通过 `onError` 返回错误。

### Methods

#### `Speech.speak(text, options)`

返回 `void`，将一段文本加入播报队列并按调用顺序朗读。每条文本可以单独设置语言、音色、语速等选项，播放出错或选项校验失败时通过 `onError` 返回。

| 选项 | HarmonyOS 行为 |
| --- | --- |
| `language` | 语言标签。优先匹配完整标签，再匹配同一语种的其他变体，都匹配不到时改用系统语言对应的音色，仍没有就用第一个可用音色。 |
| `voice` | 音色 ID，取自 `getAvailableVoicesAsync()` 返回的 `identifier`，优先于 `language`。音色无效或未安装时触发 `onError`。 |
| `rate` / `pitch` | 默认 `1`，允许 `0.5` 到 `2`。超出范围或不是有限数值时触发 `onError`。 |
| `volume` | 默认 `1`，超出 `0` 到 `1` 的部分会被截断。不是有限数值时触发 `onError`。 |
| `onStart` / `onDone` / `onStopped` / `onError` | 在开始播放、播放完成、被 `stop()` 停止和失败时触发。 |
| `onBoundary` | 系统没有逐词位置回调，可以传入但不会触发。 |
| `useApplicationAudioSession` | iOS 专用，忽略。 |
| `onMark` / `onPause` / `onResume` / `_voiceIndex` | 传入后不生效。 |

空文本不会朗读，先完成音色校验，排到它时依次触发 `onStart` 和 `onDone`。数字的读音跟随实际选用的音色。可用的语言和音色取决于设备及已安装的系统语音模型。

#### `Speech.stop()`

返回 `Promise<void>`，停止当前播放并清空队列，正在准备播放的条目同样会被取消。每条被取消的文本触发一次 `onStopped`。停止后系统引擎随之释放，下一次播报需要重新初始化。

#### `Speech.isSpeakingAsync()`

返回 `Promise<boolean>`，表示系统是否正在合成或播放。还在队列中等待的文本不算在内，此时可能返回 `false`。

#### `Speech.getAvailableVoicesAsync()`

返回 `Promise<Voice[]>`，列出系统提供的离线音色，明确未安装的音色不会返回。个别音色缺少安装状态信息，这类条目照常返回，选中后不可用会在播放时报错。

> **未实现的内容**
>
> - `pause()` / `resume()`：系统语音服务没有暂停和恢复的接口，调用抛出 `UnavailabilityError`，与官方 Android 平台的行为一致。

### Types

#### `SpeechOptions`

`speak()` 的选项类型，各字段在 HarmonyOS 上的行为见 `Speech.speak()` 一节的表格。

#### `Voice`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `identifier` | `string` | 由语言、人物编号和风格组成的音色 ID，在同一设备上保持稳定，应作为不透明字符串使用。 |
| `name` | `string` | 系统给出的音色描述，为空时回退为 `identifier`。 |
| `language` | `string` | 规范化后的语言标签，例如 `zh-CN`、`en-US`。 |
| `quality` | `VoiceQuality` | 系统不提供音色等级，恒为 `VoiceQuality.Default`。 |

> **未实现的内容**
>
> - `WebVoice`：Web 专属类型，HarmonyOS 上没有对应概念。
> - `SpeechEventCallback`、`NativeBoundaryEvent`、`NativeBoundaryEventCallback`：服务于 Web 回调写法和逐词位置回调，HarmonyOS 上没有相应能力。

### Enums

#### `VoiceQuality`

枚举可以正常使用。系统不区分音色质量，`Voice.quality` 恒为 `Default`，`Enhanced` 不会出现。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
