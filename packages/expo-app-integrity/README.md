# @expo-harmony/expo-app-integrity

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-app-integrity) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/app-integrity/)

为 HarmonyOS 上的 React Native 应用提供 Expo App Integrity 的原生实现，与官方同版本的 `@expo/app-integrity` 配套使用。支持硬件密钥证明，通过系统通用密钥库（HUKS）生成密钥并获取匿名证明证书链。

## 安装

```bash
npm install @expo-harmony/expo-app-integrity @expo/app-integrity@55.0.13
```

本包适配 Expo SDK 55 的 `@expo/app-integrity`。官方包提供 JavaScript 接口，本包提供 HarmonyOS 的原生模块，两个包需要一起安装，业务代码从官方包导入，写法与 iOS 和 Android 一致。原生模块由 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。

硬件密钥证明使用 HUKS 的匿名证明能力，不需要像 Google Play Integrity 那样配置云端项目，安装后即可调用。

## API 对照表

### Constants

#### `AppIntegrity.isSupported`

类型：`boolean`

固定为 `false`。这个常量表示设备是否支持 Apple App Attest 服务，HarmonyOS 没有这项服务。官方包在 Android 上固定返回 `true`，HarmonyOS 上为 `false`。跨平台代码不要依据它判断能否发起硬件证明，应调用 `isHardwareAttestationSupportedAsync()`。

### Methods

#### `AppIntegrity.isHardwareAttestationSupportedAsync()`

返回 `Promise<boolean>`，设备是否具备硬件密钥证明的系统能力。只做能力查询，不生成密钥，也不访问网络。返回 `true` 只表示系统具备这项能力，一次证明能否成功还取决于网络和系统证明服务的状态。

#### `AppIntegrity.generateHardwareAttestedKeyAsync(keyAlias, challenge)`

返回 `Promise<void>`，在系统通用密钥库中生成一对 ECC P-256 签名密钥，用 `challenge` 向系统申请匿名密钥证明，并保存返回的证书链。私钥保存在系统密钥库中，应用无法读出。

相同别名再次调用会替换已有的密钥和证书链，与官方 Android 行为一致。别名不能为空，模块会自动添加固定前缀，按 UTF-8 编码计算，前缀加别名不能超过 128 字节，否则以 `ERR_APP_INTEGRITY_INVALID_INPUT` 拒绝。`challenge` 原样传给系统，不经过哈希、截断或补齐，长度限制由系统检查。

匿名证明签发的证书不包含设备标识。证明由系统证明服务在线完成，网络不可用或服务拒绝时调用失败，不会退回软件密钥或自行构造的证书。参见[华为匿名密钥证明文档](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/huks-key-anon-attestation-arkts)。

#### `AppIntegrity.getAttestationCertificateChainAsync(keyAlias)`

返回 `Promise<string[]>`，读取指定别名的证明证书链。每项是一段 Base64 编码的 DER 格式 X.509 证书，不含换行，从叶证书到根证书排列。

证书链在生成密钥时一并保存，读取不再联网，应用重启后可以继续读取。密钥或证书链不存在时以 `ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_CERTIFICATE_CHAIN_INVALID` 拒绝，清除应用数据或卸载应用后需要重新生成。

```ts
import * as AppIntegrity from '@expo/app-integrity';

async function attest(challenge: string): Promise<string[]> {
  if (!await AppIntegrity.isHardwareAttestationSupportedAsync()) {
    throw new Error('Hardware attestation is unavailable');
  }

  const alias = 'installation';
  await AppIntegrity.generateHardwareAttestedKeyAsync(alias, challenge);

  return AppIntegrity.getAttestationCertificateChainAsync(alias);
}
```

`challenge` 应由业务服务端生成和保存，验证通过后作废，用于防止重放。返回结构与官方 Android 相同，但信任根和证明扩展属于华为的证明体系，不能交给 Android Key Attestation、Apple App Attest 或 Google Play Integrity 的验证服务，后端需要按华为密钥证明的规则校验证书链、可信根、有效期、Challenge 和应用身份。客户端拿到证书链不等于完整性验证通过。参见[华为密钥证明介绍](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/huks-key-attestation-overview)。

HarmonyOS 有自己的安全检测服务，例如 SafetyDetect 的系统完整性检测，但它们与 Apple App Attest 和 Google Play Integrity 的协议不兼容，本包不以这些服务替代官方接口。

> **未实现的内容**
>
> - `generateKeyAsync()`、`attestKeyAsync(keyId, challenge)`、`generateAssertionAsync(keyId, challenge)`：依赖 Apple App Attest 服务，HarmonyOS 没有这项服务，调用以 `ERR_APP_INTEGRITY_FEATURE_UNSUPPORTED` 拒绝。
> - `prepareIntegrityTokenProviderAsync(cloudProjectNumber)`、`requestIntegrityCheckAsync(requestHash)`：依赖 Google Play Integrity 服务，HarmonyOS 没有这项服务，调用以 `ERR_APP_INTEGRITY_API_NOT_AVAILABLE` 拒绝。

### 错误处理

别名不合法时以 `ERR_APP_INTEGRITY_INVALID_INPUT` 拒绝。硬件证明的错误使用官方的 `ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_*` 错误族，按失败环节区分：

- `ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_NOT_SUPPORTED`：设备不具备硬件密钥证明的系统能力。
- `ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_KEY_GENERATION_FAILED`：生成密钥失败。
- `ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_FAILED`：申请证明失败，例如网络不可用或系统证明服务拒绝。
- `ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_CERTIFICATE_CHAIN_INVALID`：证书链不存在或无法解析。

系统错误码和错误信息附在错误消息里。证明中途失败或应用异常退出后，重新调用 `generateHardwareAttestedKeyAsync()` 即可恢复，不会读到上一次密钥的证书链。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
