# @expo-harmony/expo-manifests

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-manifests)

为 HarmonyOS 提供 Expo Manifests 的原生模型，在原生代码里读取和校验更新清单。

## 安装

```bash
npm install @expo-harmony/expo-manifests
```

本包适配 Expo SDK 55 的 `expo-manifests`。最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。原生 HAR 没有其他依赖，不依赖 expo-modules-core 和 RNOH。原生实现只用 ECMAScript 内置能力，不调用系统 API，在支持的系统版本上行为一致。

原生 ArkTS/TypeScript 代码从 HAR 导入：

```ts
import { Manifest } from '@expo-harmony/expo-manifests';

const manifest = Manifest.fromManifestJson(value);
const id = manifest.getID();
```

输入应是 `JSON.parse` 得到的清单对象。`fromManifestJson` 按有无 `metadata` 字段区分远程更新清单（`ExpoUpdatesManifest`）和内置清单（`EmbeddedManifest`），带 `releaseId` 的旧格式清单会被拒绝。字段在读取时校验，必填字段缺失或类型不对抛出 `ExpoManifestError`（`code: ERR_MANIFEST_INVALID`），可选字段缺失返回 `null` 或默认值。对象和数组访问器（如 `getMetadata()`、`getRawJson()`）返回底层引用，调用方应把清单当作只读。`jsEngine` 未配置时按清单 `sdkVersion` 的主版本推断，1–47 之间返回 `jsc`，其余返回 `hermes`。

本包没有 JavaScript 原生桥接 API。npm 入口只提供上游的 TypeScript 类型，如 `ExpoUpdatesManifest`、`EmbeddedManifest`、`ManifestExtra` 和 `ExpoClientConfig`，包括上游已弃用的 `NewManifest` / `BareManifest` 类型别名。原生 HAR 中的同名类不能从 JavaScript 入口调用。demo 的 Manifest 页面通过应用本地模块调用这里的原生模型。

```ts
import type { ExpoUpdatesManifest } from '@expo-harmony/expo-manifests';
```

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
