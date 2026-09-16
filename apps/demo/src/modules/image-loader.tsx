import { useState } from 'react';
import { Image } from 'react-native';

import icon from '../../assets/app-icon.png';
import { json } from '../format';
import { ActionButton, ActionRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';
import { runtimeDemo } from './runtime-demo';

type Check = { name: string; passed: boolean; error: string };
type Result = { width: number; height: number; editable: boolean; bytes: number; preview: string };

const fixture = 'rawfile://image-loader-fixture.png';

export function ImageLoaderDemo() {
  const checks = useAsyncResult();
  const action = useAsyncResult();
  const [uri, setUri] = useState(fixture);
  const [preview, setPreview] = useState<string>();
  const busy = action.state.phase === 'running';

  function preset(value: string) {
    setUri(value);
    setPreview(undefined);
    action.clear();
  }

  function load(editing: boolean, callback: boolean) {
    setPreview(undefined);
    void action.run(async () => {
      if (!runtimeDemo) throw new Error('当前平台未提供原生图片加载测试。');

      const result: Result = JSON.parse(await runtimeDemo.readImage(uri, editing, callback));
      setPreview(result.preview);

      return json({
        mode: editing ? '编辑' : '展示',
        method: callback ? '回调' : 'Promise',
        width: result.width,
        height: result.height,
        editable: result.editable,
        bytes: result.bytes,
      });
    });
  }

  return (
    <>
      <Panel eyebrow="原生图片服务" title="加载与资源检查">
        <Note>检查 data URI、本地文件、打包资源、四种调用方式、独立编辑副本和无效输入。图片和临时文件会在检查后释放。</Note>
        {!runtimeDemo ? <Note>原生图片服务测试仅在 HarmonyOS demo 中提供。</Note> : null}
        <ActionButton
          disabled={!runtimeDemo || checks.state.phase === 'running'}
          label="运行原生回归检查"
          onPress={() => void checks.run(async () => {
            if (!runtimeDemo) throw new Error('当前平台未提供原生图片加载测试。');

            const results: Check[] = JSON.parse(await runtimeDemo.checkImages());
            const count = results.filter(result => result.passed).length;
            const output = [`通过 ${count}/${results.length}`, ...results.map(result =>
              `${result.passed ? '✓' : '✗'} ${result.name}${result.error ? `：${result.error}` : ''}`)].join('\n');
            if (count !== results.length) throw new Error(output);

            return output;
          })}
          testID="image-loader-check"
        />
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="图片预览" title="交互加载">
        <ActionRow>
          <ActionButton disabled={busy} label="打包色块图" onPress={() => preset(fixture)} tone="secondary" testID="image-loader-fixture" />
          <ActionButton
            disabled={busy}
            label="Metro 图片资源"
            onPress={() => preset(Image.resolveAssetSource(icon).uri)}
            tone="secondary"
            testID="image-loader-asset"
          />
          <ActionButton disabled={busy} label="无效图片" onPress={() => preset('data:image/png;base64,AAAA')} tone="secondary" testID="image-loader-invalid" />
        </ActionRow>
        <Field editable={!busy} label="图片 URI（支持 HTTP(S)、文件、资源及 base64）" onChangeText={setUri} value={uri} testID="image-loader-uri" />
        <ActionRow>
          <ActionButton disabled={!runtimeDemo || busy} label="展示 · Promise" onPress={() => load(false, false)} testID="image-loader-display" />
          <ActionButton disabled={!runtimeDemo || busy} label="展示 · 回调" onPress={() => load(false, true)} tone="secondary" testID="image-loader-display-callback" />
          <ActionButton disabled={!runtimeDemo || busy} label="编辑 · Promise" onPress={() => load(true, false)} testID="image-loader-edit" />
          <ActionButton disabled={!runtimeDemo || busy} label="编辑 · 回调" onPress={() => load(true, true)} tone="secondary" testID="image-loader-edit-callback" />
        </ActionRow>
        {preview ? <Image accessibilityLabel="原生解码结果" resizeMode="contain" source={{ uri: preview }} style={{ height: 180, width: '100%' }} testID="image-loader-preview" /> : null}
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}
