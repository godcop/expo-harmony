# @expo-harmony/expo

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo)

为 HarmonyOS 上的 React Native 应用提供 Expo 主包的原生实现，与官方同版本的 `expo` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo expo@55.0.26
```

应用继续使用官方 `expo` 和 `expo/fetch` 的 JavaScript API：

```ts
import { reloadAppAsync } from 'expo';
import { fetch } from 'expo/fetch';

const response = await fetch('https://example.com');
await reloadAppAsync();
```

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
