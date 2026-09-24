# @expo-harmony/expo__dom-webview

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo__dom-webview) | [官方文档](https://docs.expo.dev/guides/dom-components/)

为 HarmonyOS 上的 React Native 应用提供 Expo DOM WebView 的原生实现，与官方同版本的 `@expo/dom-webview` 配套使用。支持网页加载、消息通信、脚本注入和滚动，并允许 DOM 组件通过官方代理调用 Expo 原生模块。

## 安装

```bash
npm install @expo-harmony/expo__dom-webview @expo/dom-webview@55.0.6
```

本包适配 Expo SDK 55 的 `@expo/dom-webview`，提供它在 HarmonyOS 上的原生部分。业务代码继续从官方包导入。原生模块和 RNOH Package 由 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.2（API 14），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

直接渲染网页时，从官方包导入 `WebView` 组件。

```tsx
import { WebView } from '@expo/dom-webview';

<WebView
  source={{ uri: 'https://your-app.example/dom.html' }}
  style={{ height: 320 }}
  onMessage={({ nativeEvent }) => console.log(nativeEvent.data)}
/>;
```

DOM 组件（带 `'use dom'` 指令的文件）由 Expo 运行时渲染，渲染用的 WebView 在 `dom` 属性中指定，设置 `useExpoDOMWebView: true` 即使用本包的实现。

[demo 计数器组件](../../apps/demo/src/modules/dom-webview-counter.tsx)和[原生测试页面](../../apps/demo/src/modules/dom-webview.tsx)展示了完整用法：原生端更新 props，DOM 组件调用异步原生函数并显示返回值，通过 `matchContents` 自动调整容器高度。

本包声明了普通网络权限 `ohos.permission.INTERNET`，合并进宿主应用后即可访问网络。加载的网页可以调用应用内的 Expo 原生模块，能力和原生代码相同，只应加载应用信任的内容。

## API 对照表

### Props

#### `source`

类型：`DomWebViewSource`

要加载的网页地址，只有 `uri` 一个字段。支持网络地址和应用可访问的本地文件。`uri` 变化时加载新地址，与当前地址相同则不重复加载。

#### `style`

设置 WebView 本身的样式。默认铺满外层容器，背景为白色，可以用 `backgroundColor` 覆盖。

#### `containerStyle`

设置外层容器的样式。容器默认 `flex: 1`，裁剪超出边界的内容。

#### `injectedJavaScriptBeforeContentLoaded`

类型：`string`，默认 `''`

在页面内容加载前执行的 JavaScript，每次加载新文档时注入一次，修改后只对之后加载的页面生效。脚本在 Expo 模块代理初始化之后执行。

#### `onMessage`

类型：`(event: { nativeEvent: MessageEventData }) => void`

网页调用 `window.ReactNativeWebView.postMessage(string)` 时触发，`nativeEvent` 带 `data`、`url`、`title` 三个字段，后两个取自触发消息时的页面。与官方描述不同，`window.ReactNativeWebView` 在 HarmonyOS 上始终注入，没有设置 `onMessage` 时消息直接丢弃。

#### `showsHorizontalScrollIndicator` / `showsVerticalScrollIndicator`

类型：`boolean`，默认 `true`

控制对应方向的滚动条是否显示。

#### `nestedScrollEnabled`

类型：`boolean`，默认 `true`

WebView 在外层滚动容器中的嵌套滚动行为。为 `true` 时手势由 WebView 自己消费，网页内容可以滚动，滚到边界后不联动外层容器。为 `false` 时外层容器先滚动，到达边界后网页内容才开始滚动。官方类型将它标记为 Android 专属，在 HarmonyOS 上同样可用。

#### `webviewDebuggingEnabled`

类型：`boolean`，默认 `false`

控制 ArkWeb 的远程调试开关，开启后可以通过 DevTools 调试页面。开关是进程级的，一个 WebView 设置的值会影响应用内所有 WebView，无法按组件单独设置。DOM 组件在开发模式下由 Expo 运行时默认开启。

> **未实现的内容**
>
> - `bounces`、`decelerationRate`、`scrollEnabled`、`pagingEnabled`、`automaticallyAdjustsScrollIndicatorInsets`、`contentInset`、`contentInsetAdjustmentBehavior`、`directionalLockEnabled`：iOS 专属属性，HarmonyOS 的滚动行为由系统 WebView 决定，不模拟 UIKit 的效果。
> - `originWhitelist`、`allowFileAccess`、`allowFileAccessFromFileURLs`、`allowsAirPlayForMediaPlayback`、`allowsFullscreenVideo`、`automaticallyAdjustContentInsets`：官方在所有平台都没有实现，类型里保留只是为了通过 TypeScript 检查。

### Methods

通过组件的 `ref` 调用，接口沿用官方的 `DomWebViewRef`。方法会等待系统 WebView 控制器就绪；初始化期间渲染进程退出时抛出 `ERR_WEBVIEW_NOT_READY`，组件销毁后调用不再产生效果。

#### `scrollTo({ x, y, animated })`

滚动到指定位置。`x`、`y` 缺省为 `0`，`animated` 缺省为 `true`，动画时长固定 250 ms。坐标单位是 vp，传入非有限数值抛出 `ERR_INVALID_ARGUMENT`。

#### `injectJavaScript(script)`

在当前页面执行一段 JavaScript 字符串。

### Types

#### `DomWebViewSource`

`source` 的类型，只有 `uri: string` 一个字段，没有 HTML 字符串、请求头和 POST body 形式。

#### `MessageEventData`

`onMessage` 回调接收的数据，包含 `data`、`url`、`title`，均为 `string`。

> **未实现的内容**
>
> - `ContentInsetProp`：iOS 专属属性 `contentInset` 使用的类型，HarmonyOS 上没有对应能力。

### Expo 原生模块

DOM 组件的网页可以通过官方代理调用应用内的 Expo 原生模块，同步调用、Promise、事件监听和 SharedObject 都可用，行为与官方包一致并跟随安装的官方版本。网页侧的同步调用在 HarmonyOS 上由系统 WebView 异步完成，结果按同步语义返回给网页。单次同步调用等待原生侧超过 30 秒时，网页收到超时错误。

原生调用回到应用的 JavaScript 线程执行，线程上的长任务会推迟同步调用的返回。模块代理只注入顶层文档，iframe 内拿不到 `expo` 对象。导航到新页面会取消还在等待的同步调用，旧文档的后续结果也不会送到新文档。应用应在导航前取消事件订阅并释放 SharedObject。

网页的渲染、输入、媒体和滚动由系统 ArkWeb 提供。摄像头、麦克风、定位、文件选择这类浏览器扩展能力不在本包接口范围内，权限由宿主应用的授权情况决定，本包不代为申请。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
