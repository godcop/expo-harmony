# @expo-harmony/expo-manifests

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-manifests)

为 HarmonyOS 提供 Expo Manifests 的原生模型，在原生代码里读取和校验更新清单。

## 安装

```bash
npm install @expo-harmony/expo-manifests
```

原生 ArkTS/TypeScript 代码从 HAR 导入：

```ts
import { Manifest } from '@expo-harmony/expo-manifests';

const manifest = Manifest.fromManifestJson(value);
const id = manifest.getID();
```

`fromManifestJson` 按有无 `metadata` 字段区分远程更新清单（`ExpoUpdatesManifest`）和内置清单（`EmbeddedManifest`），带 `releaseId` 的旧格式清单会被拒绝。字段缺失或类型不对时抛出 `ExpoManifestError`。读平台配置时先取 `harmony` 字段，没有再回退到顶层配置。内置清单的 `commitTime` 必须是 JavaScript 安全整数范围内的数字。

本包没有 JavaScript 原生桥接 API。demo 的 Manifest 页面通过应用本地模块调用这里的原生模型。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
