import { openMenu } from 'expo-dev-client';
import { requireNativeModule } from 'expo-modules-core';
import { useState } from 'react';
import { NativeModules } from 'react-native';
import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

interface Launcher {
  loadApp(url: string): Promise<void>;
}

export function DevLauncherDemo() {
  const action = useAsyncResult();
  const [url, setUrl] = useState(() => {
    const bundle = NativeModules.SourceCode?.scriptURL as string | undefined;
    return bundle?.startsWith('http') ? new URL('/manifest?platform=harmony', bundle).href : 'http://127.0.0.1:8088/manifest?platform=harmony';
  });
  const busy = !__DEV__ || action.state.phase === 'running';

  async function checkInvalidLinks() {
    const launcher = requireNativeModule<Launcher>('ExpoDevLauncher');
    const results: string[] = [];

    for (const input of ['', 'ftp://localhost/project', 'http://user:password@localhost/', 'http://localhost/#fragment', 'expo-harmony://open', 'expo-harmony://open?url=%ZZ']) {
      try {
        await launcher.loadApp(input);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== 'ERR_DEV_LAUNCHER_INVALID_URL') throw new Error(`${input || '(empty)'}: ${String(error)} [${code}]`);
        results.push(`${input || '(empty)'} → ${code} ✓`);
        continue;
      }

      throw new Error(`Invalid URL was accepted: ${input}`);
    }

    return results.join('\n');
  }

  return (
    <>
      <Panel eyebrow="DEV LAUNCHER" title="项目加载与错误边界">
        <DataRow label="开发构建" value={String(__DEV__)} />
        <Field label="开发项目 / 已发布项目 URL" value={url} onChangeText={setUrl} />
        <Note>成功加载会替换当前应用。开发清单必须匹配客户端原生依赖；已发布项目还需要有效的 Updates 配置。无效地址测试只检查拒绝和错误码，不会执行新 bundle。</Note>
        <ActionRow>
          <ActionButton
            label="加载项目"
            testID="launcher-load"
            disabled={busy || !url.trim()}
            onPress={() => void action.run(async () => {
              await requireNativeModule<Launcher>('ExpoDevLauncher').loadApp(url.trim());
              return '项目已交给启动器加载';
            })}
          />
          <ActionButton label="校验无效地址" testID="launcher-invalid" tone="secondary" disabled={busy} onPress={() => void action.run(checkInvalidLinks)} />
          <ActionButton
            label="读取启动器常量"
            testID="launcher-constants"
            tone="secondary"
            disabled={busy}
            onPress={() => void action.run(async () => {
              const launcher = NativeModules.EXDevLauncher;
              if (!launcher) throw new Error('EXDevLauncher TurboModule is unavailable.');

              const values = typeof launcher.getConstants === 'function' ? launcher.getConstants() : launcher;
              if ((values.manifestURL !== null && typeof values.manifestURL !== 'string') || (values.manifestString !== null && typeof values.manifestString !== 'string')) {
                throw new Error('Launcher constants must contain nullable manifestURL and manifestString fields.');
              }
              const manifest = values.manifestString === null ? null : JSON.parse(values.manifestString);

              return json({
                manifestURL: values.manifestURL,
                manifestLength: values.manifestString?.length ?? 0,
                runtimeVersion: manifest?.runtimeVersion,
                launchAsset: manifest?.launchAsset,
                nativePackages: manifest?.extra?.harmony?.requirements?.modules?.length,
              });
            })}
          />
        </ActionRow>
        <ResultPanel state={action.state} />
      </Panel>
      <Panel eyebrow="HOST LIFECYCLE" title="Home、历史记录与设备入口">
        <Note>
          打开菜单选择 Home，确认返回启动器，再从最近项目进入应用。启动器页面可验证 mDNS、手动地址、清空历史和扫码；系统扫码需要支持 Scan Kit 的真机。
          多窗口、三指手势及后台恢复需单独操作验证。
        </Note>
        <ActionButton label="打开菜单验证 Home" testID="launcher-home" disabled={!__DEV__} onPress={openMenu} />
      </Panel>
    </>
  );
}
