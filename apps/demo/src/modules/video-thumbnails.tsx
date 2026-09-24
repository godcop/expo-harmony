import { Asset } from 'expo-asset';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import type { VideoThumbnailsOptions, VideoThumbnailsResult } from 'expo-video-thumbnails';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import sample from '../../assets/live-photo/video.mp4';
import { json } from '../format';
import { palette } from '../theme';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

async function load() {
  const asset = await Asset.fromModule(sample).downloadAsync();
  if (!asset.localUri) throw new Error('样例没有可读的本地 URI。');

  return asset.localUri;
}

async function verify() {
  const uri = await load();
  const directory = new Directory(Paths.cache, `video-thumbnails-${Date.now()}`);
  const files: File[] = [];
  const results: string[] = [];
  directory.create();

  async function capture(source: string, options?: VideoThumbnailsOptions) {
    const result = await getThumbnailAsync(source, options);
    files.push(new File(result.uri));

    return result;
  }

  async function inspect(result: VideoThumbnailsResult) {
    const file = new File(result.uri);
    const bytes = await file.bytes();
    if (!file.exists || file.size <= 0 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new Error('输出不是可读的 JPEG 文件。');
    }
    if (result.width !== 640 || result.height !== 480 || !result.uri.startsWith('file://')) {
      throw new Error(`缩略图尺寸或 URI 错误：${json(result)}`);
    }

    const image = await Image.loadAsync(result.uri);
    try {
      if (image.width !== result.width || image.height !== result.height) {
        throw new Error('JPEG 解码尺寸与返回值不一致。');
      }
    } finally {
      image.release();
    }
  }

  try {
    await inspect(await capture(uri));
    results.push('✓ 默认首帧、640 × 480 尺寸、JPEG 文件与重新解码');

    await inspect(await capture(uri, { time: 1000, quality: 0.8 }));
    await inspect(await capture(uri, { time: 1000.9, quality: 0 }));
    await inspect(await capture(uri, { time: 2000, quality: 1 }));
    results.push('✓ 毫秒时间、小数截断与 quality 0 / 0.8 / 1');

    const special = new File(directory, '视频 100% #.mp4');
    new File(uri).copy(special);
    await inspect(await capture(special.uri));
    await inspect(await capture(decodeURIComponent(special.uri.replace(/^file:\/\//, ''))));
    await inspect(await capture(special.uri.replace(/^file:/, 'FILE:')));
    results.push('✓ 中文、空格、百分号、井号、绝对路径与大写 scheme');

    const parallel = await Promise.allSettled([capture(uri, { time: 0 }), capture(uri, { time: 2000 })]);
    for (const result of parallel) {
      if (result.status === 'rejected') throw new Error(`并发提帧失败：${String(result.reason)}`);
      await inspect(result.value);
    }
    if (new Set(files.map(file => file.uri)).size !== files.length) throw new Error('多个请求覆盖了同一个输出文件。');
    results.push('✓ 并发提帧与独立输出文件');

    const corrupt = new File(directory, 'corrupt.mp4');
    corrupt.write('not a video');
    for (const operation of [
      () => capture(''),
      () => capture(new File(directory, 'missing.mp4').uri),
      () => capture(corrupt.uri),
      () => capture(uri, { quality: -1 }),
      () => capture(uri, { quality: 2 }),
      () => capture(uri, { time: Number.MAX_VALUE }),
    ]) {
      let rejected = false;
      try {
        await operation();
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('无效输入没有拒绝。');
    }

    await inspect(await capture(uri));
    results.push('✓ 无效 URI、缺失/损坏文件、参数越界与失败后恢复');

    return results.join('\n');
  } finally {
    for (const file of files) if (file.exists) file.delete();
    if (directory.exists) directory.delete();
  }
}

export function VideoThumbnailsDemo() {
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const files = useRef<File[]>([]);
  const mounted = useRef(true);
  const [preview, setPreview] = useState<VideoThumbnailsResult | null>(null);
  const [source, setSource] = useState('');
  const [time, setTime] = useState('1000');
  const [quality, setQuality] = useState('0.8');
  const [headers, setHeaders] = useState('{}');
  const busy = action.state.phase === 'running' || checks.state.phase === 'running';

  useEffect(() => {
    mounted.current = true;
    const outputs = files.current;

    return () => {
      mounted.current = false;
      for (const file of outputs) if (file.exists) file.delete();
      outputs.length = 0;
    };
  }, []);

  async function capture(uri: string, options?: VideoThumbnailsOptions) {
    const result = await getThumbnailAsync(uri, options);
    const file = new File(result.uri);
    if (!mounted.current) {
      file.delete();
      return '页面已关闭，生成结果已清理。';
    }

    files.current.push(file);
    setPreview(result);

    return json({ ...result, bytes: file.size });
  }

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'video/*', copyToCacheDirectory: true });
    if (result.canceled) return '已取消选择。';

    const asset = result.assets[0];
    if (!asset) throw new Error('选择器未返回视频。');

    const file = new File(asset.uri);
    if (!mounted.current) {
      if (file.exists) file.delete();
      return '页面已关闭，选择结果已清理。';
    }

    files.current.push(file);
    setSource(asset.uri);

    return capture(asset.uri, { time: Number(time), quality: Number(quality) });
  }

  return (
    <>
      <Panel eyebrow="Native API" title="视频缩略图检查">
        <Note>使用内置 640 × 480、3 秒视频，检查提帧、JPEG 解码、特殊文件名、并发及错误恢复。检查生成的临时文件会自动清理。</Note>
        <ActionButton disabled={busy} label="运行缩略图检查" testID="video-thumbnails-check" onPress={() => void checks.run(verify)} />
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="getThumbnailAsync" title="提取与预览">
        {preview
          ? <Image source={preview.uri} style={styles.preview} contentFit="contain" testID="video-thumbnails-preview" />
          : <Note>生成缩略图后，这里显示实际 JPEG 图片。</Note>}
        <DataRow label="当前尺寸" value={preview ? `${preview.width} × ${preview.height}` : '尚未生成'} />
        <ActionRow>
          <ActionButton disabled={busy} label="默认首帧" testID="video-thumbnails-default" onPress={() => void action.run(async () => capture(await load()))} />
          <ActionButton disabled={busy} label="按参数提取样例" testID="video-thumbnails-sample" tone="secondary" onPress={() => void action.run(async () => capture(await load(), { time: Number(time), quality: Number(quality) }))} />
        </ActionRow>
        <Field label="时间（毫秒）" keyboardType="numbers-and-punctuation" value={time} onChangeText={setTime} testID="video-thumbnails-time" />
        <Field label="JPEG 质量（0–1）" keyboardType="decimal-pad" value={quality} onChangeText={setQuality} testID="video-thumbnails-quality" />
        <Note>HarmonyOS 取最近关键帧，因此相邻时间可能得到同一画面。</Note>
      </Panel>

      <Panel eyebrow="Source" title="本地文件与远程视频">
        <Field label="视频 URI" value={source} onChangeText={setSource} placeholder="file:///…/video.mp4 或 https://…" testID="video-thumbnails-source" />
        <Field label="HTTP 请求头（JSON）" value={headers} onChangeText={setHeaders} testID="video-thumbnails-headers" />
        <ActionRow>
          <ActionButton disabled={busy || !source} label="从地址提取" testID="video-thumbnails-custom" onPress={() => void action.run(() => capture(source, { time: Number(time), quality: Number(quality), headers: JSON.parse(headers) }))} />
          <ActionButton disabled={busy} label="选择视频" testID="video-thumbnails-pick" tone="secondary" onPress={() => void action.run(pick)} />
        </ActionRow>
        <Note>HTTP(S) 视频支持自定义请求头；不支持 HLS、DASH 或直播。选择文件通过系统授权，不申请媒体库读取权限。</Note>
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { height: 210, borderRadius: 12, backgroundColor: palette.surfaceRaised },
});
