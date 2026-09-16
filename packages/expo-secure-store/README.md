# @expo-harmony/expo-secure-store

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-secure-store) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/securestore/)

为 HarmonyOS 上的 React Native 应用提供 Expo SecureStore 的原生实现，与官方同版本的 `expo-secure-store` 配套使用。数据使用系统 Asset Store 加密保存，支持同步和异步读写。

## 安装

```bash
npm install @expo-harmony/expo-secure-store expo-secure-store@55.0.14
```

本包适配 Expo SDK 55 的 `expo-secure-store`，原生模块通过 Expo Harmony 自动链接，不需要配置插件。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

HAR 自带 `ohos.permission.ACCESS_BIOMETRIC` 声明，使用 `requireAuthentication` 功能时才需要。不需要生物认证的应用也可以保留这条声明，系统不会因此弹窗。

业务代码从官方包导入：

```ts
import * as SecureStore from 'expo-secure-store';

await SecureStore.setItemAsync('token', 'example');
const token = await SecureStore.getItemAsync('token');
await SecureStore.deleteItemAsync('token');
```

## API 对照表

### Constants

以下常量用于 `keychainAccessible`，映射到系统的三种访问策略：开机即可访问、首次解锁后可访问、解锁后可访问。

#### `SecureStore.ALWAYS`

#### `SecureStore.ALWAYS_THIS_DEVICE_ONLY`

映射到开机即可访问。

#### `SecureStore.AFTER_FIRST_UNLOCK`

#### `SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`

映射到首次解锁后可访问。

#### `SecureStore.WHEN_UNLOCKED`

#### `SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY`

映射到解锁后可访问。

#### `SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`

映射到解锁后可访问，并要求设备设置了锁屏密码。

带 `THIS_DEVICE_ONLY` 的常量与不带该后缀的常量行为相同。HarmonyOS 的记录都不参与备份和迁移，卸载应用后由系统删除。

### Methods

#### `SecureStore.setItemAsync(key, value, options)`

返回 `Promise<void>`，写入键值对。`key` 只能包含字母、数字、`.`、`-` 和 `_`，`value` 必须是字符串。

每个值最多 1023 个 UTF-8 字节，超限写入抛出 `ERR_SECURE_STORE_VALUE_TOO_LARGE` 并保留原值。空字符串可以正常保存。

`options.requireAuthentication` 打开时使用强指纹或人脸认证，不回退到锁屏密码。首次创建不弹出认证框，用相同的认证模式更新已有记录时才需要验证，`authenticationPrompt` 作为对话框中的提示文本。系统凭据摘要随记录一起保存，生物凭据变化后读取返回 `null` 并删除该记录。设备不支持人脸或指纹认证、或者没有录入凭据时，`requireAuthentication` 的操作抛出 `ERR_SECURE_STORE_AUTH_UNAVAILABLE`；认证被取消或未通过时，操作以 `ERR_SECURE_STORE_AUTH_FAILED` 拒绝。

同一键上的异步操作按顺序执行。某个键还有未完成的异步操作时对该键发起同步操作，抛出 `ERR_SECURE_STORE_BUSY`，应先等待异步操作结束。

#### `SecureStore.getItemAsync(key, options)`

返回 `Promise<string | null>`，读取键值对。键不存在时返回 `null`。

#### `SecureStore.deleteItemAsync(key, options)`

返回 `Promise<void>`，删除键值对。

#### `SecureStore.setItem(key, value, options)`

同步写入，返回 `void`。同步方法会阻塞 JavaScript 线程。

同步更新使用 `requireAuthentication` 的记录时抛出 `ERR_SECURE_STORE_SYNC_AUTH_UNSUPPORTED`，这种记录请改用异步方法。记录保存的凭据摘要已经和当前生物凭据不匹配时例外，同步写入会按新的配置覆盖重建。

#### `SecureStore.getItem(key, options)`

同步读取，返回 `string | null`。记录使用 `requireAuthentication` 时同样抛出 `ERR_SECURE_STORE_SYNC_AUTH_UNSUPPORTED`。

#### `SecureStore.canUseBiometricAuthentication()`

返回 `boolean`，设备是否支持生物认证。查询失败时返回 `false`。

#### `SecureStore.isAvailableAsync()`

返回 `Promise<boolean>`，恒为 `true`。

### Types

#### `KeychainAccessibilityConstant`

类型：`number`。见 Constants。

#### `SecureStoreOptions`

| 属性                    | 类型                            | 说明                                                                           |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `keychainService`       | `string`                        | 服务名，默认 `'app'`。不同服务中的同名键相互独立，读写和删除时需使用相同的服务 |
| `requireAuthentication` | `boolean`                       | 是否要求用户认证，默认 `false`。见 `setItemAsync()` 的说明                     |
| `authenticationPrompt`  | `string`                        | 认证对话框中的提示文本，默认 `'Authenticate to access secure data'`，最长 500 个字符，超限抛出 `ERR_SECURE_STORE_INVALID_ARGUMENT`               |
| `keychainAccessible`    | `KeychainAccessibilityConstant` | 记录的访问策略，默认 `WHEN_UNLOCKED`                                           |

`keychainAccessible` 只在创建记录时生效。用普通写入覆盖已有记录时保留原有的访问策略，要修改策略需要先删除再重建。

不同服务中的同名键互不影响，键名长度不受系统别名长度上限约束。

> **未实现的内容**
>
> - `SecureStoreOptions.accessGroup`：iOS 专属选项，HarmonyOS 上显式传入会抛出 `ERR_SECURE_STORE_UNSUPPORTED_OPTION`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors)

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
