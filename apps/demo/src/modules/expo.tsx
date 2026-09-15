import { isRunningInExpoGo, reloadAppAsync } from 'expo';
import { router } from 'expo-router';
import { showcaseModule } from '../../modules/expo-module-showcase';
import { json } from '../format';
import { ActionButton, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function ExpoDemo() {
  const action = useAsyncResult();

  return (
    <>
      <Panel eyebrow="EXPO 宿主" title="运行环境与生命周期">
        <DataRow label="运行于 Expo Go" value={String(isRunningInExpoGo())} />
        <Note>将应用切到后台再返回，可读取 demo 模块收到的生命周期次数。重新加载会重建 React 实例和页面。</Note>
        <ActionButton disabled={!showcaseModule} label="读取模块生命周期" onPress={() => void action.run(() => json(showcaseModule!.getLifecycleSnapshot()))} />
        <ResultPanel state={action.state} />
      </Panel>
      <Panel eyebrow="官方 EXPO API" title="宿主重载与网络请求">
        <ActionButton
          label="通过 Expo 重载"
          onPress={() => void action.run(async () => {
            await reloadAppAsync('Expo demo reload');

            return '已请求重载';
          })}
          testID="expo-reload"
        />
        <ActionButton label="打开 Fetch 测试" onPress={() => router.push('/module/fetch')} tone="secondary" />
      </Panel>
    </>
  );
}
