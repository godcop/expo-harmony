# @expo-harmony/expo-mail-composer

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-mail-composer) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/mail-composer/)

为 HarmonyOS 上的 React Native 应用提供 Expo MailComposer 的原生实现，与官方同版本的 `expo-mail-composer` 配套使用。支持查询邮件能力，以及打开系统邮件面板，预填收件人、主题、纯文本正文和本地附件。

## 安装

```bash
npm install @expo-harmony/expo-mail-composer expo-mail-composer@55.0.18
```

本包适配 Expo SDK 55 的 `expo-mail-composer`，业务代码继续从官方包导入。原生模块由 Expo Harmony 自动链接。最低支持 HarmonyOS 6.0.1（API 21），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

调用 `isAvailableAsync()` 需要先在 `app.json` 的 `harmony.querySchemes` 中声明 `mailto`，然后重新 prebuild 并构建应用。

```json
{
  "expo": {
    "harmony": {
      "querySchemes": ["mailto"]
    }
  }
}
```

缺少这个声明时 `isAvailableAsync()` 会报错。Bare 工程需要把 `mailto` 写进 `entry/src/main/module.json5` 的 `module.querySchemes` 数组。这项配置只声明要查询的链接类型，不是申请查询全部已安装应用的权限。

## API 对照表

### Methods

#### `MailComposer.isAvailableAsync()`

返回 `Promise<boolean>`，查询设备上有没有应用声明了 `mailto` 链接。没有在 `querySchemes` 中声明 `mailto`，或系统查询出错时，以 `ERR_MAIL_COMPOSER_AVAILABILITY` 拒绝。

结果只反映有没有应用声明了 `mailto`，不检查邮件账户、登录状态或网络。系统选择面板按邮件编辑能力匹配客户端，不看 `mailto` 声明，返回 `true` 不保证面板里一定有客户端可选，返回 `false` 也不代表面板一定打不开。调用 `composeAsync()` 前不需要先做这项查询。

#### `MailComposer.getClients()`

同步返回 `MailClient[]`。系统没有提供枚举邮件客户端的接口，这里始终返回空数组。空数组不代表邮件功能不可用，选择客户端交给 `composeAsync()` 打开的面板完成。

#### `MailComposer.composeAsync(options)`

返回 `Promise<MailComposerResult>`，打开系统邮件选择面板，用户选定客户端后进入编辑，预填内容随面板带入。必须在应用前台调用，否则以 `ERR_MAIL_COMPOSER_BACKGROUND` 拒绝。前一个请求还没结束时再次调用，以 `ERR_MAIL_COMPOSER_IN_PROGRESS` 拒绝。

面板正常返回、客户端启动成功或用户在面板取消时，Promise 以 `{ status: 'undetermined' }` 结束，取消不会报错。回调在客户端启动时就会触发，用户可能还没写完邮件。系统不报告邮件是发送、保存还是放弃，应用无从区分。官方 Android 实现固定返回 `sent`，本包不把客户端启动成功当作发送成功。

启动客户端失败时以 `ERR_MAIL_COMPOSER_COMPOSE` 拒绝。设备上没有支持的客户端时，系统会给出提示，请求可能一直等待回调。应用重载或销毁时，未完成的请求以 `ERR_MAIL_COMPOSER_DESTROYED` 拒绝。

### Types

#### `MailComposerOptions`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `recipients` | `string[]` | 收件人地址，支持多个。 |
| `ccRecipients` | `string[]` | 抄送地址。 |
| `bccRecipients` | `string[]` | 密送地址。 |
| `subject` | `string` | 邮件主题。 |
| `body` | `string` | 纯文本正文，支持 Unicode 和换行。 |
| `isHtml` | `boolean` | 可省略或设为 `false`，设为 `true` 时以 `ERR_MAIL_COMPOSER_HTML_UNSUPPORTED` 拒绝。 |
| `attachments` | `string[]` | 应用可读的本地文件 URI 或绝对路径，支持多个附件。 |

所有字段都可以省略，地址和附件也可以传空数组。正文按纯文本原样传递，传 HTML 片段不会得到格式化效果，需要排版时应改用纯文本写法。

附件在面板打开前逐一校验，目录、远程 URL 和应用读不到的文件以 `ERR_MAIL_COMPOSER_ATTACHMENT` 拒绝。从系统选择器拿到的文件建议先复制到应用自己的目录再传入。系统会向用户选定的客户端授予附件的临时读权限。客户端可能在面板关闭后继续读取附件，调用方要保持文件存在，模块不会删除传入的文件。

#### `MailComposerResult`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `status` | `MailComposerStatus` | HarmonyOS 上始终为 `undetermined`，不能据此确认邮件发送状态。 |

> **未实现的内容**
>
> - `MailClient`：系统没有提供枚举邮件客户端的接口，`getClients()` 始终返回空数组，这个类型在 HarmonyOS 上没有取值来源。

### Enums

#### `MailComposerStatus`

HarmonyOS 上只会返回 `undetermined`，表示选择面板返回或目标客户端启动完成，邮件本身的处理结果未知。

> **未实现的内容**
>
> - `CANCELLED`、`SAVED`、`SENT`：系统面板不报告邮件的发送、保存或取消结果，这三个值在 HarmonyOS 上不会出现。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
