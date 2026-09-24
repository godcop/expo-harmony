# @expo-harmony/expo-localization

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-localization) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/localization/)

为 HarmonyOS 上的 React Native 应用提供 Expo Localization 的原生实现，与官方同版本的 `expo-localization` 配套使用。支持读取系统的偏好语言、地区、货币、日历、时区和时间格式，并在这些设置变化时更新。

## 安装

```bash
npm install @expo-harmony/expo-localization expo-localization@55.0.19
```

本包适配 Expo SDK 55 的 `expo-localization`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

官方插件的 `supportedLocales`、`supportsRTL`、`forcesRTL` 和 `allowDynamicLocaleChangesAndroid` 不作用于 HarmonyOS。应用语言资源使用 HarmonyOS 资源目录，布局方向由 React Native 的 `I18nManager` 管理。

业务代码从官方包导入：

```ts
import { getLocales, getCalendars, useLocales, useCalendars } from 'expo-localization';

const locales = getLocales();
const calendars = getCalendars();
```

## API 对照表

### Hooks

#### `useLocales()`

返回 `Locale[]`，至少一项。系统语言或地区变化后重新读取，应用回到前台时也会重新读取。

#### `useCalendars()`

返回 `Calendar[]`，至少一项。系统时间、时间格式或时区变化后重新读取，应用回到前台时也会重新读取。

### Methods

#### `Localization.getLocales()`

返回 `Locale[]`，同步读取，至少一项。列表按系统偏好语言的顺序排列，每一项给出该语言自身的语言标签和货币，地区、数字格式与计量制取系统地区设置。不带地区的偏好语言使用系统地区补全，例如系统地区为 `CN` 时，`zh-Hans` 返回 `zh-Hans-CN`，`en-CA` 这类已经指定地区的语言保持原地区。偏好列表为空或没有可解析的语言时，回退到系统语言和地区。

系统地区没有配置时，`regionCode`、`currencyCode`、`currencySymbol` 和 `measurementSystem` 为 `null`。`measurementSystem` 在地区为 `GB` 时取 `'uk'`，为 `US`、`LR`、`MM` 时取 `'us'`，其余取 `'metric'`。`temperatureUnit` 在 API 18 及以上读系统的温度单位偏好，系统取 Kelvin 时返回 `null`；更早的系统按地区推断，地区没有配置时为 `null`，以华氏为默认单位时返回 `'fahrenheit'`，否则返回 `'celsius'`。数字分隔符、货币代码和货币符号来自系统 ICU，不同系统版本的数据可能不同。

#### `Localization.getCalendars()`

返回 `Calendar[]`，同步读取，恒为一项。历法标识取系统 ICU 的历法类型，时区取系统时区，24 小时制取系统偏好。每周起始日在 API 18 及以上取系统偏好，更早的系统按语言数据推断。

### Types

#### `Calendar`

| 属性              | 类型             | 说明                             |
| ----------------- | ---------------- | -------------------------------- |
| `calendar`        | `string \| null` | Unicode 历法类型，如 `'gregory'` |
| `firstWeekday`    | `number`         | 每周起始日，周日为 1，周六为 7   |
| `timeZone`        | `string \| null` | 系统时区标识                     |
| `uses24hourClock` | `boolean`        | 系统是否使用 24 小时制           |

#### `Locale`

| 属性                     | 类型                                | 说明                                |
| ------------------------ | ----------------------------------- | ----------------------------------- |
| `languageTag`            | `string`                            | 语言标签，带地区，如 `'zh-Hans-CN'` |
| `languageCode`           | `string \| null`                    | 语言代码，不含地区，如 `'zh'`       |
| `languageScriptCode`     | `string \| null`                    | 文字代码，如 `'Hans'`               |
| `languageRegionCode`     | `string \| null`                    | 该语言自身的地区代码，缺省时使用系统地区 |
| `regionCode`             | `string \| null`                    | 系统地区设置中的地区代码            |
| `textDirection`          | `'ltr' \| 'rtl'`                    | 文字方向                            |
| `decimalSeparator`       | `string \| null`                    | 小数分隔符                          |
| `digitGroupingSeparator` | `string \| null`                    | 数字分组分隔符                      |
| `measurementSystem`      | `'metric' \| 'us' \| 'uk' \| null`  | 计量制                              |
| `currencyCode`           | `string \| null`                    | 系统地区的货币代码                  |
| `currencySymbol`         | `string \| null`                    | 系统地区的货币符号                  |
| `languageCurrencyCode`   | `string \| null`                    | 该语言地区的货币代码                |
| `languageCurrencySymbol` | `string \| null`                    | 该语言地区的货币符号                |
| `temperatureUnit`        | `'celsius' \| 'fahrenheit' \| null` | 温度单位                            |

### Enums

#### `CalendarIdentifier`

Unicode 历法类型，取值由系统 ICU 提供。公历可以写作 `GREGORIAN` 或 `GREGORY`。

#### `Weekday`

`SUNDAY = 1`、`MONDAY = 2`、`TUESDAY = 3`、`WEDNESDAY = 4`、`THURSDAY = 5`、`FRIDAY = 6`、`SATURDAY = 7`。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors)

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
