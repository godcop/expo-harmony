# @expo-harmony/expo-sms

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-sms) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/sms/)

为 HarmonyOS 上的 React Native 应用提供 Expo SMS 的原生实现，与官方同版本的 `expo-sms` 配套使用。支持查询短信能力，以及打开系统短信编辑页并预填收件人和正文。

## 安装

```bash
npm install @expo-harmony/expo-sms expo-sms@55.0.18
```

本包适配 Expo SDK 55 的 `expo-sms`，业务代码继续从官方包导入。原生模块由 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

## API 对照表

### Methods

#### `SMS.isAvailableAsync()`

返回 `Promise<boolean>`，设备是否具备短信收发能力。没有蜂窝通信硬件的设备返回 `false`。只反映设备能力，不检查 SIM 卡是否插入，也不检查运营商网络，返回 `true` 不代表短信一定能发出。

#### `SMS.sendSMSAsync(addresses, message, options?)`

返回 `Promise<SMSResponse>`，打开系统信息应用的短信编辑页，预填收件人和正文，由用户决定是否发送。`addresses` 接受单个号码字符串或字符串数组，空数组表示不预填收件人，号码里的前导零和国际区号不受影响。

设备不具备短信能力时以 `ERR_SMS_UNAVAILABLE` 拒绝。调用时应用必须处于前台，否则以 `ERR_SMS_BACKGROUND` 拒绝。同一时间只允许一个未完成的请求，前一个 Promise 结束前再次调用会以 `ERR_SMS_PENDING` 拒绝。打开编辑页失败时以 `ERR_SMS_SENDING` 拒绝，例如设备上没有系统信息应用。应用重载或销毁时，未完成的请求以 `ERR_SMS_DESTROYED` 拒绝。

编辑页打开后应用退到后台，用户处理完回到前台时，Promise 以 `{ result: 'unknown' }` 结束，与 Android 一致，应用无法区分用户是发送还是取消。多窗口等应用没有经历后台和前台切换的场景下，请求会一直等待。

### Types

#### `SMSResponse`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `result` | `'unknown' \| 'sent' \| 'cancelled'` | HarmonyOS 上恒为 `'unknown'`，不代表短信发送成功。 |

#### `SMSOptions`

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `attachments` | `SMSAttachment \| SMSAttachment[]` | 可省略或传空数组，传入非空附件会以 `ERR_SMS_ATTACHMENTS_UNSUPPORTED` 拒绝。 |

> **未实现的内容**
>
> - `SMSAttachment`：系统不支持预填附件，用户仍可在短信编辑页内自行添加。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
