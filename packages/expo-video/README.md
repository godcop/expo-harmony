# @expo-harmony/expo-video

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-video) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/video/)

为 HarmonyOS 上的 React Native 应用提供 Expo Video 的原生实现，与官方同版本的 `expo-video` 配套使用。支持视频播放、原生控制栏、全屏、轨道切换和视频缩略图。

## 安装

```bash
npm install @expo-harmony/expo-video expo-video@55.0.21
```

本包适配 Expo SDK 55 的 `expo-video`，业务代码继续从官方包导入。原生模块由 Expo Harmony 自动链接。最低支持 HarmonyOS 6.0.0（API 20），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

播放和缩略图由系统 Media Kit 执行，可用的流媒体协议和编解码格式随设备与系统版本变化。本包只声明普通的 `ohos.permission.INTERNET` 权限。本地文件须位于应用可读目录，或由宿主通过系统文件选择器等方式取得访问授权。

业务代码从官方包导入：

```tsx
import { useVideoPlayer, VideoView } from 'expo-video';

export function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, instance => {
    instance.loop = true;
    instance.play();
  });

  return <VideoView player={player} style={{ width: '100%', height: 240 }} />;
}
```

## API 对照表

### Components

#### `VideoView`

渲染视频画面和原生控制栏。画面输出到系统提供的渲染表面，视图未挂载或尺寸为 0 时播放器不开始准备解码。

一个 player 同时只能绑定一个 `VideoView`，把同一个 player 挂到第二个视图会抛出错误。全屏在该视图的渲染表面上进行，不改变宿主窗口的方向。应用进入后台会暂停播放，回到前台后继续之前的播放意图，系统音频焦点中断时的行为见 `audioMixingMode` 一节。

##### `player`

要渲染的 `VideoPlayer` 实例，通常由 `useVideoPlayer` 创建。可以运行时更换，也可以设为 `null` 清空视图。

##### `nativeControls`

默认 `true`。控制栏提供播放/暂停、前进/后退跳转、进度条和全屏按钮。全屏模式下控制栏始终显示，保证用户可以退出。

##### `contentFit`

默认 `contain`。`cover` 裁剪超出部分，`fill` 拉伸填满容器。

##### `contentPosition`

视频画面在容器内的偏移，默认 `{ dx: 0, dy: 0 }`。

##### `showsTimecodes`

默认 `true`，控制栏显示当前时间和总时长，格式为“分:秒”。

##### `requiresLinearPlayback`

默认 `false`。设为 `true` 后隐藏跳转按钮并禁用进度条，只允许顺序播放。点播受影响，直播本来就不能跳转。

##### `fullscreenOptions`

`enable` 默认 `true`，设为 `false` 时隐藏全屏按钮，调用 `enterFullscreen()` 会抛出错误。用户按系统返回手势或调用 `exitFullscreen()` 退出全屏。

##### `buttonOptions`

控制控制栏按钮的显隐，可配置 `showPlayPause`、`showSeekBackward`、`showSeekForward`、`showBottomBar`，默认都显示。跳转按钮的步长由创建 player 时的 `seekBackwardIncrement` / `seekForwardIncrement` 决定，默认 10 秒。

> **未实现的内容**
>
> - `allowsPictureInPicture`、`startsPictureInPictureAutomatically`、`onPictureInPictureStart`、`onPictureInPictureStop`：未接入画中画，设为 `true` 时抛出错误，事件不会触发。
> - `allowsVideoFrameAnalysis`：iOS 专属属性，HarmonyOS 上没有对应能力。
> - `buttonOptions.showNext`、`showPrevious`、`showSubtitles`、`showSettings`：控制栏没有上一集/下一集、字幕菜单和设置菜单，开启时抛出错误。
> - `fullscreenOptions.orientation`、`autoExitOnRotate`：全屏不改变窗口方向，不支持强制横屏或竖屏，也不支持旋转自动退出。
> - `surfaceType`：渲染表面由视图内部管理，显式设置 `textureView` 时抛出错误。
> - `useExoShutter`：Android 专属属性，HarmonyOS 上没有对应能力。
> - `crossOrigin`、`playsInline`、`useAudioNodePlayback`：Web 专属属性。

#### `VideoAirPlayButton`

iOS 专属组件，HarmonyOS 上不渲染任何内容，只返回一个空视图。

### Component methods

#### `VideoView.enterFullscreen()`

进入全屏，`fullscreenOptions.enable` 为 `false` 时抛出错误。返回 `Promise<void>`。

#### `VideoView.exitFullscreen()`

退出全屏。返回 `Promise<void>`。

#### `VideoView.startPictureInPicture()` / `VideoView.stopPictureInPicture()`

未接入画中画，调用时抛出错误。

### Hooks

#### `useVideoPlayer(source, setup, playerBuilderOptions?)`

创建与组件生命周期绑定的 player，组件卸载时自动释放。`playerBuilderOptions` 只用于设置原生控制栏的跳转步长，见 `buttonOptions` 一节。多数场景应使用这个 Hook，直接管理 `createVideoPlayer` 返回的实例时需要自己调用 `release()`。

### Classes

#### `VideoPlayer`

视频播放器。挂载 `VideoView` 后才开始准备解码，此前 `status` 一直是 `loading`，`duration` 和轨道信息为空。`replaceAsync` 在数据源初始化完成时结束，没有视图时也不会报错，可以用来提前换源。

再次替换数据源会取消旧源的加载，被取消的 `replaceAsync` 以 `ERR_VIDEO_LOAD_CANCELLED` 拒绝。进入错误状态后该次加载停止，可以重新 `replace` 恢复。

##### `VideoPlayer.playing`

类型：`readonly boolean`

是否正在播放。缓冲期间为 `false`。

##### `VideoPlayer.status`

类型：`readonly VideoPlayerStatus`

`idle`、`loading`、`readyToPlay` 或 `error`。缓冲时会回到 `loading`，缓冲结束回到 `readyToPlay`。

##### `VideoPlayer.duration`

类型：`readonly number`

视频时长，单位为秒。直播返回 0，加载完成前为 0。

##### `VideoPlayer.isLive`

类型：`readonly boolean`

系统把当前源识别为直播时为 `true`。识别发生在数据源初始化后，`sourceChange` 时先按 `false` 处理。

##### `VideoPlayer.bufferedPosition`

类型：`readonly number`

已缓冲到的位置，单位为秒。直播时该值随播放位置推进，没有可报告的缓冲信息时为 -1。

##### `VideoPlayer.play()` / `VideoPlayer.pause()`

开始或暂停播放。

##### `VideoPlayer.replay()`

跳到开头并播放。

##### `VideoPlayer.currentTime`

类型：`number`

当前播放位置，单位为秒。设置时跳转到指定时间，超出的部分按视频末尾处理。直播源上设置会抛出错误。

##### `VideoPlayer.seekBy(seconds)`

从当前位置前进或后退指定秒数。直播源上调用会抛出错误。

##### `VideoPlayer.replace(source)` / `VideoPlayer.replaceAsync(source)`

替换数据源。支持 HTTP(S) 地址（可带请求头）、本地文件和打包的 `asset://` / `rawfile://` 资源。`replace` 的异步错误通过 `statusChange` 报告，`replaceAsync` 直接拒绝 Promise。

##### `VideoPlayer.loop`

类型：`boolean`，默认 `false`

播完自动从头继续。直播源上设为 `true` 会抛出错误。

##### `VideoPlayer.muted` / `VideoPlayer.volume`

`volume` 是 0 到 1 之间的数值，超出抛出错误，静音不影响音量值。两者修改时触发 `mutedChange` 或 `volumeChange` 事件。

##### `VideoPlayer.playbackRate`

类型：`number`，默认 `1`

0.125 到 4 之间的倍速。系统保持音高不变。直播源上设置会抛出错误。

##### `VideoPlayer.preservesPitch`

类型：`boolean`，固定为 `true`

倍速播放时系统自动修正音高，不支持关闭。

##### `VideoPlayer.timeUpdateEventInterval`

类型：`number`，默认 `0`

大于 0 时按该间隔触发 `timeUpdate` 事件，单位为秒。

##### `VideoPlayer.keepScreenOnWhilePlaying`

类型：`boolean`，默认 `true`

播放期间保持屏幕常亮。视图上都暂停或销毁后恢复窗口原来的设置。

##### `VideoPlayer.audioMixingMode`

类型：`AudioMixingMode`，默认 `'auto'`

与其他应用音频的协调方式，优先级为 `doNotMix` > `auto` > `duckOthers` > `mixWithOthers`，多个 player 同时播放时取最高优先级。`auto` 在静音、零音量或没有音轨时不会打断别的应用。其他应用打断本应用时，播放先暂停，对方结束后自动继续。

##### `VideoPlayer.availableAudioTracks` / `VideoPlayer.availableSubtitleTracks` / `VideoPlayer.availableVideoTracks`

类型：`readonly` 数组

数据源准备完成后可用的音轨、字幕轨和视频轨。音轨和字幕轨含 `id`、`language`、`label`，有名称时附 `name`，系统没有提供默认轨道和自动选择标记，这两项省略。视频轨含 `id`、`size`、`mimeType`、`frameRate` 和 `bitrate`，`url`、`averageBitrate`、`peakBitrate` 没有取值来源，返回 `null`。这些信息由系统给出，不解析流媒体清单补全。

##### `VideoPlayer.audioTrack` / `VideoPlayer.subtitleTrack`

类型：可写，`null` 表示禁用

切换音轨或字幕轨，必须从对应的可用轨道数组里选。设为 `null` 会静音音频或隐藏字幕。字幕使用系统返回的文本，不复刻复杂样式和特效。

##### `VideoPlayer.videoTrack`

类型：`readonly`

当前播放的视频轨，取自可用视频轨数组。

##### `VideoPlayer.bufferOptions`

类型：`BufferOptions`

只能在数据源准备前设置。`preferredForwardBufferDuration` 为 0 时使用系统默认，其他值必须在 1 到 20 秒之间。

##### `VideoPlayer.currentLiveTimestamp` / `VideoPlayer.currentOffsetFromLive`

类型：`readonly null`

直播源上没有提供节目时间戳和延迟数据，恒为 `null`。

##### `VideoPlayer.targetOffsetFromLive`

类型：`number`，固定为 `0`

不支持设置直播播放偏移，非零值抛出错误。

##### `VideoPlayer.isExternalPlaybackActive`

类型：`readonly false`

外部播放未接入。

> **未实现的内容**
>
> - `allowsExternalPlayback`：外部播放（AirPlay）未接入，设为 `true` 时抛出错误。
> - `showNowPlayingNotification`：没有 Now Playing 通知，设为 `true` 时抛出错误。
> - `staysActiveInBackground`：不支持后台播放，设为 `true` 时抛出错误。
> - `seekTolerance`：跳转总是精确到请求的时间，非零容差抛出错误。
> - `scrubbingModeOptions`：Android 的 ExoPlayer 拖动优化在 HarmonyOS 上没有对应能力，开启时抛出错误。
> - `generateThumbnailsAsync` 以外的视频帧分析：iOS 专属能力。

##### `VideoPlayer.generateThumbnailsAsync(times, options?)`

从当前源提取视频帧作为缩略图，`times` 为单个秒数或秒数数组。`maxWidth` / `maxHeight` 限制尺寸并保持比例，只缩小不放大。返回的 `VideoThumbnail` 是原生图片引用，可以直接作为 `expo-image` 的 `source`，不再使用时调用其 `release()` 释放。

本地和网络点播源都可以提帧。网络提帧依赖系统的下载能力，不支持 HLS、DASH 和直播。

#### `VideoThumbnail`

`generateThumbnailsAsync` 返回的原生图片引用，含 `width`、`height` 和 `requestedTime` 属性。iOS 的 `actualTime` 没有对应取值。

### Methods

#### `Video.isPictureInPictureSupported()`

返回 `false`，当前未接入画中画。

#### `Video.getCurrentVideoCacheSize()`

返回 0。没有实现持久化视频缓存。

#### `Video.clearVideoCacheAsync()`

空操作，仍要求先释放所有 player，否则拒绝。

#### `Video.setVideoCacheSizeAsync(sizeBytes)`

设置持久化缓存大小，调用即拒绝。

### Types

#### `VideoSource`

`string`、`number` 或 `null`，也可以是包含 `uri`、`headers`、`metadata` 等字段的对象。数字形式的资源 ID 由官方包解析为 `asset://` URI。`drm` 和 `useCaching` 在 HarmonyOS 上不支持，传入即抛出错误。

#### `ContentType`

只接受省略或 `'auto'`，由系统自动识别格式。强制指定 `'progressive'`、`'hls'`、`'dash'` 或 `'smoothStreaming'` 都会抛出错误，协议能力以系统 Media Kit 为准。

#### `AudioMixingMode`

`'mixWithOthers'`、`'duckOthers'`、`'auto'` 或 `'doNotMix'`，行为见 `audioMixingMode` 一节。

#### `VideoPlayerStatus`

`'idle'`、`'loading'`、`'readyToPlay'` 或 `'error'`。

#### `BufferOptions`

只有 `preferredForwardBufferDuration` 有作用，其余字段传入即抛出错误。

#### `SeekTolerance`

只接受零容差，非零值抛出错误，见 `VideoPlayer` 一节的未实现列表。

#### `VideoThumbnailOptions`

`maxWidth` 和 `maxHeight`，单位为像素。

#### 事件负载类型

`StatusChangeEventPayload`、`PlayingChangeEventPayload`、`PlaybackRateChangeEventPayload`、`VolumeChangeEventPayload`、`MutedChangeEventPayload`、`SourceChangeEventPayload`、`TimeUpdateEventPayload`、`SourceLoadEventPayload` 以及各轨道变化事件的负载，字段与官方一致。`TimeUpdateEventPayload` 中的 `currentLiveTimestamp` 和 `currentOffsetFromLive` 恒为 `null`，`bufferedPosition` 与同名属性一致。

#### `VideoPlayerEvents`

官方定义的全部事件都支持，包括 `statusChange`、`playingChange`、`playbackRateChange`、`volumeChange`、`mutedChange`、`playToEnd`、`timeUpdate`、`sourceChange`、`sourceLoad`、`availableSubtitleTracksChange`、`subtitleTrackChange`、`availableAudioTracksChange`、`audioTrackChange`、`videoTrackChange` 和 `isExternalPlaybackActiveChange`。

> **未实现的内容**
>
> - `PlayerBuilderOptions` 的跳转步长以外的用途、`ScrubbingModeOptions`、`DRMOptions`、`DRMType`：见对应小节，HarmonyOS 上没有这些能力。
> - `VideoMetadata`：没有 Now Playing 通知可展示这些信息，字段被接受但没有作用。
> - `SurfaceType`：见 `VideoView` 的未实现列表。
> - `VideoContentFit`：官方取值全部支持，此类型仅照抄官方定义。`FullscreenOrientation`、`ButtonOptions` 的部分字段：见 `VideoView` 的未实现列表。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/@renbaoshuo)
