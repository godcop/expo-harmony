# Changelog

Version: 55.0.18-harmony.0

## 55.0.18-harmony.0

- 对齐 Expo SDK 55 `expo-network@55.0.18`；指定上游提交范围没有新增 API 或平台行为修复。
- 修正未知网络类型的 `isConnected`，并对齐 Android API 29+ 的 `isInternetReachable` 语义。
- 修复异步注册期间取消订阅的注销竞态、注销失败后的引用滞留和过期状态事件。
- 使用官方地址族识别 IPv4，移除飞行模式设置的自定义缺失标记。
- 保持 API 13 最低兼容版本，仅声明普通 `GET_NETWORK_INFO` 权限；补充平台差异与编译验证说明。

[Commit History](https://github.com/renbaoshuo/expo-harmony/commits/master/packages/expo-network)
