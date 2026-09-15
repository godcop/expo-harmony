import { clientID, deterministicUniformValue } from 'expo-eas-client';
import { useRef } from 'react';
import { json } from '../format';
import { ActionButton, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function EASClientDemo() {
  const action = useAsyncResult();
  const initial = useRef({ clientID: String(clientID), deterministicUniformValue });

  return (
    <Panel eyebrow="EAS CLIENT" title="安装级客户端身份">
      <DataRow label="客户端 ID" value={String(clientID)} />
      <DataRow label="确定性采样值" value={String(deterministicUniformValue)} />
      <Note>使用官方 expo-eas-client 导出。客户端 ID 应跨页面、React 重载和应用重启保持不变；卸载或清除应用数据后会重新生成。</Note>
      <ActionButton
        label="校验身份与采样值"
        onPress={() => void action.run(() => {
          const id = String(clientID);
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
            throw new Error('客户端 ID 不是有效 UUID。');
          }

          const expected = Number(BigInt(`0x${id.replace(/-/g, '').slice(16)}`)) / Number(BigInt('18446744073709551615'));
          if (id !== initial.current.clientID || deterministicUniformValue !== initial.current.deterministicUniformValue
            || !Number.isFinite(deterministicUniformValue) || deterministicUniformValue !== expected) {
            throw new Error('客户端身份或确定性采样值不一致。');
          }

          return json({ clientID: id, deterministicUniformValue, stable: true });
        })}
        testID="eas-client-validate"
      />
      <ResultPanel state={action.state} />
    </Panel>
  );
}
