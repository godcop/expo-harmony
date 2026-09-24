export const MODULE_CATEGORIES = [
  '核心运行时',
  '应用',
  '设备与媒体',
  '后台任务',
  '构建工具链',
] as const;

export type ModuleCategory = typeof MODULE_CATEGORIES[number];

export const MODULES = [
  { id: 'expo', title: 'Expo 宿主', packageName: '@expo-harmony/expo', category: '核心运行时', summary: '官方 Expo 入口、宿主重载与模块生命周期。' },
  { id: 'expo-modules-core', title: 'Expo Modules Core', packageName: '@expo-harmony/expo-modules-core', category: '核心运行时', summary: '原生模块注册表、事件发射器与 Expo 运行时桥接。' },
  { id: 'devtools', title: '开发工具 DevTools', packageName: '@expo-harmony/expo', category: '核心运行时', summary: 'Expo 网络检查、文件传输、请求取消与运行时重新加载。' },
  { id: 'dev-menu', title: '开发菜单', packageName: '@expo-harmony/expo-dev-menu', category: '核心运行时', summary: '菜单回调、偏好往返、FAB、源码浏览与宿主接口联动。' },
  { id: 'log-box', title: 'Expo LogBox', packageName: '@expo-harmony/expo__log-box', category: '核心运行时', summary: '多日志、堆栈、原生复制、未捕获异常与错误恢复。' },
  { id: 'eas-client', title: 'EAS 客户端', packageName: '@expo-harmony/expo-eas-client', category: '核心运行时', summary: '安装级客户端身份、确定性采样与持久化。' },
  { id: 'manifests', title: 'Manifest 清单', packageName: '@expo-harmony/expo-manifests', category: '核心运行时', summary: '内置与远程清单的原生字段读取和校验。' },
  { id: 'json-utils', title: 'JSON 字段读取', packageName: '@expo-harmony/expo-json-utils', category: '核心运行时', summary: '原生 JSON 字段读取、类型转换、可空值和错误边界。' },
  { id: 'structured-headers', title: '结构化响应头', packageName: '@expo-harmony/expo-structured-headers', category: '核心运行时', summary: '字典、列表与单项响应头的原生解析和序列化。' },
  { id: 'updates-interface', title: 'Updates 原生接口', packageName: '@expo-harmony/expo-updates-interface', category: '核心运行时', summary: '原生控制器、状态 Context 和带类型的事件订阅。' },
  { id: 'updates', title: '应用更新', packageName: '@expo-harmony/expo-updates', category: '核心运行时', summary: '更新检查、资源下载、缓存启动、签名与回滚。' },
  { id: 'expo-module-showcase', title: 'Expo Modules 测试', packageName: 'modules/expo-module-showcase', category: '核心运行时', summary: '使用本地模块测试原生调用、事件、共享对象、原生组件与页面，覆盖 Android、iOS 和 HarmonyOS。' },
  { id: 'expo-router', title: 'Expo Router', packageName: 'expo-router', category: '核心运行时', summary: '基于文件的路由、类型化参数、堆栈导航与深链接。' },
  { id: 'expo-task-manager', title: '任务管理器', packageName: '@expo-harmony/expo-task-manager', category: '核心运行时', summary: '全局任务定义与持久化的原生注册。' },

  { id: 'screen-orientation', title: '屏幕方向', packageName: '@expo-harmony/expo-screen-orientation', category: '应用', summary: '方向查询、横竖屏锁定、默认策略、变化事件与参数边界。' },
  { id: 'screen-capture', title: '截屏保护', packageName: '@expo-harmony/expo-screen-capture', category: '应用', summary: '窗口截屏与录屏保护、独立标签、截图通知与 Hooks。' },
  { id: 'secure-store', title: '安全存储', packageName: '@expo-harmony/expo-secure-store', category: '应用', summary: '加密键值存储、同步与异步读写、服务隔离、容量边界及生物认证。' },
  { id: 'app-integrity', title: '应用完整性', packageName: '@expo-harmony/expo-app-integrity', category: '应用', summary: '硬件证明能力、密钥生成、证书链读取、参数边界与平台限制。' },
  { id: 'local-authentication', title: '本地身份认证', packageName: '@expo-harmony/expo-local-authentication', category: '应用', summary: '生物识别能力、凭据录入、系统认证、密码回退与取消。' },
  { id: 'age-range', title: '年龄范围', packageName: '@expo-harmony/expo-age-range', category: '应用', summary: '系统年龄段、未知年龄、阈值参数与重复请求。' },
  { id: 'app-metrics', title: '应用指标', packageName: '@expo-harmony/expo-app-metrics', category: '应用', summary: '启动耗时、会话、诊断信息与持久化指标。' },
  { id: 'application', title: '应用信息', packageName: '@expo-harmony/expo-application', category: '应用', summary: '应用包标识、版本号、显示名称与安装时间。' },
  { id: 'asset', title: '资源', packageName: '@expo-harmony/expo-asset', category: '应用', summary: '内置资源、本地 URI 与远程缓存行为。' },
  { id: 'image', title: '图片', packageName: '@expo-harmony/expo-image', category: '设备与媒体', summary: '图片显示、动画、共享引用、BlurHash / ThumbHash、网络与缓存。' },
  { id: 'image-loader', title: '图片加载服务', packageName: '@expo-harmony/expo-image-loader', category: '设备与媒体', summary: '原生图片加载、Promise 与回调、独立编辑副本及错误边界。' },
  { id: 'image-manipulator', title: '图片处理', packageName: '@expo-harmony/expo-image-manipulator', category: '设备与媒体', summary: '缩放、旋转、翻转、裁剪、共享引用、格式编码与 Base64。' },
  { id: 'image-picker', title: '图片选择器', packageName: '@expo-harmony/expo-image-picker', category: '设备与媒体', summary: '系统图库与相机、图片和视频、多选、压缩、Base64、EXIF 与取消结果。' },
  { id: 'blob', title: '二进制数据', packageName: '@expo-harmony/expo-blob', category: '应用', summary: 'Blob 构造、文本与字节读取、切片、编码边界与流式读取。' },
  { id: 'constants', title: '常量', packageName: '@expo-harmony/expo-constants', category: '应用', summary: '内嵌的应用配置、设备信息与运行时标识。' },
  { id: 'font', title: '字体', packageName: '@expo-harmony/expo-font', category: '应用', summary: '内置字体资源与运行时注册。' },
  { id: 'intent-launcher', title: 'Intent 启动器', packageName: '@expo-harmony/expo-intent-launcher', category: '应用', summary: '应用启动、图标读取、Want 参数、结果回传与并发保护。' },
  { id: 'splash-screen', title: '启动屏', packageName: '@expo-harmony/expo-splash-screen', category: '应用', summary: '启动过程接管与幂等的内容就绪交接。' },
  { id: 'system-ui', title: '系统 UI', packageName: '@expo-harmony/expo-system-ui', category: '应用', summary: '根窗口背景与界面样式配置。' },
  { id: 'localization', title: '语言与地区', packageName: '@expo-harmony/expo-localization', category: '应用', summary: '偏好语言、地区、货币、日历、时区与系统设置变化 Hooks。' },

  { id: 'audio', title: '音频', packageName: '@expo-harmony/expo-audio', category: '设备与媒体', summary: '播放、预加载、播放列表状态与后台音频。' },
  { id: 'speech', title: '语音合成', packageName: '@expo-harmony/expo-speech', category: '设备与媒体', summary: '系统音色、文本播报、语速音调、队列停止、事件回调与参数边界。' },
  { id: 'battery', title: '电池', packageName: '@expo-harmony/expo-battery', category: '设备与媒体', summary: '电源状态快照、Hook 与原生状态事件。' },
  { id: 'blur', title: '模糊', packageName: '@expo-harmony/expo-blur', category: '设备与媒体', summary: '原生模糊视图、色调变体与强度更新。' },
  { id: 'brightness', title: '亮度', packageName: '@expo-harmony/expo-brightness', category: '设备与媒体', summary: '窗口亮度读写、权限、数值边界与平台兼容行为。' },
  { id: 'calendar', title: '日历', packageName: '@expo-harmony/expo-calendar', category: '设备与媒体', summary: '日历权限、日历与日程读写、重复实例、提醒以及系统新建页面。' },
  { id: 'camera', title: '相机', packageName: '@expo-harmony/expo-camera', category: '设备与媒体', summary: '权限申请、预览、拍照与镜头能力。' },
  { id: 'cellular', title: '蜂窝网络', packageName: '@expo-harmony/expo-cellular', category: '设备与媒体', summary: '网络代际、SIM 服务商、国家码与电话状态权限。' },
  { id: 'clipboard', title: '剪贴板', packageName: '@expo-harmony/expo-clipboard', category: '设备与媒体', summary: '文本、HTML、URL 与图片读写，以及剪贴板变化事件。' },
  { id: 'crypto', title: '加密', packageName: '@expo-harmony/expo-crypto', category: '设备与媒体', summary: '摘要、随机字节、UUID 与 AES-GCM 往返校验。' },
  { id: 'contacts', title: '联系人', packageName: '@expo-harmony/expo-contacts', category: '设备与媒体', summary: '通讯录权限、联系人读写、分页查询、系统选择器与 vCard 导出。' },
  { id: 'device', title: '设备信息', packageName: '@expo-harmony/expo-device', category: '设备与媒体', summary: '品牌、型号、系统版本、内存、CPU 架构、设备类型与开机时长。' },
  { id: 'document-picker', title: '文档选择器', packageName: '@expo-harmony/expo-document-picker', category: '设备与媒体', summary: '系统文档选择、MIME 过滤、多选、缓存复制、取消和并发保护。' },
  { id: 'fetch', title: '网络请求', packageName: '@expo-harmony/expo', category: '设备与媒体', summary: '通过 Expo fetch 实现的流式 HTTP 与本地文件响应。' },
  { id: 'file-system', title: '文件系统', packageName: '@expo-harmony/expo-file-system', category: '设备与媒体', summary: '文件、目录、原始句柄与系统选择器。' },
  { id: 'sensors', title: '传感器', packageName: '@expo-harmony/expo-sensors', category: '设备与媒体', summary: '硬件可用性、运动权限、实时测量、采样间隔、监听清理与计步。' },
  { id: 'haptics', title: '触感反馈', packageName: '@expo-harmony/expo-haptics', category: '设备与媒体', summary: '官方反馈样式与参数校验。' },
  { id: 'keep-awake', title: '保持唤醒', packageName: '@expo-harmony/expo-keep-awake', category: '设备与媒体', summary: '带标签的屏幕常亮与 React 生命周期处理。' },
  { id: 'linear-gradient', title: '线性渐变', packageName: '@expo-harmony/expo-linear-gradient', category: '设备与媒体', summary: '多色渐变、端点控制与圆角裁剪。' },
  { id: 'symbols', title: '系统图标', packageName: '@expo-harmony/expo-symbols', category: '设备与媒体', summary: '鸿蒙系统图标、名称回退、尺寸字重与多色渲染。' },
  { id: 'linking', title: '链接', packageName: '@expo-harmony/expo-linking', category: '设备与媒体', summary: 'URL 构造、解析、初始状态与前台链接。' },
  { id: 'live-photo', title: '实况照片', packageName: '@expo-harmony/expo-live-photo', category: '设备与媒体', summary: '图片与配对视频加载、播放控制、显示属性、生命周期事件及错误恢复。' },
  { id: 'location', title: '定位', packageName: '@expo-harmony/expo-location', category: '设备与媒体', summary: '定位权限、当前位置、位置与方向订阅、地理编码及参数边界。' },
  { id: 'media-library', title: '媒体库', packageName: '@expo-harmony/expo-media-library', category: '设备与媒体', summary: '图库权限、图片视频分页、元数据、保存与删除、相册成员和变更事件。' },
  { id: 'navigation-bar', title: '导航栏', packageName: '@expo-harmony/expo-navigation-bar', category: '设备与媒体', summary: '系统导航栏颜色、按键与可见性。' },
  { id: 'network', title: '网络', packageName: '@expo-harmony/expo-network', category: '设备与媒体', summary: '连接类型、可达性、IP 地址与状态事件。' },
  { id: 'print', title: '打印', packageName: '@expo-harmony/expo-print', category: '设备与媒体', summary: 'HTML 转 PDF、分页与 Base64 校验，以及系统文档打印。' },
  { id: 'sharing', title: '分享', packageName: '@expo-harmony/expo-sharing', category: '设备与媒体', summary: '通过 Harmony 系统面板分享本地文件。' },
  { id: 'sms', title: '短信', packageName: '@expo-harmony/expo-sms', category: '设备与媒体', summary: '短信能力、系统编辑页、收件人与正文回填、返回结果及错误恢复。' },
  { id: 'mail-composer', title: '邮件', packageName: '@expo-harmony/expo-mail-composer', category: '设备与媒体', summary: '邮件能力、客户端列表、系统邮件面板、正文附件与错误恢复。' },

  { id: 'background-fetch', title: '后台拉取', packageName: '@expo-harmony/expo-background-fetch', category: '后台任务', summary: 'WorkScheduler 注册与 JavaScript 回调。' },
  { id: 'background-task', title: '后台任务', packageName: '@expo-harmony/expo-background-task', category: '后台任务', summary: '新一代后台任务与调试触发行为。' },

  { id: 'cli', title: 'CLI', packageName: '@expo-harmony/cli', category: '构建工具链', summary: '用于准备、导出和运行 Harmony 应用的公开命令契约。' },
  { id: 'config-plugins', title: '配置插件', packageName: '@expo-harmony/config-plugins', category: '构建工具链', summary: 'Harmony 应用配置与受管理的原生修改。' },
  { id: 'expo-modules-autolinking', title: '模块自动链接', packageName: '@expo-harmony/expo-modules-autolinking', category: '构建工具链', summary: 'Harmony Expo 模块的自动发现与注册。' },
  { id: 'metro-config', title: 'Metro 配置', packageName: '@expo-harmony/metro-config', category: '构建工具链', summary: '面向 Harmony 的模块解析、资源处理与打包目标。' },
  { id: 'prebuild-config', title: 'Prebuild 配置', packageName: '@expo-harmony/prebuild-config', category: '构建工具链', summary: '生成的原生工程、描述文件与 CNG 清单。' },
  { id: 'template', title: '模板', packageName: '@expo-harmony/template', category: '构建工具链', summary: 'Harmony 应用的基线依赖与运行时契约。' },
] as const satisfies readonly {
  id: string;
  title: string;
  packageName: string;
  category: ModuleCategory;
  summary: string;
}[];

export type ModuleId = typeof MODULES[number]['id'];
export type ModuleDefinition = typeof MODULES[number];

export function findModule(value: string | string[] | undefined): ModuleDefinition | undefined {
  const id = Array.isArray(value) ? value[0] : value;
  return MODULES.find(module => module.id === id);
}
