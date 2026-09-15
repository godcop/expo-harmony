import { useState } from 'react';
import { json } from '../format';
import { ActionButton, ActionRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';
import { runtimeDemo } from './runtime-demo';

const embedded = {
  id: '6b91b9ac-5e23-4a35-a69c-b92818c32eef',
  commitTime: 1750000000000,
  bundleUrl: 'file:///demo/hermes_bundle.hbc',
  name: 'Embedded demo',
  harmony: { backgroundColor: '#F2F2F7' },
};
const remote = {
  id: '57a94ee9-ff97-4be5-9313-77cbf9349fba',
  createdAt: '2025-06-15T15:06:40.000Z',
  runtimeVersion: 'demo-runtime',
  metadata: {},
  launchAsset: { url: 'https://example.com/update.hbc' },
  extra: { scopeKey: 'demo', expoClient: { name: 'Remote demo' } },
};

export function ManifestsDemo() {
  const action = useAsyncResult();
  const [input, setInput] = useState(json(embedded));

  return (
    <Panel eyebrow="原生 Manifest" title="读取内置与远程清单">
      <Note>通过 demo 本地模块调用原生 Manifest 模型。示例只解析内容，不下载资源；无效字段会显示原生错误。</Note>
      {!runtimeDemo ? <Note>此页面的原生读取功能仅在 HarmonyOS demo 中提供。</Note> : null}
      <ActionRow>
        <ActionButton label="内置清单示例" onPress={() => setInput(json(embedded))} tone="secondary" />
        <ActionButton label="远程清单示例" onPress={() => setInput(json(remote))} tone="secondary" />
        <ActionButton label="无效字段示例" onPress={() => setInput(json({ ...embedded, commitTime: 'invalid' }))} tone="secondary" />
      </ActionRow>
      <Field label="Manifest JSON" multiline onChangeText={setInput} value={input} />
      <ActionButton
        disabled={!runtimeDemo || action.state.phase === 'running'}
        label="读取 Manifest"
        onPress={() => void action.run(() => json(JSON.parse(runtimeDemo!.readManifest(input))))}
        testID="manifests-read"
      />
      <ResultPanel state={action.state} />
    </Panel>
  );
}
