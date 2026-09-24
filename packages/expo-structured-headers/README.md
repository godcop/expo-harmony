# @expo-harmony/expo-structured-headers

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-structured-headers)

为 HarmonyOS 上的 React Native 应用提供 Expo Structured Headers 的原生实现，与官方同版本的 `expo-structured-headers` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-structured-headers
```

本包适配 Expo SDK 55 的 `expo-structured-headers@55.0.2`，最低支持 HarmonyOS 5.0.1（API 13）。包内没有 React Native JavaScript 接口，只在原生代码中使用。解析和序列化在应用进程内完成，不同系统版本上行为一致。

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

实现改写自 Evert Pot 的 MIT 许可库 `structured-headers`，原许可文件随源码保留。在 ArkTS 中标注参数类型时，用 `import { Parameters as HeaderParameters }` 导入，避免和 TypeScript 同名的工具类型混淆。

## API 对照表

### Functions

#### `parseDictionary(input)`

返回 `Dictionary`。没有取值的成员解析为 `[true, 参数]`。

`parseDictionary()`、`parseList()`、`parseItem()` 的输入规则相同：接受单个字符串，也接受非空字符串数组表示同一个响应头的多行，多行按逗号拼接后解析，字符串字面量不允许跨行。完整字段允许首尾空格，列表和字典的成员之间允许逗号及可选的空格、制表符。输入必须是 ASCII，解析失败抛出 `ParseError`，`position` 为出错处的偏移量。`parseDictionary('')` 和 `parseList('')` 返回空容器，`parseItem('')` 和空的多行数组报错。字典和参数出现重复键时，键的位置保留第一次插入的，取值以最后一次出现为准。

#### `parseList(input)`

返回 `List`，成员为单项或内嵌列表。输入规则与 `parseDictionary()` 相同。

#### `parseItem(input)`

返回一个 `Item`，输入必须是完整的单项字段值。输入规则与 `parseDictionary()` 相同。

#### 其余解析函数

以下函数按给定结构解析一个完整的字段值，只接受单个字符串，不忽略首尾空格，解析后不允许有剩余字符，失败时抛出 `ParseError`：

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

解析器的类形式。`parseDictionary()`、`parseList()`、`parseItem()` 解析完整字段。其余方法在当前游标处解析一部分并推进游标，不自动验证输入结束。`parseString()`、`parseToken()`、`parseByteSequence()`、`parseBoolean()`、`parseIntegerOrDecimal()` 返回裸值，不读取取值后的参数，例如实例方法 `parseToken()` 直接返回 `Token`。结构方法 `parseInnerList()` 和 `parseItemOrInnerList()` 会读取参数。需要完整输入校验时使用顶层函数，或在完成分步解析后调用 `checkTrail()`。

#### `Decimal`

以千分整数表示 RFC 8941 小数，固定三位小数精度。`Decimal.valueOf(1.0)` 从普通数值构造，按 RFC 8941 就近舍入到三位小数，恰好居中时舍入到偶数。`Decimal.fromPermille(1000)` 直接按千分值构造。`toNumber()` 返回普通数值。用作取值序列化时保留小数类型，`1.0` 不会写成 `1`，小数点后的前导零也会保留（如 `0.001`）。超出 ±999,999,999,999.999 范围抛出 `TypeError`。

#### `ByteSequence`

字节序列。构造时接受 Base64 字符串或 `Uint8Array`，内容会复制一份。`toBase64()` 输出标准 Base64，`toBytes()` 返回字节副本。接受省略了全部末尾填充的合法 Base64，输出时补足标准填充；Base64URL 字母表、空白和错误的填充会被拒绝。Base64 不合法时抛出 `TypeError`。

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
