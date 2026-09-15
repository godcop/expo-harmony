import { useState } from 'react';
import { ActionButton, ActionRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';
import { runtimeDemo } from './runtime-demo';

const examples = {
  dictionary: 'signature=:aGVsbG8=:, keyid="main", enabled',
  list: '("harmony" 1.0);version=1, token;ready',
  item: '1.0;key="value"',
} as const;

export function StructuredHeadersDemo() {
  const action = useAsyncResult();
  const [format, setFormat] = useState<keyof typeof examples>('dictionary');
  const [input, setInput] = useState<string>(examples.dictionary);

  return (
    <Panel eyebrow="原生 Structured Fields" title="解析与规范化响应头">
      <Note>调用原生解析器与序列化器，覆盖字典、列表、小数、参数和 Base64 字节序列。错误输入会显示解析位置。</Note>
      {!runtimeDemo ? <Note>此页面的原生解析功能仅在 HarmonyOS demo 中提供。</Note> : null}
      <ActionRow>
        {(Object.keys(examples) as (keyof typeof examples)[]).map(value => (
          <ActionButton
            key={value}
            label={value}
            onPress={() => {
              setFormat(value);
              setInput(examples[value]);
              action.clear();
            }}
            tone={format === value ? 'primary' : 'secondary'}
          />
        ))}
      </ActionRow>
      <Field label="响应头值" multiline onChangeText={setInput} value={input} />
      <ActionRow>
        <ActionButton
          disabled={!runtimeDemo || action.state.phase === 'running'}
          label="解析并序列化"
          onPress={() => void action.run(() => runtimeDemo!.serializeHeader(format, input))}
          testID="headers-serialize"
        />
        <ActionButton label="无效响应头示例" onPress={() => setInput('"unterminated')} tone="secondary" />
      </ActionRow>
      <ResultPanel state={action.state} />
    </Panel>
  );
}
