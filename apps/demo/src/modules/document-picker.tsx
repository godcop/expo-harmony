import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useState } from 'react';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function DocumentPickerDemo() {
  const [type, setType] = useState('*/*');
  const [multiple, setMultiple] = useState(false);
  const [copy, setCopy] = useState(true);
  const [assets, setAssets] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const picker = useAsyncResult();
  const reader = useAsyncResult();
  const checks = useAsyncResult();
  const busy = picker.state.phase === 'running' || reader.state.phase === 'running' || checks.state.phase === 'running';

  const pick = (options?: DocumentPicker.DocumentPickerOptions) => picker.run(async () => {
    setAssets([]);
    reader.clear();
    checks.clear();

    const result = await DocumentPicker.getDocumentAsync(options);
    if (result.canceled) {
      if (result.assets !== null) throw new Error('取消选择时 assets 应为 null。');

      return '取消结果通过：canceled = true，assets = null。';
    }
    if (result.assets.length === 0 || (!options?.multiple && result.assets.length !== 1)) {
      throw new Error('所选文件数量与单选 / 多选配置不符。');
    }
    for (const asset of result.assets) {
      if (!asset.name || !asset.uri || !Number.isSafeInteger(asset.lastModified) || asset.lastModified < 0) {
        throw new Error(`文件信息无效：${json(asset)}`);
      }
    }

    setAssets(result.assets);

    return json(result);
  });

  const read = () => reader.run(() => {
    const rows: string[] = [];

    for (const asset of assets) {
      const file = new File(asset.uri);
      if (!file.exists) throw new Error(`文件无法读取：${asset.uri}`);
      if (asset.size !== undefined && file.size !== asset.size) {
        throw new Error(`${asset.name} 的返回大小与实际文件不符。`);
      }

      const handle = file.open();
      try {
        const bytes = handle.readBytes(Math.min(file.size, 64));
        rows.push(`${asset.name}：${file.size} B，前 ${bytes.length} 字节 ${Array.from(bytes).join(' ')}`);
      } finally {
        handle.close();
      }
    }

    return rows.join('\n');
  });

  const empty = () => checks.run(async () => {
    try {
      await DocumentPicker.getDocumentAsync({ type: [] });
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ERR_DOCUMENT_PICKER_OPTIONS_EMPTY_LIST') {
        throw new Error(`空类型列表返回了非预期错误：${String(error)}`);
      }

      return '空类型列表校验通过：ERR_DOCUMENT_PICKER_OPTIONS_EMPTY_LIST。';
    }

    throw new Error('空类型列表未被拒绝。');
  });

  const concurrent = () => checks.run(async () => {
    reader.clear();

    const results = await Promise.allSettled([
      DocumentPicker.getDocumentAsync(),
      DocumentPicker.getDocumentAsync(),
    ]);
    const [first, second] = results;
    if (first.status !== 'fulfilled') throw new Error(`首次选择失败：${String(first.reason)}`);
    if (second.status !== 'rejected' || second.reason?.code !== 'ERR_PICKING_IN_PROGRESS') {
      throw new Error('并发选择未返回 ERR_PICKING_IN_PROGRESS。');
    }

    setAssets(first.value.assets ?? []);

    return `并发保护通过：ERR_PICKING_IN_PROGRESS。\n首次选择：${json(first.value)}`;
  });

  return (
    <>
      <Panel eyebrow="系统选择器" title="文件类型与选择方式">
        <Field label="MIME 类型（多个用英文逗号分隔）" onChangeText={setType} testID="document-picker-type" value={type} />
        <ActionRow>
          <ActionButton disabled={busy} label={`多选：${multiple ? '开' : '关'}`} onPress={() => setMultiple(value => !value)} testID="document-picker-multiple" tone="secondary" />
          <ActionButton disabled={busy} label={`复制到缓存：${copy ? '开' : '关'}`} onPress={() => setCopy(value => !value)} testID="document-picker-copy" tone="secondary" />
        </ActionRow>
        <ActionRow>
          <ActionButton disabled={busy} label="选择文档" onPress={() => void pick({ type: type.split(',').map(value => value.trim()), multiple, copyToCacheDirectory: copy })} testID="document-picker-select" />
          <ActionButton disabled={busy} label="使用默认参数" onPress={() => void pick()} testID="document-picker-default" tone="secondary" />
        </ActionRow>
        <Note>可输入 text/plain、application/pdf 或 image/*。在系统选择器中返回可验证取消结果。</Note>
        <Note>当前 API 24 手机模拟器的“浏览 → 我的手机”界面可能仅允许单选，多选能力取决于系统选择器。</Note>
        <ResultPanel state={picker.state} />
      </Panel>

      <Panel eyebrow="返回结果" title="文件信息与缓存读取">
        <DataRow label="文件数量" value={assets.length} />
        {assets.map((asset, index) => (
          <Panel key={`${index}-${asset.uri}`} title={asset.name}>
            <DataRow label="MIME" value={asset.mimeType ?? '未知'} />
            <DataRow label="大小" value={asset.size === undefined ? '未知' : `${asset.size} B`} />
            <DataRow label="修改时间（毫秒）" value={asset.lastModified} />
            <DataRow label="URI" value={asset.uri} />
          </Panel>
        ))}
        <ActionButton disabled={busy || assets.length === 0} label="读取文件并核对大小" onPress={() => void read()} testID="document-picker-read" tone="secondary" />
        <Note>读取每个文件的前 64 字节并核对大小。关闭缓存复制后，系统原始 URI 可能无法被 Expo FileSystem 读取。</Note>
        <ResultPanel state={reader.state} />
      </Panel>

      <Panel eyebrow="错误契约" title="参数校验与并发保护">
        <ActionRow>
          <ActionButton disabled={busy} label="验证空类型列表" onPress={() => void empty()} testID="document-picker-empty" tone="secondary" />
          <ActionButton disabled={busy} label="验证并发选择" onPress={() => void concurrent()} testID="document-picker-concurrent" tone="secondary" />
        </ActionRow>
        <Note>并发验证会打开一次选择器，选择文件或返回后查看结果。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
