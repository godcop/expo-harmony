# @expo-harmony/expo-web-browser

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-web-browser) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/webbrowser/)

为 HarmonyOS 上的 React Native 应用提供 Expo WebBrowser 的原生实现，与官方同版本的 `expo-web-browser` 配套使用。支持打开系统浏览器、接收认证回跳和结束认证等待。

## 安装

```bash
npm install @expo-harmony/expo-web-browser expo-web-browser@55.0.20
```

本包适配 Expo SDK 55，安装时与官方的 `expo-web-browser` 搭配使用。JavaScript 接口和类型定义都来自官方包，本包只提供 HarmonyOS 侧的原生实现，业务代码照常从 `expo-web-browser` 导入。

```ts
import * as WebBrowser from 'expo-web-browser';

await WebBrowser.openBrowserAsync('https://example.com');
```

原生模块由 Expo Harmony 在构建时自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

## 认证回跳配置

在 `app.json` 中配置应用的 scheme，并在认证服务端注册对应的回跳 URL：

```json
{
  "expo": {
    "scheme": "myapp"
  }
}
```

```ts
const result = await WebBrowser.openAuthSessionAsync('https://example.com/authorize', 'myapp://auth/callback');
```

手工维护的 Harmony 工程需自行配置 UIAbility 的 `skills.uris`，并通过 Expo Harmony 宿主转发生命周期事件。回跳必须复用发起请求的同一个 UIAbility 实例，一般使用 `singleton`；HTTPS App Linking 还需完成域名关联。

## API 对照表

### Methods

#### `WebBrowser.openBrowserAsync(url, browserParams)`

返回 `Promise<WebBrowserResult>`。在系统浏览器中打开 HTTP/HTTPS 网页，浏览器由系统挑选，应用不能指定。启动成功返回 `{ type: 'opened' }`，不等待页面加载，也不等待浏览器关闭，返回后不再追踪浏览器状态。

调用时应用需要处于前台，否则抛出 `ERR_WEB_BROWSER_UNAVAILABLE`。浏览器还在启动或已有认证会话进行时，返回 `{ type: 'locked' }`，不发起打开。

HarmonyOS 打开的是外部浏览器，没有应用内模态窗口。`toolbarColor`、`showTitle`、`presentationStyle`、`browserPackage` 等平台专属选项没有对应能力，传入后不生效。

#### `WebBrowser.openAuthSessionAsync(url, redirectUrl, options)`

返回 `Promise<WebBrowserAuthSessionResult>`。在系统浏览器中打开 `url` 并等待回跳，收到以 `redirectUrl` 开头的 URL 时返回 `{ type: 'success', url }`。匹配只看前缀，URL 的 query 和 fragment 原样保留，规则与 Android 一致。OAuth state、PKCE 和 token 交换由认证客户端自行处理。

应用回到前台而没有匹配的回跳时返回 `{ type: 'dismiss' }`，用户手动切回应用也是这个结果。分屏等没有前后台切换的场景不会自动结束，需要调用 `dismissAuthSession()`。HarmonyOS 区分不了用户关闭浏览器和切回应用，不返回 `cancel`。

不提供 `redirectUrl` 时收不到回跳，等待只能以 `dismiss` 或错误结束。已有认证会话或浏览器启动请求未完成时抛出 `ERR_WEB_BROWSER_ALREADY_OPEN`。等待期间 UIAbility 被销毁时以 `ERR_WEB_BROWSER_DESTROYED` 拒绝 Promise，进程被终止后重新启动应用，未完成的等待不会恢复。

打开浏览器失败时以 `ERR_WEB_AUTH_SESSION_FAILED_TO_START` 拒绝 Promise，会话会被清理，可以再次发起认证。回跳在浏览器启动完成前到达也能正常返回 `success`。

`preferEphemeralSession`、`preferUniversalLinks` 等认证选项在 HarmonyOS 上不生效。浏览器自行管理 Cookie 和登录状态，本包不读取、注入或清除 Cookie，也无法保证临时会话隔离。

#### `WebBrowser.dismissAuthSession()`

立即以 `{ type: 'dismiss' }` 结束当前的认证等待，没有进行中的会话时不做任何事。只结束应用内的等待，不关闭外部浏览器，已提交给系统的启动请求无法撤销。

#### `WebBrowser.dismissBrowser()`

HarmonyOS 没有允许应用关闭外部浏览器页面的公开接口，调用抛出 `ERR_WEB_BROWSER_DISMISS_UNAVAILABLE`。

#### `WebBrowser.warmUpAsync()` / `WebBrowser.coolDownAsync()` / `WebBrowser.mayInitWithUrlAsync()`

三个方法服务于 Android 的 Custom Tabs 预热与预加载，HarmonyOS 没有对应能力。调用不执行任何操作，`browserPackage` 和 `url` 参数被忽略，返回空对象。

#### `WebBrowser.getCustomTabsSupportingBrowsersAsync()`

返回 `Promise<WebBrowserCustomTabsResults>`，字段恒为空值。`browserPackages` 和 `servicePackages` 是空数组，`defaultBrowserPackage` 和 `preferredBrowserPackage` 是 `undefined`。不查询设备上安装的应用。

#### `WebBrowser.maybeCompleteAuthSession(options)`

Web 平台在回跳落地页关闭弹窗用的方法，HarmonyOS 没有这个流程。不论是否传入 `options`，固定返回 `{ type: 'failed', message: 'Not supported on this platform' }`。

### Types

#### `WebBrowserResult`

`{ type: WebBrowserResultType }`，HarmonyOS 上 `type` 只会是 `opened`、`locked` 或 `dismiss`。

#### `WebBrowserRedirectResult`

`{ type: 'success', url: string }`，`url` 是触发结果的完整回跳 URL。

#### `WebBrowserAuthSessionResult`

`WebBrowserRedirectResult` 与 `WebBrowserResult` 的联合类型。

#### `WebBrowserOpenOptions`

HarmonyOS 打开外部浏览器，页面外观由浏览器自己决定，传入的选项均不生效。类型保留原样，跨平台代码可以照常填写。

#### `AuthSessionOpenOptions`

在 `WebBrowserOpenOptions` 上增加了 `preferEphemeralSession` 和 `preferUniversalLinks`，两者都是 iOS 专属选项，HarmonyOS 上不生效。

#### `WebBrowserCustomTabsResults`

字段结构与官方一致，HarmonyOS 上全部为空值。

#### `WebBrowserWarmUpResult` / `WebBrowserCoolDownResult` / `WebBrowserMayInitWithUrlResult`

`ServiceActionResult` 的三个别名，HarmonyOS 上对应方法返回空对象。

> **未实现的内容**
>
> - `WebBrowserCompleteAuthSessionOptions`：Web 专属类型，`skipRedirectCheck` 只作用于 Web 平台的回跳校验。
> - `WebBrowserCompleteAuthSessionResult`：Web 专属类型，HarmonyOS 上对应方法固定返回失败。
> - `WebBrowserWindowFeatures`：Web 专属类型，HarmonyOS 上没有弹窗窗口特性。

### Enums

#### `WebBrowserResultType`

HarmonyOS 上可取 `OPENED`、`LOCKED`、`DISMISS`。`CANCEL` 是 iOS 专属值，不会在 HarmonyOS 上出现。

> **未实现的内容**
>
> - `WebBrowserPresentationStyle`：iOS 专属枚举，对应 `UIModalPresentationStyle`，HarmonyOS 上没有应用内浏览器窗口。

### 错误码

`ERR_WEB_BROWSER_INVALID_URL` 表示 URL 不是合法绝对 URL、缺少 host 或 scheme 不是 HTTP/HTTPS，`redirectUrl` 不合法时也用它。错误消息不包含 URL 本身，认证 URL 里可能带有 token 和授权码。

`ERR_WEB_BROWSER_OPEN_BROWSER` 和 `ERR_WEB_AUTH_SESSION_FAILED_TO_START` 分别表示 `openBrowserAsync()` 和 `openAuthSessionAsync()` 打开浏览器失败，消息同样不包含 URL。

`ERR_WEB_BROWSER_UNAVAILABLE` 表示调用时应用不在前台。

`ERR_WEB_BROWSER_DESTROYED` 表示发起调用的 UIAbility 已销毁，或认证等待期间 UIAbility 被销毁。

`ERR_WEB_BROWSER_ALREADY_OPEN` 表示已有认证会话或浏览器启动请求未完成。

`ERR_WEB_BROWSER_DISMISS_UNAVAILABLE` 由 `dismissBrowser()` 抛出。

> **未实现的内容**
>
> - `ERR_WEB_BROWSER_REDIRECT`、`ERR_WEB_BROWSER_BLOCKED`、`ERR_WEB_BROWSER_CRYPTO`：Web 专属错误码，HarmonyOS 上没有对应场景。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
