# Changelog

Version: 55.0.18-harmony.0

## 55.0.18-harmony.0

- Align package versions and the upstream peer dependency with `expo-local-authentication@55.0.18` at Expo SDK 55 commit `167ec74a43d`.
- Port the concurrent authentication fix from upstream commit `207b32507cb` (#45954): resolve a new call with `app_cancel` while preserving the active prompt, options, and promise.
- Retain per-call callback isolation, immediate `user_cancel` settlement on cancellation, and `app_cancel` cleanup on module/Ability destruction or reload. Late callbacks cannot affect subsequent calls.
- Audit `0fae4f7a6d3..167ec74a43d`: no new APIs or iOS behavior changes. Keep the official User Authentication Kit implementation, API 13 compatibility, and the normal `ACCESS_BIOMETRIC` permission.

[Commit History](https://github.com/renbaoshuo/expo-harmony/commits/master/packages/expo-local-authentication)
