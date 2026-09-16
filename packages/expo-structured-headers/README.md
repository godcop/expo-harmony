# @expo-harmony/expo-structured-headers

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-structured-headers)

为 HarmonyOS 上的 React Native 应用提供 Expo Structured Headers 的原生实现，与官方同版本的 `expo-structured-headers` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-structured-headers
```

本包适配 Expo SDK 55 的 `expo-structured-headers`，最低支持 HarmonyOS 5.0.1（API 13）。包内没有 React Native JavaScript 接口，只在原生代码中使用，不需要配置插件。解析和序列化在应用进程内完成，不同系统版本上行为一致。

原生模块在自己的 `oh-package.json5` 中声明依赖：

```json
{
  "dependencies": {
    "@expo-harmony/expo-structured-headers": "55.0.2-harmony.0"
  }
}
```

原生 ArkTS 从 HAR 导入解析和序列化函数：

```ts
import { parseDictionary, serializeDictionary } from '@expo-harmony/expo-structured-headers';

const fields = parseDictionary('keyid="main", enabled');
const header = serializeDictionary(fields);
```

实现改写自 Evert Pot 的 MIT 许可库 `structured-headers`，原许可文件随源码保留。

## API 对照表

### Functions

#### `parseDictionary(input)`

返回 `Dictionary`。没有取值的成员解析为 `[true, 参数]`。

`parseDictionary()`、`parseList()`、`parseItem()` 的输入规则相同：接受单个字符串，也接受字符串数组表示同一个响应头的多行，多行按逗号拼接后解析，字符串字面量不允许跨行。解析失败抛出 `ParseError`，`position` 为出错处的偏移量。

#### `parseList(input)`

返回 `List`，成员为单项或内嵌列表。输入规则与 `parseDictionary()` 相同。

#### `parseItem(input)`

返回一个 `Item`，输入必须是完整的单项字段值。输入规则与 `parseDictionary()` 相同。

#### 其余解析函数

以下函数按给定结构解析一个完整的字段值，只接受单个字符串，解析后不允许有剩余字符，失败时抛出 `ParseError`：

- `parseBareItem(input)`：返回 `BareItem`，按首字符识别类型。
- `parseParameters(input)`：返回 `Parameters`。
- `parseKey(input)`：返回 `string`。
- `parseItemOrInnerList(input)`：返回 `Item | InnerList`，按首字符是否为 `(` 区分。
- `parseInnerList(input)`：返回 `InnerList`。
- `parseString(input)`、`parseToken(input)`、`parseByteSequence(input)`、`parseBoolean(input)`、`parseIntegerOrDecimal(input)`：返回带参数的 `Item`，取值按函数名对应的类型解析。

#### `serializeDictionary(input)`

返回 `string`。输出顺序与 `Map` 的插入顺序一致，布尔成员输出为 `key` 而不是 `key=?1`。取值和参数的序列化规则与 `serializeItem()` 相同。

#### `serializeList(input)`

返回 `string`，成员之间用 `, ` 分隔。序列化规则与 `serializeItem()` 相同。

#### `serializeItem(input)`

返回 `string`，输出为取值加参数。整数范围 ±999,999,999,999,999，字符串只允许 ASCII，类型不支持时抛出 `SerializeError`。

### Classes

#### `Parser`

解析器的类形式，方法与顶层解析函数同名同义，可以直接实例化使用。

#### `Decimal`

以千分整数表示 RFC 8941 小数，固定三位小数精度。`Decimal.valueOf(1.0)` 从普通数值构造，四舍五入到三位小数；`Decimal.fromPermille(1000)` 直接按千分值构造。`toNumber()` 返回普通数值。用作取值序列化时按原精度输出，`1.0` 不会写成 `1`。超出 ±999,999,999,999.999 范围抛出 `TypeError`。

#### `ByteSequence`

字节序列。构造时接受 Base64 字符串或 `Uint8Array`，内容会复制一份。`toBase64()` 输出标准 Base64，`toBytes()` 返回字节副本。Base64 不合法时抛出 `TypeError`。

#### `Token`

Token 类型的包装。首字符为字母或 `*`，其余为 Token 允许的字符，不合法时抛出 `TypeError`。手工构造取值时用它区分 Token 和字符串，序列化时 Token 不加引号。

#### `ParseError`

解析失败时抛出的错误，继承自 `Error`，`name` 为 `'ParseError'`，`position` 为出错处的偏移量，多行输入按拼接后的完整字符串计算。

#### `SerializeError`

序列化失败时抛出的错误，继承自 `Error`，`name` 为 `'SerializeError'`，`cause` 保留导致失败的原始错误。

### Types

#### `Dictionary`

`Map<string, Item | InnerList>`，保留插入顺序。

#### `List`

`(Item | InnerList)[]`。

#### `Item`

`[BareItem, Parameters]`，取值和参数组成的二元组。

#### `InnerList`

`[Item[], Parameters]`，括号内的一组项加上整个内嵌列表的参数。

#### `Parameters`

`Map<string, BareItem>`，值为 `true` 表示参数只有键名，没有取值。

#### `BareItem`

`number | Decimal | string | Token | ByteSequence | boolean`，对应 RFC 8941 的整数、小数、字符串、Token、字节序列和布尔。普通 `number` 传小数时按三位小数舍入，需要保留 `1.0` 这类形式时用 `Decimal`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
