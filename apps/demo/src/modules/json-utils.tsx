import { useState } from 'react';

import { json } from '../format';
import { ActionButton, ActionRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';
import { runtimeDemo, type RuntimeDemoModule } from './runtime-demo';

type Reader = Parameters<RuntimeDemoModule['readJSON']>[2];
type Check = { name: string; passed: boolean; error: string };

const readers: Reader[] = ['raw', 'string', 'number', 'boolean', 'array', 'object'];
const sample = { name: 'HarmonyOS', count: ' 2.5 ', enabled: 'TRUE', items: [1, null], extra: {}, empty: null };

export function JSONUtilsDemo() {
  const checks = useAsyncResult();
  const action = useAsyncResult();
  const [input, setInput] = useState(json(sample));
  const [key, setKey] = useState('count');
  const [type, setType] = useState<Reader>('number');

  function preset(key: string, type: Reader) {
    setInput(json(sample));
    setKey(key);
    setType(type);
    action.clear();
  }

  return (
    <>
      <Panel eyebrow="原生 JSON Utils" title="字段读取与边界检查">
        <Note>通过 demo 本地模块调用真实 HAR，检查必填与可空读取、标量转换、引用保持以及无效序列化输入。</Note>
        {!runtimeDemo ? <Note>原生读取与回归检查仅在 HarmonyOS demo 中提供。</Note> : null}
        <ActionButton
          disabled={!runtimeDemo || checks.state.phase === 'running'}
          label="运行原生回归检查"
          onPress={() => void checks.run(() => {
            const results: Check[] = JSON.parse(runtimeDemo!.checkJSON());
            const count = results.filter(result => result.passed).length;
            const output = [`通过 ${count}/${results.length}`, ...results.map(result =>
              `${result.passed ? '✓' : '✗'} ${result.name}${result.error ? `：${result.error}` : ''}`)].join('\n');

            if (count !== results.length) throw new Error(output);

            return output;
          })}
          testID="json-utils-check"
        />
        <ResultPanel state={checks.state} />
      </Panel>
      <Panel title="交互读取">
        <ActionRow>
          <ActionButton label="数值转换" onPress={() => preset('count', 'number')} tone="secondary" testID="json-utils-number" />
          <ActionButton label="显式 null" onPress={() => preset('empty', 'string')} tone="secondary" testID="json-utils-null" />
          <ActionButton label="缺失字段" onPress={() => preset('missing', 'raw')} tone="secondary" testID="json-utils-missing" />
          <ActionButton label="类型错误" onPress={() => preset('items', 'object')} tone="secondary" testID="json-utils-invalid" />
        </ActionRow>
        <Field label="JSON 对象" multiline onChangeText={setInput} value={input} />
        <Field label="字段名" onChangeText={setKey} value={key} />
        <ActionRow>
          {readers.map(reader => (
            <ActionButton
              key={reader}
              label={reader}
              onPress={() => {
                setType(reader);
                action.clear();
              }}
              tone={type === reader ? 'primary' : 'secondary'}
            />
          ))}
        </ActionRow>
        <ActionRow>
          <ActionButton
            disabled={!runtimeDemo || action.state.phase === 'running'}
            label="必填读取"
            onPress={() => void action.run(() => json(JSON.parse(runtimeDemo!.readJSON(input, key, type, false))))}
            testID="json-utils-required"
          />
          <ActionButton
            disabled={!runtimeDemo || action.state.phase === 'running'}
            label="可空读取"
            onPress={() => void action.run(() => json(JSON.parse(runtimeDemo!.readJSON(input, key, type, true))))}
            testID="json-utils-nullable"
            tone="secondary"
          />
        </ActionRow>
        <Note>可空读取仅对缺失字段返回 null；类型不匹配仍会报错。显式 null 转字符串为 “null”。数值使用双精度，超出安全整数范围时请保留字符串。</Note>
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}
