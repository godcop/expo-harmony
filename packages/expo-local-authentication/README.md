# @expo-harmony/expo-local-authentication

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-local-authentication) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/local-authentication/)

为 HarmonyOS 上的 React Native 应用提供 Expo LocalAuthentication 的原生实现，与官方同版本的 `expo-local-authentication` 配套使用。通过系统 User Authentication Kit 查询设备支持的认证方式和录入情况，并唤起系统认证界面完成指纹、人脸或锁屏密码验证。

## 安装

```bash
npm install @expo-harmony/expo-local-authentication expo-local-authentication@55.0.18
```

本包适配 Expo SDK 55 的 `expo-local-authentication`，安装时与官方包搭配使用。JavaScript 接口和类型定义都来自官方包，本包只提供 HarmonyOS 侧的原生实现，业务代码照常从 `expo-local-authentication` 导入。

```ts
import * as LocalAuthentication from 'expo-local-authentication';

const result = await LocalAuthentication.authenticateAsync({
  promptMessage: '验证身份以继续',
});
```

原生模块由 Expo Harmony 自动链接。官方文档中的 `faceIDPermission` 配置项只作用于 iOS。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

模块声明了 `ohos.permission.ACCESS_BIOMETRIC`，这是系统授权的普通权限，应用安装后即生效，不会弹出授权框。

## API 对照表

### Methods

#### `LocalAuthentication.hasHardwareAsync()`

返回 `Promise<boolean>`，设备是否支持指纹或人脸认证。查询使用系统最低的信任等级，硬件存在但凭据未录入或达不到认证等级时都返回 `true`，凭据是否可用需要用 `isEnrolledAsync()` 或 `getEnrolledLevelAsync()` 判断。

#### `LocalAuthentication.supportedAuthenticationTypesAsync()`

返回 `Promise<AuthenticationType[]>`，设备支持的生物认证方式，指纹返回 `FINGERPRINT`（1），人脸返回 `FACIAL_RECOGNITION`（2），都不支持时返回空数组。HarmonyOS 不提供虹膜认证。

#### `LocalAuthentication.isEnrolledAsync()`

返回 `Promise<boolean>`，是否录入了可用的指纹或人脸凭据。按 `weak` 等级判断，凭据被系统临时锁定时仍返回 `true`，锁屏密码不算在内。

#### `LocalAuthentication.getEnrolledLevelAsync()`

返回 `Promise<SecurityLevel>`，设备上已录入认证方式的最高等级。有达到 ATL3 的指纹或人脸时返回 `BIOMETRIC_STRONG`，只有 ATL2 时返回 `BIOMETRIC_WEAK`，没有生物凭据但配置了锁屏密码时返回 `SECRET`，都没有时返回 `NONE`。锁屏密码已过期时仍返回 `SECRET`，生物凭据被临时锁定不影响等级。

#### `LocalAuthentication.authenticateAsync(options)`

返回 `Promise<LocalAuthenticationResult>`，唤起系统认证界面。通过验证返回 `{ success: true }`，未通过或被取消返回 `{ success: false, error }`。需要在应用处于前台时调用，否则返回 `invalid_context`。

已有认证未完成时再次调用，新请求立即返回 `{ success: false, error: 'app_cancel' }`，原来的认证不受影响，认证界面保持不变。需要更换选项时，先调用 `cancelAuthenticate()` 结束当前认证，再重新发起。

凭据校验、失败重试和临时锁定由系统完成。常见结果有 `authentication_failed`、`user_cancel`、`timeout`、`lockout`、`not_enrolled` 和 `not_available`，锁屏密码已过期时同样返回 `not_available`，认证服务繁忙时返回 `unable_to_process`。没有对应取值的结果返回 `unknown`，并在 `warning` 字段里保留系统结果码。HarmonyOS 的取消事件不区分用户和系统，统一映射为 `user_cancel`。

`promptMessage` 为空或超过长度限制时抛出 `ERR_LOCAL_AUTHENTICATION_INVALID_ARGUMENT`，`cancelLabel` 用作导航按钮文字且超过长度限制时同样抛出。查询认证能力遇到系统错误时抛出 `ERR_LOCAL_AUTHENTICATION_UNAVAILABLE`，这时不会把错误报告成无硬件或未录入。

发起认证的界面被销毁时，未完成的认证自动取消，返回 `app_cancel`。

#### `LocalAuthentication.cancelAuthenticate()`

返回 `Promise<void>`，取消当前的认证，被取消的请求返回 `user_cancel`。没有进行中的认证时不做任何事，可以重复调用。该方法是官方文档标注的 Android 专属接口，在 HarmonyOS 上可用。

### Types

#### `BiometricsSecurityLevel`

`'weak'` 和 `'strong'` 两个字符串字面量，用作 `biometricsSecurityLevel` 参数的取值。官方文档标注为 Android 专属类型，在 HarmonyOS 上可用。HarmonyOS 按活体检测强度划分生物认证的信任等级，`weak` 对应 ATL2 的常规活体检测，`strong` 对应 ATL3 的强活体检测。

#### `LocalAuthenticationError`

认证失败时 `error` 字段的取值。HarmonyOS 上会出现 `authentication_failed`、`user_cancel`、`app_cancel`、`timeout`、`lockout`、`not_enrolled`、`not_available`、`unable_to_process`、`invalid_context` 和 `unknown`，各取值的含义见官方文档。

> **未实现的内容**
>
> - `no_space`：Android 专属的存储空间不足场景，HarmonyOS 没有对应结果。
> - `system_cancel`：HarmonyOS 的取消事件不区分用户和系统，统一为 `user_cancel`。
> - `user_fallback`：切换到锁屏密码在系统认证界面内完成，不产生单独的回退事件。
> - `passcode_not_set`：iOS 专属语义，HarmonyOS 上未录入密码时并入 `not_enrolled`。

#### `LocalAuthenticationOptions`

`authenticateAsync()` 的选项。

| 属性 | 说明 |
| --- | --- |
| `promptMessage` | 系统认证界面的标题，默认 `Authenticate`，长度为 1–500 个 UTF-16 代码单元。 |
| `disableDeviceFallback` | 默认 `false`，允许使用已配置的锁屏密码。设为 `true` 时只进行生物认证。没有录入生物凭据而允许回退时，直接进行密码验证。 |
| `biometricsSecurityLevel` | 默认 `weak`，对应 ATL2。`strong` 对应 ATL3。要求 `strong` 而凭据不足时不会降级为弱生物认证，允许密码回退时仍可使用锁屏密码。 |
| `cancelLabel` | 认证方式只有指纹或人脸中的一种时，作为认证界面导航按钮的文字，最多 60 个 UTF-16 代码单元，点击后返回 `user_cancel`。认证方式包含密码或多种生物方式时使用系统默认按钮，系统自带的关闭按钮和密码切换按钮不受这个选项影响。 |

> **未实现的内容**
>
> - `promptSubtitle`、`promptDescription`：系统认证界面没有对应的展示位置，忽略。
> - `requireConfirmation`：验证后是否需要用户确认由系统决定，忽略。
> - `fallbackLabel`：iOS 专属，忽略。禁用密码回退请使用 `disableDeviceFallback`。

#### `LocalAuthenticationResult`

成功时为 `{ success: true }`。失败时为 `{ success: false, error }`，`error` 是 `LocalAuthenticationError` 的取值。`error` 为 `unknown` 时附带 `warning` 字段，内容包含系统的结果码。

### Enums

#### `AuthenticationType`

| 值 | 说明 |
| --- | --- |
| `FINGERPRINT`（1） | 指纹。 |
| `FACIAL_RECOGNITION`（2） | 人脸。 |

> **未实现的内容**
>
> - `IRIS`（3）：HarmonyOS 不提供虹膜认证，`supportedAuthenticationTypesAsync()` 不会返回它。

#### `SecurityLevel`

`getEnrolledLevelAsync()` 的返回值。

| 值 | 说明 |
| --- | --- |
| `NONE`（0） | 没有可用的认证方式。 |
| `SECRET`（1） | 已配置锁屏密码。 |
| `BIOMETRIC_WEAK`（2） | 录入了 ATL2 等级的指纹或人脸。 |
| `BIOMETRIC_STRONG`（3） | 录入了 ATL3 等级的指纹或人脸。 |

已配置但已过期的锁屏密码仍返回 `SECRET`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
