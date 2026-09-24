# @expo-harmony/expo-sqlite

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-sqlite) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/)

为 HarmonyOS 上的 React Native 应用提供 Expo SQLite 的原生实现，与官方同版本的 `expo-sqlite` 配套使用。支持同步和异步 SQL、预编译语句、事务、数据库快照、Session Extension 与变更监听。React hooks、`SQLiteProvider`、`kv-store` 和 `localStorage` 直接使用官方 JavaScript 实现。

## 安装

```bash
npm install @expo-harmony/expo-sqlite expo-sqlite@55.0.20
```

本包适配 Expo SDK 55 的 `expo-sqlite`，原生模块通过 Expo Harmony 自动链接。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。

```ts
import * as SQLite from 'expo-sqlite';

const db = await SQLite.openDatabaseAsync('notes.db');
try {
  await db.execAsync('CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, body TEXT)');
  await db.runAsync('INSERT INTO notes (body) VALUES (?)', 'Hello HarmonyOS');
  console.log(await db.getAllAsync('SELECT * FROM notes'));
} finally {
  await db.closeAsync();
}
```

## Config Plugin

默认构建启用标准 SQLite 和 FTS。需要 SQLCipher、libSQL、sqlite-vec 或自定义编译选项时，在 `app.json` 的 `plugins` 中注册 `@expo-harmony/expo-sqlite`，然后重新 prebuild 和构建应用：

```json
{
  "expo": {
    "plugins": [
      ["@expo-harmony/expo-sqlite", {
        "enableFTS": true,
        "harmony": {
          "useSQLCipher": true,
          "withSQLiteVecExtension": true
        }
      }]
    ]
  }
}
```

已有 `expo-sqlite` 插件时，将其替换为上述包名并保留原选项。本插件调用官方插件处理 iOS/Android；Harmony 配置优先取 `harmony` 下的值，再回退到同名顶层选项，支持覆盖为 `false` 或空字符串。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `enableFTS` | `true` | 启用 SQLite/SQLCipher 的 FTS3/4/5 |
| `customBuildFlags` | `""` | SQLite/SQLCipher 额外编译参数 |
| `useSQLCipher` | `false` | 使用 SQLCipher 和静态 OpenSSL，以 `PRAGMA key` 等官方接口配置加密 |
| `useLibSQL` | `false` | 使用官方 libSQL C 后端 |
| `withSQLiteVecExtension` | `false` | 打包官方 sqlite-vec 扩展 |

SQLCipher 与 libSQL 不能同时启用；libSQL 不支持扩展加载，不能与 sqlite-vec 同时启用。`enableFTS` 和 `customBuildFlags` 不改变 libSQL 内置的 SQLite 配置。插件通过自动链接流程在应用构建目录生成并缓存配置对应的 HAR，应用开发者无需修改 `node_modules`，也无需安装 Python 或 Rust。

## API 对照表

### 数据库与语句

| 官方 API | HarmonyOS 行为 |
| --- | --- |
| `openDatabaseAsync/Sync`、`closeAsync/Sync`、`deleteDatabaseAsync/Sync` | 在应用沙箱中管理数据库；相同原始路径和打开选项复用连接，`useNewConnection` 创建独立连接 |
| `execAsync/Sync`、`runAsync/Sync`、`getFirstAsync/Sync`、`getAllAsync/Sync`、`getEachAsync/Sync` | 执行 SQL、绑定参数、读取结果；SQLite/SQLCipher 绑定与读取的文本保留内嵌 NUL，空 `Uint8Array` 保留为空 BLOB |
| `prepareAsync/Sync`、statement `executeAsync/Sync`、`getColumnNamesAsync/Sync`、`finalizeAsync/Sync` | 支持预编译语句、游标复位和复用；使用 `try...finally` 主动释放 statement |
| `withTransactionAsync/Sync`、`withExclusiveTransactionAsync`、`isInTransactionAsync/Sync` | 使用官方 JS 事务封装和 SQLite 原生事务状态 |
| `serializeAsync/Sync`、`deserializeDatabaseAsync/Sync`、`backupDatabaseAsync/Sync` | 序列化、恢复及数据库备份 |
| `createSessionAsync/Sync` | 支持表附加、启停、changeset 生成、反转和应用 |
| `addDatabaseChangeListener` | 打开数据库时设置 `enableChangeListener: true`；监听 SQLite update hook，回滚前的写入也可能产生通知 |
| `SQLiteProvider` 的 `assetSource` | 导入本地资源数据库；覆盖不是原子操作，复制失败可能留下部分文件，替换前应关闭数据库 |

空 SQL 可以成功 prepare，列名为空；执行时返回 `ERR_INTERNAL_SQLITE_ERROR`，首次 finalize 成功。再次访问已 finalize 的 statement 或已关闭数据库返回 `ERR_ACCESS_CLOSED_RESOURCE`。同步调用可能等待同连接的原生操作，较重的 SQL 建议使用异步接口；独立异步调用之间不保证执行先后顺序。

`finalizeUnusedStatementsBeforeClosing: false` 时，未释放的 statement 可能导致 close 返回 busy。此时连接仍可访问，但已退出可复用连接缓存；模块仍追踪其生命周期，重复 close 不会重试关闭，最终由模块销毁阶段清理。INTEGER 和 `lastInsertRowId` 返回 JS number，仍受安全整数精度限制。文件 URI、路径规范化、平台 I/O 错误文本和已打开文件覆盖行为可能与 Android/iOS 不同。

### libSQL

启用 `useLibSQL` 后，使用官方嵌套选项传入服务器地址和认证信息：

```ts
const db = await SQLite.openDatabaseAsync('replica.db', {
  libSQLOptions: {
    url: 'libsql://your-database.turso.io',
    authToken: token,
    remoteOnly: false,
  },
});
await db.syncLibSQL();
await db.closeAsync();
```

`url` 和 `authToken` 均须提供。默认使用 offline embedded replica，启用 read-your-writes 和 WebPKI；将 `libSQLOptions.remoteOnly` 设为 `true` 使用 remote backend。本包声明网络权限。与上游 libSQL 后端一致，命名参数、事务状态查询、序列化、backup、Session、变更监听和扩展加载不受支持，返回 `ERR_UNSUPPORTED_OPERATION`。

libSQL 的官方 C API 使用 NUL 结尾字符串：绑定文本在首个 NUL 处截断，读取含内嵌 NUL 的 TEXT 时，当前 C API 返回空指针，本包与上游 iOS 一样返回空字符串；需要保留任意字节时请使用 `Uint8Array`/BLOB。所有后端的 SQL 源文本也使用 NUL 结尾字符串，不应包含内嵌 NUL；参数文本应通过绑定传入。

### 扩展加载

启用 `withSQLiteVecExtension` 后，扩展随 HAR 打包，通过官方 API 手动加载：

```ts
const extension = SQLite.bundledExtensions['sqlite-vec'];
await db.loadExtensionAsync(extension.libPath, extension.entryPoint);
```

`loadExtensionAsync/Sync` 也支持自行编译的同 ABI HarmonyOS 扩展。省略入口或传入空字符串时使用 SQLite 默认入口查找规则；空字符串行为与 Android 一致，iOS 会原样传入空字符串。

原生依赖使用固定版本的官方 SQLite、SQLCipher、libSQL、OpenSSL 和 sqlite-vec，没有通过其他数据库包代替实现，来源及许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
