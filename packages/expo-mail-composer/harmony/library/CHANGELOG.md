# Changelog

## 55.0.18-harmony.0 — 2026-09-22

- 对齐 Expo SDK 55 的 `expo-mail-composer@55.0.18`；上游区间 `0fae4f7a6d3..167ec74a43d` 无新增 API 或原生行为修复。
- 修复使用 `mailto` 查询结果拦截 `ComposeMail` 面板的问题，避免误拒绝使用其他 URI scheme 的邮件客户端；直接撰写邮件不再要求配置 `querySchemes`。
- 为官方附件授权协议键添加具名常量与来源，保留 API 21 最低版本、临时只读附件授权和 `undetermined` 结果语义。
- 更新平台限制及包级 Release HAR 编译记录。

## 55.0.14-harmony.0

- 初始 HarmonyOS 实现。

[Commit History](https://github.com/renbaoshuo/expo-harmony/commits/master/packages/expo-mail-composer)
