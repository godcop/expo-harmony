import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Image } from 'expo-image';
import { FlipType, ImageManipulator, manipulateAsync, SaveFormat, useImageManipulator } from 'expo-image-manipulator';
import type { ImageRef } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { Image as NativeImage, StyleSheet } from 'react-native';

import sample from '../../assets/image/sample.png';
import { json } from '../format';
import { palette } from '../theme';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const formats = [SaveFormat.JPEG, SaveFormat.PNG, SaveFormat.WEBP];

async function verify() {
  const asset = await Asset.fromModule(sample).downloadAsync();
  if (!asset.localUri) throw new Error('样例没有可读的本地 URI。');

  const context = ImageManipulator.manipulate(asset.localUri);
  const images = new Set<ImageRef>();
  const files: File[] = [];
  const results: string[] = [];

  async function render(width: number, height: number) {
    const image = await context.renderAsync();
    images.add(image);
    if (image.width !== width || image.height !== height) {
      throw new Error(`图片尺寸错误：预期 ${width} × ${height}，实际 ${image.width} × ${image.height}`);
    }

    return image;
  }

  async function save(image: ImageRef, format = SaveFormat.PNG) {
    const result = await image.saveAsync({ format, compress: 0.8, base64: true });
    const file = new File(result.uri);
    files.push(file);
    if (!file.exists || !result.base64 || result.base64 !== await file.base64()) {
      throw new Error(`${format} 文件与 Base64 不一致。`);
    }

    return result;
  }

  try {
    const original = await render(160, 96);
    const baseline = await save(original);
    results.push('✓ 本地图片加载、原始尺寸与 PNG 保存');

    context.resize({ width: 80 });
    const resized = await render(80, 48);
    context.rotate(90).flip(FlipType.Horizontal).flip(FlipType.Vertical);
    await render(48, 80);
    context.crop({ originX: 4, originY: 8, width: 24, height: 40 });
    const cropped = await render(24, 40);
    if (resized.width !== 80 || original.width !== 160) throw new Error('后续操作修改了先前的快照。');
    results.push('✓ 缩放、旋转、双轴翻转、裁剪与快照隔离');

    for (const format of formats) {
      const result = await save(cropped, format);
      const decoded = await Image.loadAsync(result.uri);
      try {
        if (decoded.width !== 24 || decoded.height !== 40 || result.width !== 24 || result.height !== 40) {
          throw new Error(`${format} 文件解码尺寸错误。`);
        }
      } finally {
        decoded.release();
      }
    }
    results.push('✓ JPEG / PNG / WebP 编码、重新解码与 Base64 一致性');

    context.reset().resize({ height: 48 });
    await render(80, 48);
    context.reset().resize({ width: 40, height: 30 });
    await render(40, 30);
    context.reset().rotate(-90).rotate(90).flip(FlipType.Horizontal).flip(FlipType.Horizontal)
      .flip(FlipType.Vertical).flip(FlipType.Vertical);
    if ((await save(await render(160, 96))).base64 !== baseline.base64) throw new Error('反向操作没有恢复原图。');
    results.push('✓ 单边与双边缩放、负角度、翻转往返及 reset');

    for (const operation of [
      () => context.crop({ originX: -1, originY: 0, width: 20, height: 20 }),
      () => context.resize({ width: 0 }),
    ]) {
      let rejected = false;
      try {
        operation();
        images.add(await context.renderAsync());
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('无效参数没有拒绝。');

      context.reset();
      await render(160, 96);
    }
    results.push('✓ 越界裁剪、无效尺寸与 reset 后恢复');

    const source = await Image.loadAsync(sample);
    const shared = ImageManipulator.manipulate(source);
    source.release();
    try {
      const image = await shared.resize({ width: 32 }).renderAsync();
      images.add(image);
      if (image.width !== 32 || image.height !== 19) throw new Error('共享引用尺寸或截断行为错误。');
    } finally {
      shared.release();
    }
    results.push('✓ expo-image 共享引用与来源提前释放');

    const data = `data:image/png;base64,${baseline.base64}`;
    const legacy = await manipulateAsync(data, [{ resize: { width: 80 } }, { rotate: 90 }], { format: SaveFormat.PNG });
    files.push(new File(legacy.uri));
    if (legacy.width !== 48 || legacy.height !== 80) throw new Error('旧版 API 或 data URI 结果错误。');
    results.push('✓ data URI 与官方 manipulateAsync');

    const saving = original.saveAsync({ format: SaveFormat.PNG });
    original.release();
    images.delete(original);
    const saved = new File((await saving).uri);
    files.push(saved);
    if (!saved.exists) throw new Error('释放引用后正在保存的图片丢失。');
    results.push('✓ 保存过程中释放 ImageRef');

    const snapshot = await save(cropped);
    context.reset();
    const restored = await save(await render(160, 96));
    if (restored.base64 !== baseline.base64 || (await save(cropped)).base64 !== snapshot.base64) {
      throw new Error('reset 没有恢复原图，或修改了已返回快照的内容。');
    }
    results.push('✓ reset 恢复原图，已返回快照的内容保持独立');

    return results.join('\n');
  } finally {
    context.release();
    for (const image of images) image.release();
    for (const file of files) if (file.exists) file.delete();
  }
}

export function ImageManipulatorDemo() {
  const uri = NativeImage.resolveAssetSource(sample).uri;
  const context = useImageManipulator(uri);
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const files = useRef<File[]>([]);
  const mounted = useRef(true);
  const [preview, setPreview] = useState(uri);
  const [size, setSize] = useState('160 × 96');
  const [width, setWidth] = useState('80');
  const [angle, setAngle] = useState('90');
  const [format, setFormat] = useState(SaveFormat.PNG);
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

  async function apply(operation: () => void) {
    operation();
    const image = await context.renderAsync();

    try {
      const result = await image.saveAsync({ format, compress: 0.8, base64: true });
      const file = new File(result.uri);
      if (!mounted.current) {
        file.delete();
        return '页面已关闭，保存结果已清理。';
      }

      files.current.push(file);
      setPreview(result.uri);
      setSize(`${result.width} × ${result.height}`);
      return json({ ...result, base64: `${result.base64?.length ?? 0} 个字符` });
    } finally {
      image.release();
    }
  }

  return (
    <>
      <Panel eyebrow="Native API" title="图片处理检查">
        <Note>使用内置 160 × 96 色块图片，检查变换、三种编码格式、共享引用、错误恢复及资源释放。检查生成的临时文件会自动清理。</Note>
        <ActionButton disabled={busy} label="运行图片处理检查" testID="image-manipulator-check" onPress={() => void checks.run(verify)} />
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="useImageManipulator" title="变换与保存">
        <Image source={preview} style={styles.preview} contentFit="contain" testID="image-manipulator-preview" />
        <DataRow label="当前尺寸" value={size} />
        <Note>每次操作基于当前图片继续处理，并保存为选定格式。重置恢复原图，也可以从无效操作中恢复。</Note>
        <ActionRow>
          {formats.map(value => (
            <ActionButton key={value} disabled={busy} label={value.toUpperCase()} testID={`image-manipulator-format-${value}`} tone={format === value ? 'primary' : 'secondary'} onPress={() => setFormat(value)} />
          ))}
        </ActionRow>
        <Field label="目标宽度（像素）" keyboardType="numeric" value={width} onChangeText={setWidth} />
        <Field label="旋转角度（正数顺时针）" keyboardType="numbers-and-punctuation" value={angle} onChangeText={setAngle} />
        <ActionRow>
          <ActionButton disabled={busy} label="缩放" testID="image-manipulator-resize" onPress={() => void action.run(() => apply(() => context.resize({ width: Number(width) })))} />
          <ActionButton disabled={busy} label="旋转" testID="image-manipulator-rotate" onPress={() => void action.run(() => apply(() => context.rotate(Number(angle))))} />
          <ActionButton disabled={busy} label="水平翻转" testID="image-manipulator-flip-horizontal" tone="secondary" onPress={() => void action.run(() => apply(() => context.flip(FlipType.Horizontal)))} />
          <ActionButton disabled={busy} label="垂直翻转" testID="image-manipulator-flip-vertical" tone="secondary" onPress={() => void action.run(() => apply(() => context.flip(FlipType.Vertical)))} />
          <ActionButton disabled={busy} label="裁剪左上 24 × 24" testID="image-manipulator-crop" tone="secondary" onPress={() => void action.run(() => apply(() => context.crop({ originX: 0, originY: 0, width: 24, height: 24 })))} />
          <ActionButton disabled={busy} label="重置原图" testID="image-manipulator-reset" tone="secondary" onPress={() => void action.run(() => apply(() => context.reset()))} />
        </ActionRow>
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { height: 190, borderRadius: 12, backgroundColor: palette.surfaceRaised },
});
