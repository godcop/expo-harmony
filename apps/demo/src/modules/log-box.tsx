import { requireNativeModule } from 'expo-modules-core';
import { useState } from 'react';
import { LogBox } from 'react-native';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const SAMPLE = 'Expo Harmony LogBox 中文复制 ✓';

export function LogBoxDemo() {
  const action = useAsyncResult();
  const [sequence, setSequence] = useState(0);
  const [pasted, setPasted] = useState('');
  const busy = !__DEV__ || action.state.phase === 'running';

  function report(level: 'warn' | 'error') {
    LogBox.ignoreAllLogs(false);
    setSequence(value => value + 1);
    console[level](`Expo Harmony LogBox ${level} #${sequence + 1}`, { message: '中文诊断 ✓' });
  }

  return (
    <>
      <Panel eyebrow="EXPO LOGBOX" title="日志、堆栈与错误恢复">
        <DataRow label="已发送日志" value={String(sequence)} />
        <Note>
          连续触发日志，检查多日志切换、源码堆栈、复制、Dismiss、Minimize 和 Reload。未捕获异常会中断本次操作，需通过错误页恢复。
          若 ArkWeb 启动失败，应显示超时提示及重试 / 最小化，不应停留空白。
        </Note>
        <ActionRow>
          <ActionButton label="触发警告" testID="devtools-warning" disabled={busy} onPress={() => report('warn')} />
          <ActionButton label="触发错误日志" testID="devtools-error" disabled={busy} onPress={() => report('error')} />
          <ActionButton
            label="触发未捕获异常"
            testID="logbox-uncaught"
            disabled={busy}
            tone="danger"
            onPress={() => {
              throw new Error('Expo Harmony LogBox: uncaught demo error');
            }}
          />
        </ActionRow>
      </Panel>
      <Panel eyebrow="NATIVE BRIDGE" title="启用状态与原生剪贴板">
        <Note>LogBox 只需要写入剪贴板。复制后长按下方输入框，使用系统“粘贴”，再校验内容；无需为此额外申请读取剪贴板权限。</Note>
        <ActionButton
          label="复制测试文本"
          testID="logbox-copy"
          disabled={busy}
          onPress={() => void action.run(async () => {
            const logbox = requireNativeModule<{ enabled: boolean; copyTextAsync(text: string): Promise<void> }>('ExpoLogBox');
            if (!logbox.enabled) throw new Error('LogBox is disabled in this native build.');

            await logbox.copyTextAsync(SAMPLE);

            return `enabled: true\n原生复制完成，请通过系统粘贴验证：\n${SAMPLE}`;
          })}
        />
        <Field label="长按输入框粘贴" value={pasted} onChangeText={setPasted} testID="logbox-paste" />
        <ActionButton
          label="校验粘贴内容"
          testID="logbox-verify-paste"
          tone="secondary"
          disabled={busy}
          onPress={() => void action.run(() => {
            if (pasted !== SAMPLE) throw new Error('Pasted text does not match the copied text.');
            return '原生复制 → 系统粘贴：内容一致 ✓';
          })}
        />
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}
