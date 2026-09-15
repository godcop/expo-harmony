import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import { json } from '../format';
import { ActionButton, ActionRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';
import { runtimeDemo } from './runtime-demo';

export function UpdatesInterfaceDemo() {
  const action = useAsyncResult();
  const check = useAsyncResult();
  const [observing, setObserving] = useState(false);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    if (!observing || !runtimeDemo) return;

    const subscription = runtimeDemo.addListener('onUpdatesStateChange', (value) => {
      setEvents(current => [...current.slice(-19), value.event]);
    });

    return () => subscription.remove();
  }, [observing]);

  return (
    <>
      <Panel eyebrow="原生 UpdatesInterface" title="控制器与 Context">
        <Note>通过 demo 本地模块读取实际控制器注册表。未启用更新或开发控制器的 Context 可以为空。</Note>
        {!runtimeDemo ? <Note>此页面的原生接口检查仅在 HarmonyOS demo 中提供。</Note> : null}
        <ActionButton
          disabled={!runtimeDemo}
          label="读取原生更新接口"
          onPress={() => void action.run(() => {
            const value = JSON.parse(runtimeDemo!.readUpdates());
            if (value.isEnabled !== Updates.isEnabled
              || (value.launchedUpdateId ?? null) !== (Updates.updateId ?? null)) {
              throw new Error('原生控制器与官方 JS 的更新身份不一致。');
            }

            return json(value);
          })}
          testID="updates-interface-read"
        />
        <ResultPanel state={action.state} />
      </Panel>
      <Panel eyebrow="原生事件" title="订阅、检查与取消订阅">
        <Note>原生事件包含 type 及对应负载。停止监听或离开页面会取消订阅；列表保留最近 20 条事件。</Note>
        <ActionRow>
          <ActionButton disabled={!runtimeDemo} label={observing ? '停止原生监听' : '开始原生监听'} onPress={() => setObserving(value => !value)} />
          <ActionButton disabled={!Updates.isEnabled || check.state.phase === 'running'} label="检查并观察事件" onPress={() => void check.run(async () => json(await Updates.checkForUpdateAsync()))} />
          <ActionButton label="清空事件列表" onPress={() => setEvents([])} tone="secondary" />
        </ActionRow>
        <ResultPanel state={check.state} />
        {events.length ? <Note>{events.join('\n')}</Note> : <Note>尚未收到原生状态事件。</Note>}
      </Panel>
    </>
  );
}
