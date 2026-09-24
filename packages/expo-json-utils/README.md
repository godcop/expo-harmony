# @expo-harmony/expo-json-utils

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-json-utils)

为 HarmonyOS 原生 Expo 包提供 JSON 字段读取工具，与官方同版本的 `expo-json-utils` 配套使用。工具按字段类型读取 JSON 对象中的值，区分必填和可空两种情况。

## 安装

```bash
npm install @expo-harmony/expo-json-utils
```

本包适配 Expo SDK 55 的 `expo-json-utils`，最低支持 HarmonyOS 5.0.1（API 13），宿主应用的 `compatibleSdkVersion` 不能低于这个版本。包内没有 React Native JavaScript 接口，JavaScript 侧导入得到 `null`，读取工具从原生 HAR 导入。

原生模块在自己的 `oh-package.json5` 中声明依赖：

```json
{
  "dependencies": {
    "@expo-harmony/expo-json-utils": "55.0.2-harmony.0"
  }
}
```

原生 ArkTS 从 HAR 导入工具：

```ts
import { JSONObject, JSONObjectUtils } from '@expo-harmony/expo-json-utils';

const data = JSON.parse('{"name":"HarmonyOS","enabled":"TRUE"}') as JSONObject;
const name = JSONObjectUtils.requireString(data, 'name');
const enabled = JSONObjectUtils.requireBoolean(data, 'enabled');
const extra = JSONObjectUtils.getNullableObject(data, 'extra');
```

## API 对照表

### Classes

#### `JSONObjectUtils`

按字段类型提供六组读取方法，每组有必填和可空两个版本。必填版本在字段缺失或类型无法转换时抛出 `JSONUtilsError`，可空版本只在字段缺失时返回 `null`，字段存在但类型不对时同样抛出错误。

##### `JSONObjectUtils.hasValue(json, key)`

返回 `boolean`，字段是否存在。字段值为 `null` 时同样返回 `true`。

##### `JSONObjectUtils.require(json, key)`

返回字段值本身。字段缺失时抛出 `JSONUtilsError`。

##### `JSONObjectUtils.getNullable(json, key)`

返回字段值本身，字段缺失时返回 `null`。

##### `JSONObjectUtils.requireString(json, key)`

返回 `string`。字符串原样返回，`null` 转成 `"null"`，布尔值和有限数值转成文本，数组和对象序列化为 JSON 文本，其余类型抛出 `JSONUtilsError`。

##### `JSONObjectUtils.getNullableString(json, key)`

返回 `string | null`，转换规则与 `requireString()` 相同。

##### `JSONObjectUtils.requireNumber(json, key)`

返回 `number`。数值原样返回，包括 `NaN` 和正负无穷。字符串去掉首尾空白后要能解析为十进制数字（可含小数点和指数）、`NaN` 或 `Infinity`，均可带正负号，十进制数字末尾允许 `f`、`F`、`d`、`D`，其余情况抛出 `JSONUtilsError`。

数值都用 `number` 表示，没有整数类型的截断和溢出行为，也不支持十六进制浮点格式的字符串。超出 JavaScript 安全整数范围的值可能丢失精度，需要保留原文时改用字符串。

##### `JSONObjectUtils.getNullableNumber(json, key)`

返回 `number | null`，转换规则与 `requireNumber()` 相同。

##### `JSONObjectUtils.requireBoolean(json, key)`

返回 `boolean`。布尔值原样返回，字符串 `"true"` 和 `"false"` 忽略大小写后转换，其余类型抛出 `JSONUtilsError`。

##### `JSONObjectUtils.getNullableBoolean(json, key)`

返回 `boolean | null`，转换规则与 `requireBoolean()` 相同。

##### `JSONObjectUtils.requireArray(json, key)`

返回 `JSONValue[]`，不复制内容，直接返回原有引用。字段不是数组时抛出 `JSONUtilsError`。

##### `JSONObjectUtils.getNullableArray(json, key)`

返回 `JSONValue[] | null`。

##### `JSONObjectUtils.requireObject(json, key)`

返回 `JSONObject`，不复制内容，直接返回原有引用。字段不是 JSON 对象时抛出 `JSONUtilsError`。

##### `JSONObjectUtils.getNullableObject(json, key)`

返回 `JSONObject | null`。

#### `JSONUtilsError`

读取失败时抛出的错误，继承自 `Error`，`name` 为 `'JSONUtilsError'`。

### Types

#### `JSONValue`

`Object | null | undefined`。

#### `JSONObject`

`Record<string, JSONValue>`。

容器里存放的值应当是 JSON 数据。访问器、自定义 `toJSON`、类实例、稀疏数组和循环引用都不支持，用作字符串序列化时会抛出 `JSONUtilsError`。序列化遵循 ECMAScript 的数字格式、键顺序和字符转义，输出文本可能与 Android 不同，不要依赖它跨平台逐字一致或用于签名。字段显式取 `undefined` 时仍视为存在，`require()` 和 `getNullable()` 原样返回 `undefined`，带类型的读取抛出错误。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors)

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
