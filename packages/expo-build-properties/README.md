# @expo-harmony/expo-build-properties

配置 HarmonyOS 应用的 SDK 版本、CPU 架构、原生编译器、SO 打包和 release 构建选项。配置通过 Prebuild 生效。

## 使用

在已接入 Expo Harmony 的应用中安装：

```sh
npm install @expo-harmony/expo-build-properties
```

在 `app.json` 的 `plugins` 中添加配置：

```json
{
  "expo": {
    "name": "Example",
    "slug": "example",
    "platforms": ["harmony"],
    "harmony": { "bundleName": "com.example.app" },
    "plugins": [
      "@expo-harmony/prebuild-config",
      [
        "@expo-harmony/expo-build-properties",
        {
          "harmony": {
            "compatibleSdkVersion": 21,
            "targetSdkVersion": 24,
            "abiFilters": ["arm64-v8a", "x86_64"]
          }
        }
      ]
    ]
  }
}
```

生成或更新原生工程：

```sh
npx expo-harmony prebuild
```

修改配置后，需要重新执行 Prebuild 并构建应用。

## 参数

参数填写在插件选项的 `harmony` 对象中。

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `compatibleSdkVersion` | 最低兼容 SDK 版本，接受 API 数字或 SDK 版本字符串 | `20` |
| `targetSdkVersion` | 目标 SDK 版本，接受 API 数字或 SDK 版本字符串 | `24` |
| `abiFilters` | CPU 架构数组，支持 `arm64-v8a` 和 `x86_64`，不能为空 | `["arm64-v8a", "x86_64"]` |
| `nativeCompiler` | 原生编译器，可选 `BiSheng` 或 `Original` | `"BiSheng"` |
| `nativeLib.filter` | SO 筛选与冲突处理规则，见下文 | 不设置 |
| `compressNativeLibs` | 是否压缩包内的 SO，类型为 `boolean` | 平台默认值 `false` |
| `extractNativeLibs` | 安装时是否解压 SO，类型为 `boolean` | 平台默认值 `true` |
| `release.debugSymbol` | release 构建的 SO 符号处理，见下文 | 由 Hvigor 决定 |
| `release.obfuscation` | release 构建的 ArkTS 混淆，见下文 | 不开启 |

### SDK 版本

`compatibleSdkVersion` 不得低于 API 20，也不能高于 `targetSdkVersion`。最低兼容版本还需满足应用所用原生依赖的要求，插件不会自动提高该值。

API 20、21、23、24 可用数字表示，也可使用完整的 SDK 版本字符串。例如，`24` 与 `"6.1.1(24)"` 表示同一版本。API 26 之前的其他版本需填写带 API 级别的完整 SDK 版本字符串。

API 26 起使用 `"26.0.0"` 这样的版本字符串，数字 `26` 等同于 `"26.0.0"`。指定次版本时填写完整版本，例如 `"26.1.0"`。

所选 SDK 必须由本地工具链支持。编译 SDK 使用 DevEco 配套 SDK 的默认值，本插件不提供 `compileSdkVersion` 参数。

### SO 打包与筛选

`compressNativeLibs` 和 `extractNativeLibs` 同时为 `false` 时，平台才允许安装时免解压 SO。

`nativeLib.filter` 支持以下字段：

| 字段 | 类型 |
| --- | --- |
| `excludes` | `string[]` |
| `pickFirsts` | `string[]` |
| `pickLasts` | `string[]` |
| `enableOverride` | `boolean` |

筛选规则遵循 [Hvigor 的 SO 配置](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-hvigor-cpp)，匹配模式可写为 `"**/libexample.so"`。同一模式不能同时出现在 `pickFirsts` 和 `pickLasts` 中。

### SO 符号

`release.debugSymbol` 用于设置 release 构建的符号剥离。以下示例剥离 SO 符号，但保留 `libexample.so` 的符号。示例内容填写在插件选项中：

```json
{
  "harmony": {
    "release": {
      "debugSymbol": {
        "strip": true,
        "exclude": ["**/libexample.so"]
      }
    }
  }
}
```

`strip` 必填，`exclude` 可省略。`strip: true` 时，`exclude` 中的匹配项保留符号；`strip: false` 时，仅剥离 `exclude` 中匹配项的符号。

### ArkTS 混淆

`release.obfuscation` 控制 release 构建的 ArkTS 混淆，不影响 JavaScript 压缩。在插件选项中添加：

```json
{
  "harmony": {
    "release": {
      "obfuscation": {
        "enable": true,
        "files": ["./config/harmony-obfuscation-rules.txt"]
      }
    }
  }
}
```

`enable` 必填。设为 `true` 时，`files` 至少包含一个已存在且可读的规则文件；设为 `false` 时关闭混淆。

规则文件路径相对应用根目录，使用 `/` 分隔，不能包含 `..`。文件必须位于应用目录内、`harmony/` 目录之外，符号链接指向的文件也需满足这一要求。

规则内容参见 [ArkTS 混淆配置](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-build-obfuscation)。规则中的 keep、namecache 等相对路径以规则文件所在目录为基准。

## 从旧配置迁移

`expo.harmony` 下的 `targetApiVersion`、`targetSdkVersion`、`compatibleSdkVersion` 和 `abiFilters` 仍可使用。迁移时，将这些参数移到本插件的 `harmony` 选项中，并将 `targetApiVersion` 改为 `targetSdkVersion`。同一参数在两处配置且值不一致时会报错。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
