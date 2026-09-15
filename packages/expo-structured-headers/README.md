# @expo-harmony/expo-structured-headers

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-structured-headers)

为 HarmonyOS 原生模块提供 Structured Fields（RFC 8941）响应头的解析和序列化，支持字典、列表、单项、参数、Token、小数和 Base64 字节序列。

## 安装

```bash
npm install @expo-harmony/expo-structured-headers
```

原生代码从 HAR 导入：

```ts
import { parseDictionary, serializeDictionary } from '@expo-harmony/expo-structured-headers';

const fields = parseDictionary('keyid="main", enabled');
const header = serializeDictionary(fields);
```

解析失败抛出 `ParseError`，`position` 是出错处的偏移量。解析函数接受单个字符串，也接受字符串数组，数组对应同一个响应头的多行，字符串字面量不允许跨行。序列化失败抛出 `SerializeError`。小数用 `Decimal` 类表示，`1.0` 序列化后还是 `1.0`，不会被写成整数。

本包没有 React Native JavaScript API。实现改写自 Evert Pot 的 MIT 许可库 `structured-headers`，原许可文件随源码保留。demo 提供原生解析与序列化页面。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
