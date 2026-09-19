# @expo-harmony/expo-dev-menu

[**GitHub 仓库**](https://github.com/renbaoshuo/expo-harmony/tree/master/packages/expo-dev-menu) | [官方文档](https://docs.expo.dev/versions/v55.0.0/sdk/dev-menu/)

为 HarmonyOS 上的 React Native 应用提供 Expo 开发菜单，与官方同版本的 `expo-dev-menu` 配套使用。

## 安装

```bash
npm install @expo-harmony/expo-dev-menu expo-dev-menu@55.0.30
```

本包适配 Expo SDK 55 的 `expo-dev-menu`，提供鸿蒙端的原生菜单，API 从官方包导入。原生模块通过 Expo Harmony 自动链接，本包没有单独的配置插件。最低支持 HarmonyOS 5.0.1（API 13），宿主的 `compatibleSdkVersion` 也要满足这一要求。菜单只在开发构建中出现，生产构建不会包含开发菜单。

使用 `@expo-harmony/expo-dev-client` 时本包由其引入。FAB 的初始可见性由 `@expo-harmony/expo-dev-launcher` 配置插件的 `toolsButton` 选项设置，用户在设置中的修改优先。

## API 对照表

### Methods

#### `openMenu()`

打开开发菜单。菜单是底部弹层，包含 Reload、元素检查器、React Native DevTools、性能监视器、React Native 菜单、Home（启动器提供时）、自定义项目以及设置和源码浏览入口。bundle 还在执行时 Reload 不可用。React Native DevTools 只对来自 Metro 的网络 bundle 开放，元素检查器和性能监视器的菜单项不带选中状态。

除调用该方法外，还可以点 FAB、三指长按或 Ctrl/Command + D 打开菜单。Ctrl/Command + R、I、P 分别触发重载、元素检查器和性能监视器。快捷键要求 Ctrl 或 Command 修饰键，按住 Alt 或 Shift 时不响应，软键盘弹出时暂停。三指长按和快捷键分别受 `touchGestureEnabled` 和 `keyCommandsEnabled` 偏好控制。

> **未实现的内容**
>
> - 摇动设备打开菜单、Metro 的 `devMenu` 命令直达菜单。RNOH 0.84.1 没有公开的拦截接口，这两条路径先打开 RNOH 菜单，再选择 “Open Expo development menu” 进入本菜单，设置中的摇动开关因此不可用。
> - Fast Refresh 开关，由 RNOH 菜单的 Settings 提供。

#### `closeMenu()` / `hideMenu()`

收起菜单，两者行为一致。

#### `registerDevMenuItems(items)`

返回 `Promise<void>`，在菜单中注册自定义项目。每次调用替换之前的全部项目，传入空数组清除。项目按 `name` 标识，重名时只有最后一个可以触发。省略 `shouldCollapse` 时选中后收起菜单，官方文档标注的默认值是 `false`。

### Types

#### `ExpoDevMenuItem`

自定义菜单项目。`name` 是显示名称，`callback` 是选中时执行的回调，`shouldCollapse` 控制选中后是否收起菜单。

### Native Modules

#### `DevMenuPreferences.getPreferencesAsync()` / `setPreferencesAsync(values)`

读取或修改菜单偏好，偏好持久化保存。`motionGestureEnabled`、`touchGestureEnabled`、`keyCommandsEnabled` 默认开启，`showsAtLaunch` 默认关闭，`showFloatingActionButton` 默认开启。首次打开菜单会显示一次引导页，完成后写入 `isOnboardingFinished`。写入时忽略未知键、非布尔值和 `isOnboardingFinished`，引导完成状态只由引导页维护。存储不可用时修改只对当前会话生效，Promise 拒绝。

### 原生界面

FAB 是齿轮按钮，支持拖动，松手后按惯性吸附到最近的左右边缘，位置跨启动保留。交互后 5 秒内保持着色，之后变灰。应用退到后台、软键盘弹出、引导未完成或菜单打开时隐藏。

源码浏览读取 Metro 的 source map（网络 bundle 对应的 `.map` 文件或本地缓存），提供目录导航、搜索、语法着色、字号调整、换行开关、复制和临时编辑。编辑只影响查看的内容，不修改运行中的 bundle。超过 512 KiB 或 3000 个着色分段时回退纯文本，source map 不含源码内容时会提示。

应用信息区显示连接地址、bundle 地址、版本和 runtimeVersion（或 SDK 版本），可以复制。

## Author

**expo-harmony** © [Baoshuo](https://github.com/renbaoshuo), Released under the MIT License.<br>
Authored and maintained by Baoshuo with help from [contributors](https://github.com/renbaoshuo/expo-harmony/contributors).

> [Personal Website](https://baoshuo.ren) · [Blog](https://blog.baoshuo.ren) · GitHub [@renbaoshuo](https://github.com/renbaoshuo) · Twitter [@renbaoshuo](https://twitter.com/renbaoshuo)
