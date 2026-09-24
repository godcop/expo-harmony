# @expo-harmony/expo-store-review

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-store-review) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/storereview/)

为 HarmonyOS 上的 React Native 应用提供 Expo StoreReview 的原生实现，与官方同版本的 `expo-store-review` 配套使用。支持查询应用内评价能力和拉起 AppGallery 评价弹窗。

## 安装

```bash
npm install @expo-harmony/expo-store-review expo-store-review@55.0.18
```

原生模块通过 Expo Harmony 自动链接，业务代码从 `expo-store-review` 导入。最低支持 HarmonyOS 6.0.0（API 20），宿主的 `compatibleSdkVersion` 也要满足这一要求。支持手机、平板和 PC/2in1。

## API 对照表

### Methods

#### `StoreReview.isAvailableAsync()`

返回 `Promise<boolean>`，检查设备是否具有 AppGallery 应用内评价能力。无界面的 headless 运行环境返回 `false`。查询不会显示弹窗，也不检查账号登录状态、历史评论或评价配额；返回 `true` 不保证请求评价时一定显示弹窗。AppGallery 的评价能力不支持模拟器，实际弹窗、账号资格和评价配额以真机 AppGallery 环境为准。

#### `StoreReview.requestReview()`

返回 `Promise<void>`，使用当前前台应用的 `UIAbilityContext` 调用 AppGallery Kit 的 `commentManager.showCommentDialog`。服务不可用或处于 headless 环境时抛出 `ERR_STORE_REVIEW_UNAVAILABLE`，应用不在前台时抛出 `ERR_STORE_REVIEW_BACKGROUND`。

系统调用失败时，将 `BusinessError.code` 转为字符串作为错误码，并保留原生消息；没有原生错误码时使用 `ERR_STORE_REVIEW_REQUEST_FAILED`。账号未登录、当前版本已评论或超过评价配额等情况由 AppGallery 判断。

成功返回不代表用户已完成评价，也不会提供评分值。模块不记录评价状态、不自行限制调用次数，也不自动跳转商店页面。

#### `StoreReview.storeUrl()`

返回 `string | null`。沿用官方 JS，仅在 iOS/Android 上读取商店地址，因此 HarmonyOS 返回 `null`。

#### `StoreReview.hasAction()`

返回 `Promise<boolean>`。沿用官方 JS，在 HarmonyOS 上结果与 `isAvailableAsync()` 一致。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
