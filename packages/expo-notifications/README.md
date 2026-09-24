# @expo-harmony/expo-notifications

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-notifications) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/notifications/)

为 HarmonyOS 上的 React Native 应用提供 Expo Notifications 的原生实现，与官方同版本的 `expo-notifications` 配套使用。支持通知权限、即时通知、系统代理提醒、角标、通知按钮与点击响应，设备推送注册直接使用 Huawei Push Kit。

## 安装

```bash
npm install @expo-harmony/expo-notifications expo-notifications@55.0.27
```

本包适配 Expo SDK 55 的 `expo-notifications`，业务代码继续从官方包导入。原生模块和生命周期订阅器由 Expo Harmony 自动链接。最低支持 HarmonyOS 6.1.0（API 23），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

安装之外还有三处配置。`app.json` 里要注册下文的 Config Plugin，用到定时提醒要声明代理提醒权限，远程推送要在 AppGallery Connect 开通 Huawei Push Kit。

## Config Plugin

在 `app.json` 中注册插件，为主 Ability 配置独立的 Push Kit skill、生命周期标记和 singleton 启动方式：

```json
{
  "expo": {
    "plugins": [
      ["@expo-harmony/expo-notifications", { "defaultSlotType": "service" }]
    ],
    "harmony": {
      "bundleName": "com.example.app",
      "compatibleSdkVersion": 23
    }
  }
}
```

`defaultSlotType` 接受 `service`、`social`、`content` 或 `other`，默认 `service`。应按通知实际用途选择分类；声音、横幅和展示效果仍受系统分类及用户设置控制。

裸工程需在主 Ability 声明独立的 `action.ohos.push.listener` skill、同名 metadata（值为 `"true"`），将 `launchType` 设为 `singleton`，并接入 Expo AbilityStage/Ability 生命周期分发。可通过 metadata `expo.modules.notifications.defaultSlotType` 指定分类。一个应用只能有一个 Push Kit 接收 Ability。

### 定时提醒权限

使用定时提醒的应用需在 `harmony.permissions` 中显式声明：

```json
{
  "expo": {
    "harmony": {
      "permissions": [
        { "name": "ohos.permission.PUBLISH_AGENT_REMINDER" }
      ]
    }
  }
}
```

裸工程将相同条目写入 `module.json5` 的 `module.requestPermissions`。这是安装时授予的开放 `system_grant` 权限，无需 ACL 审批；本包和插件不自动添加这个可选权限。即时通知和推送注册不需要它，也不需要通知监听等受限权限。

声明权限不保证系统允许发布代理提醒，应用权益和配额仍由系统校验，发布可能失败。应用需自行确认平台要求及签名配置，并结合返回错误和系统日志排查；本包保留系统错误，不代办权益或绕过校验。

### Huawei Push Kit

应用须自行在 AppGallery Connect 开通 HarmonyOS Push Kit，配置对应的应用标识、签名及所需推送权益，参照[官方开发准备](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/push-preparations)。插件不修改签名或代办权益。

## API 对照表

### 通知权限

#### `getPermissionsAsync()`

返回 `Promise<NotificationPermissionsStatus>`，读取系统的通知开关。HarmonyOS 只有一个通知总开关，`status` 相应取 `granted`、`denied` 或 `undetermined`。模块会记录应用是否发起过授权请求，没有请求过且未授权时返回 `undetermined`，请求被拒绝后返回 `denied`，此时 `canAskAgain` 为 `false`，`expires` 恒为 `never`。系统的通知设置对象（声音、振动、角标等开关）放在额外的 `harmony` 字段里。

#### `requestPermissionsAsync(permissions?)`

返回 `Promise<NotificationPermissionsStatus>`。未授权时弹出系统的授权对话框，已授权时直接返回当前状态。用户拒绝过之后系统不再弹窗，重复调用只会得到 `denied`，需要引导用户去系统设置里手动开启。参数中的 iOS/Android 细粒度申请选项在这里没有对应物，会被忽略。

### 角标

#### `getBadgeCountAsync()`

返回 `Promise<number>`，读取应用角标。设备不支持角标时返回 `0`。

#### `setBadgeCountAsync(badgeCount, options?)`

返回 `Promise<boolean>`，设置应用角标，传 `0` 清除。`badgeCount` 需要是 0 到 2147483647 的整数。通知未授权时返回 `false`。API 26 及以上会检查系统设置里的角标开关，开关关闭时返回 `false`。API 23 到 API 25 查不到这个开关，返回 `true` 只代表调用成功，是否显示角标由桌面决定。其余系统错误会拒绝。`options` 里只有 web 平台的选项，在这里不使用。

### 前台展示

#### `setNotificationHandler(handler)`

设置应用前台收到通知时的展示策略。handler 需要在 3 秒内返回 `NotificationBehavior`，超时的通知会被丢弃，没有设置 handler 时前台通知一律不展示。`shouldShowBanner` 和 `shouldShowList` 分别控制横幅和通知中心条目，只弹横幅不进通知中心的组合不支持，只进通知中心不出横幅可以做到，已废弃的 `shouldShowAlert` 等价于同时设置这两项。`shouldPlaySound` 和 `shouldSetBadge` 控制声音和角标，内容里的 `badge` 值在 `shouldSetBadge` 为 `true` 时写入角标。

> **未实现的内容**
>
> - `NotificationBehavior.priority`：Android 专属字段，传入以 `ERR_NOTIFICATIONS_UNSUPPORTED` 拒绝。

### 本地通知与定时提醒

#### `scheduleNotificationAsync(request)`

返回 `Promise<string>`，通知的标识符。`trigger` 传 `null` 时立即发送，传入触发器对象时注册定时提醒。

内容支持 `title`、`body`、`subtitle`、`data`、`badge`、`autoDismiss`、`categoryIdentifier`，`subtitle` 显示为通知的附加文本。`sound` 只支持默认声音，传 `false` 或 `null` 可以让即时通知单条静音。

即时通知走哪条路径取决于应用状态。前台时交给 `setNotificationHandler()` 决定是否展示，后台时直接交给系统发布，内容里的 `badge` 同步写到角标。

定时提醒由系统代理投递，应用退出或被杀后仍会触发，不经过前台 handler，也不产生逐次的 received 事件。发布前需要在 manifest 声明 `ohos.permission.PUBLISH_AGENT_REMINDER`，未声明时以 `ERR_NOTIFICATIONS_REMINDER_PERMISSION` 拒绝。提醒只能携带 `title` 和 `body`。用相同 identifier 再次调度会先取消旧提醒再发布新的，发送同 identifier 的即时通知不影响已有的定时提醒。数量和频率受系统配额限制，超出时发布失败。本地记录写入失败时会撤回刚发布的提醒，撤回也失败时以 `ERR_NOTIFICATIONS_SCHEDULE_ROLLBACK` 报错，重启应用后重试。

#### 触发器

- `date` 传毫秒时间戳，必须是未来时间。
- `timeInterval` 传正整数秒，从发布时刻起算。
- `daily`、`weekly`、`monthly`、`yearly` 传 `hour` 和 `minute`，`weekly` 另传 `weekday`（1 为周日），`monthly` 和 `yearly` 另传 `day`，`yearly` 还要传 `month`（0 为一月）。计算基于设备本地日历和时区，月份里没有对应日期时跳过该月，`yearly` 的月日组合在日历上不存在时调用即拒绝。

代理提醒按秒触发，触发时刻向上取整到整秒，不会提前投递。`date` 触发器取整后的日期同时用于实际触发、`getAllScheduledNotificationsAsync()` 返回的 trigger 和点击响应里的 `date`，三处一致。重复提醒每次触发时，点击响应携带的 `date` 仍是初次计划的日期，不是本次实际投递的时间。

#### `getNextTriggerDateAsync(trigger)`

返回 `Promise<number | null>`，按当前时间计算的下一次触发时刻，Unix 毫秒时间戳，`date` 触发器指向过去时返回 `null`。只做计算，不注册提醒。

#### `getAllScheduledNotificationsAsync()`

返回 `Promise<NotificationRequest[]>`。查询前先与系统的有效提醒列表核对，已失效的计划被移除，本包已发布但本地记录丢失的提醒会被找回并重新登记。

#### `cancelScheduledNotificationAsync(identifier)` / `cancelAllScheduledNotificationsAsync()`

取消一个或全部定时提醒。重复取消不报错，只处理本包创建的提醒，不影响应用内其他模块发布的代理提醒。

> **未实现的内容**
>
> - `calendar` 触发器：iOS 专属，系统的重复提醒只有日期和星期两类规则。
> - `timeInterval` 触发器的 `repeats`：系统提醒不支持按固定间隔重复。
> - 触发器上的 `channelId`：HarmonyOS 没有通知渠道。
> - `sound` 的自定义取值：本地通知只有默认声音和静音两种。
> - `sticky`、`launchImageName`、`attachments`、`vibrate`、`color`、`priority`、`interruptionLevel`：分属 Android 和 iOS 的展示字段，传入即拒绝。
> - 定时提醒上的 `badge`、`subtitle`、`categoryIdentifier` 和单条静音：系统提醒接口不提供这些能力，传入即拒绝。

### 已展示通知

#### `getPresentedNotificationsAsync()`

返回 `Promise<Notification[]>`，当前应用展示在通知中心的通知。本包发布的通知能还原完整的 `request` 和 `data`。Push Kit 的远程通知只能读到标题、正文和标识符，服务端下发的原始 data 取不回来，`data` 为空对象，`date` 是系统的送达时间。

#### `dismissNotificationAsync(identifier)` / `dismissAllNotificationsAsync()`

清除一条或当前应用的全部已展示通知，不影响尚未触发的定时提醒。

### 通知类别

#### `setNotificationCategoryAsync(identifier, actions, options?)`

保存类别并返回。系统限制每个通知最多两个操作按钮，按钮需要 `identifier` 和 `buttonTitle`，点击后拉起应用，响应里带回按钮的 `actionIdentifier`。类别只作用于即时本地通知。

#### `getNotificationCategoriesAsync()`

返回 `Promise<NotificationCategory[]>`，已保存的全部类别。

#### `deleteNotificationCategoryAsync(identifier)`

返回 `Promise<boolean>`，删除成功为 `true`，类别不存在为 `false`。删除类别不影响已经展示的通知。

> **未实现的内容**
>
> - 按钮的 `textInput` 和 `options` 中的 `opensAppToForeground: false`、`isAuthenticationRequired`、`isDestructive`：系统的通知按钮只能以打开应用的方式响应，不支持文本输入、后台执行、解锁验证和破坏性标记。
> - `NotificationCategoryOptions` 中的 iOS 专属选项：传入即拒绝。

### 事件与点击响应

#### `addNotificationReceivedListener(listener)`

应用在前台运行期间收到通知时触发，覆盖即时本地通知和前台到达的远程通知。远程通知要进入这个监听器，服务端发送时需设置 `foregroundShow: false`，为 `true` 时由系统直接展示，JS 侧收不到。

#### `addNotificationResponseReceivedListener(listener)`

用户点击通知主体或操作按钮时触发，冷启动和热启动都能收到。本地通知的响应保留完整的 `request` 和 `actionIdentifier`。远程通知的点击响应拿不到原始内容，标题和正文为 `null`，`date` 是点击时间，`identifier` 是本次响应生成的 UUID，`data` 取启动参数里除系统键以外的部分。Push Kit 会把 `clickAction.data` 展开在启动参数里，应用自己附加的路由参数也在其中，系统不区分来源。订阅时若最近一次响应还没有投递过，会补发一次。

#### `addNotificationsDroppedListener(listener)`

HarmonyOS 没有面向普通应用的推送丢弃事件，这个监听器注册后不会触发。

#### `useLastNotificationResponse()`

React Hook，返回最近一次通知响应，应用启动后还没有响应时为 `null`。

#### `getLastNotificationResponse()` / `getLastNotificationResponseAsync()` / `clearLastNotificationResponse()` / `clearLastNotificationResponseAsync()`

读取或清除最近一次通知响应。最近响应保存在进程内，清除后重新加载 JS 不会恢复。

#### `Notifications.DEFAULT_ACTION_IDENTIFIER`

常量，点击通知主体时响应里的 `actionIdentifier` 取这个值。

### 推送注册

#### `getDevicePushTokenAsync()`

返回 `Promise<DevicePushToken>`，`type` 为 `'harmony'`，`data` 为 Huawei Push Kit 的设备 token。调用前需要在 AppGallery Connect 开通 Push Kit 并配置签名，未开通或配置不正确时以系统错误码拒绝。失败后可以重试，失败结果不会被缓存。这个调用不请求通知授权。

`'harmony'` 不在官方文档列出的设备 token 类型里，服务端的类型定义需要自行覆盖这个平台。

#### `addPushTokenListener(listener)`

token 变化时触发。订阅时会获取一次 token，应用回到前台或重新订阅时也会重新获取并比较。系统的实时 token 更新事件目前只覆盖穿戴设备，手机上依赖这些时机重新获取。

#### `unregisterForNotificationsAsync()`

注销推送。先停用 token 的自动刷新，再删除 Push Kit token，删除失败时可以重试。注销后回到前台不再刷新 token，重新调用 `getDevicePushTokenAsync()` 会恢复刷新。

#### 服务端发送

远程推送通过华为 Push Kit V3 API 发送。应用在前台时，`payload.notification.foregroundShow` 设为 `false` 消息会进入 JS 的监听器和 handler，设为 `true` 由系统直接展示。应用在后台或未运行时消息由系统投递，不会启动 JS 任务。

> **未实现的内容**
>
> - `getExpoPushTokenAsync()`、`setAutoServerRegistrationEnabledAsync()` 和 Expo Push Service 的注册信息接口：HarmonyOS 上没有 Expo Push Service，统一以 `ERR_NOTIFICATIONS_EXPO_PUSH_SERVICE_UNSUPPORTED` 拒绝，远程推送使用 Huawei Push Kit。

### 后台任务

> **未实现的内容**
>
> - `registerTaskAsync(taskName)`、`unregisterTaskAsync(taskName)`：系统不向普通应用开放收到推送时在后台唤醒 JS 的机制，调用以 `ERR_NOTIFICATIONS_UNSUPPORTED` 拒绝。

### Android 通知渠道与主题

> **未实现的内容**
>
> - `setNotificationChannelAsync()`、`getNotificationChannelAsync()`、`getNotificationChannelsAsync()`、`deleteNotificationChannelAsync()` 和对应的四个渠道组接口：HarmonyOS 用通知分类代替渠道，调用结果与 iOS 一致，查询得到 `null` 或空数组，设置和删除不做任何事。
> - `subscribeToTopicAsync(topic)`、`unsubscribeFromTopicAsync(topic)`：基于 FCM 的主题订阅是 Android 专属，调用直接完成，不会产生订阅。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
