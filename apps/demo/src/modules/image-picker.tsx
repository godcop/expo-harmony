import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function ImagePickerDemo() {
  const [quality, setQuality] = useState('1');
  const [limit, setLimit] = useState('3');
  const [base64, setBase64] = useState(false);
  const [exif, setExif] = useState(false);
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const permissions = useAsyncResult();
  const picker = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [permissions, picker, checks].some(action => action.state.phase === 'running');

  const inspect = () => permissions.run(async () => {
    const [camera, library] = await Promise.all([
      ImagePicker.getCameraPermissionsAsync(),
      ImagePicker.getMediaLibraryPermissionsAsync(),
    ]);

    return json({ camera, library });
  });

  const launch = (capture: boolean, options: ImagePicker.ImagePickerOptions) => picker.run(async () => {
    const value = Number(quality);
    if (!quality.trim() || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error('图片质量需为 0 至 1 的数字。');
    }
    const count = Number(limit);
    if (options.allowsMultipleSelection && (!limit.trim() || !Number.isSafeInteger(count) || count < 0)) {
      throw new Error('多选上限需为非负整数。');
    }

    const config = { quality: value, base64, exif, selectionLimit: count, ...options };
    const result = capture
      ? await ImagePicker.launchCameraAsync(config)
      : await ImagePicker.launchImageLibraryAsync(config);
    setAssets(result.assets ?? []);

    if (result.canceled) {
      if (result.assets !== null) throw new Error('取消选择时 assets 应为 null。');
      return '取消返回值校验通过：canceled = true，assets = null。';
    }
    if (result.assets.length === 0) throw new Error('成功结果未包含媒体资源。');
    if (result.assets.length > (options.allowsMultipleSelection ? count || Infinity : 1)) {
      throw new Error('返回数量超过选择上限。');
    }

    const rows: string[] = [];
    for (const asset of result.assets) {
      const file = new File(asset.uri);
      if (!file.exists || file.size <= 0 || !Number.isFinite(asset.width) || !Number.isFinite(asset.height)
        || asset.width <= 0 || asset.height <= 0) {
        throw new Error(`文件或尺寸无效：${asset.uri}`);
      }
      if (String(Platform.OS) === 'harmony' && asset.fileSize !== file.size) {
        throw new Error(`返回文件大小与实际内容不符：${asset.fileSize} / ${file.size}`);
      }
      if (asset.type === 'image' && base64) {
        if (!asset.base64) throw new Error('请求 Base64 后未返回图片内容。');
        if (value === 1 && asset.base64 !== await file.base64()) {
          throw new Error('原始质量的 Base64 与输出文件不符。');
        }
      }
      if (asset.type === 'image' && exif && (asset.exif === null || typeof asset.exif !== 'object')) {
        throw new Error('请求 EXIF 后未返回元数据对象。');
      }
      if (asset.type === 'video' && (asset.duration == null || !Number.isFinite(asset.duration) || asset.duration < 0)) {
        throw new Error('视频时长无效。');
      }
      rows.push(`${asset.fileName ?? asset.type}：文件、尺寸和请求字段通过`);
    }

    return rows.join('\n');
  });

  const verify = () => checks.run(async () => {
    const rows: string[] = [];
    for (const quality of [-0.1, 1.1]) {
      let rejected = false;
      try {
        await ImagePicker.launchImageLibraryAsync({ quality });
      } catch (error) {
        if (!(error instanceof Error)) throw new Error(`未返回错误对象：${String(error)}`);
        rejected = true;
      }
      if (!rejected) throw new Error(`非法 quality ${quality} 未被拒绝。`);
      rows.push(`quality ${quality}：正确拒绝`);
    }

    if (String(Platform.OS) === 'harmony') {
      let rejected = false;
      try {
        await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1] });
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ERR_IMAGE_PICKER_UNSUPPORTED_EDITING') {
          throw new Error(`不支持裁剪的错误码不符：${String(error)}`);
        }
        rejected = true;
      }
      if (!rejected) throw new Error('不支持的裁剪组合未被拒绝。');
      rows.push('固定比例裁剪：正确拒绝');
    }

    const pending = await ImagePicker.getPendingResultAsync();
    if (Platform.OS !== 'android' && pending !== null) throw new Error('非 Android 平台的待恢复结果应为 null。');
    rows.push(`待恢复结果：${json(pending)}`);

    return rows.join('\n');
  });

  return (
    <>
      <Panel eyebrow="权限" title="相机与图库访问">
        <ActionRow>
          <ActionButton disabled={busy} label="读取权限" onPress={() => void inspect()} testID="image-picker-permissions" />
          <ActionButton disabled={busy} label="申请相机权限" onPress={() => void permissions.run(async () => json(await ImagePicker.requestCameraPermissionsAsync()))} testID="image-picker-camera-permission" tone="secondary" />
          <ActionButton disabled={busy} label="申请图库权限" onPress={() => void permissions.run(async () => json(await ImagePicker.requestMediaLibraryPermissionsAsync()))} testID="image-picker-library-permission" tone="secondary" />
        </ActionRow>
        <Note>HarmonyOS 图库选择无需全库权限；拍摄需要相机权限。可先拒绝再重新申请，观察 canAskAgain 的变化。</Note>
        <ResultPanel state={permissions.state} />
      </Panel>

      <Panel eyebrow="图库" title="图片、视频与多选">
        <Field keyboardType="decimal-pad" label="图片质量（0–1）" onChangeText={setQuality} testID="image-picker-quality" value={quality} />
        <Field keyboardType="number-pad" label="多选上限（0 为系统最大值）" onChangeText={setLimit} testID="image-picker-limit" value={limit} />
        <ActionRow>
          <ActionButton disabled={busy} label={`Base64：${base64 ? '开' : '关'}`} onPress={() => setBase64(value => !value)} testID="image-picker-base64" tone="secondary" />
          <ActionButton disabled={busy} label={`EXIF：${exif ? '开' : '关'}`} onPress={() => setExif(value => !value)} testID="image-picker-exif" tone="secondary" />
        </ActionRow>
        <ActionRow>
          <ActionButton disabled={busy} label="选择图片" onPress={() => void launch(false, { mediaTypes: ['images'] })} testID="image-picker-image" />
          <ActionButton disabled={busy} label="选择视频" onPress={() => void launch(false, { mediaTypes: ['videos'] })} testID="image-picker-video" tone="secondary" />
          <ActionButton disabled={busy} label="混合多选" onPress={() => void launch(false, { mediaTypes: ['images', 'videos'], allowsMultipleSelection: true })} testID="image-picker-multiple" tone="secondary" />
          <ActionButton disabled={busy} label="选择并编辑" onPress={() => void launch(false, { mediaTypes: ['images'], allowsEditing: true })} testID="image-picker-edit" tone="secondary" />
        </ActionRow>
        <Note>可在系统选择器中返回以验证取消。HarmonyOS 编辑入口由用户选择是否使用；质量小于 1 时重新编码图片。</Note>
      </Panel>

      <Panel eyebrow="拍摄" title="系统相机与录像">
        <ActionRow>
          <ActionButton disabled={busy} label="后置拍照" onPress={() => void launch(true, { mediaTypes: ['images'], cameraType: ImagePicker.CameraType.back })} testID="image-picker-camera" />
          <ActionButton disabled={busy} label="前置拍照" onPress={() => void launch(true, { mediaTypes: ['images'], cameraType: ImagePicker.CameraType.front })} testID="image-picker-front" tone="secondary" />
          <ActionButton disabled={busy} label="录像（10 秒）" onPress={() => void launch(true, { mediaTypes: ['videos'], videoMaxDuration: 10 })} testID="image-picker-record" tone="secondary" />
        </ActionRow>
        <Note>拍摄复用上方质量、Base64 和 EXIF 设置。模拟器的相机能力取决于系统镜像。</Note>
      </Panel>

      <Panel eyebrow="返回结果" title="文件、元数据与预览">
        <DataRow label="资源数量" value={assets.length} />
        <ResultPanel state={picker.state} />
        {assets.map((asset, index) => (
          <Panel key={asset.uri} title={`${index + 1}. ${asset.fileName ?? asset.type}`}>
            {asset.type === 'image' ? <Image accessibilityLabel={`所选图片 ${index + 1}`} resizeMode="contain" source={{ uri: asset.uri }} style={styles.preview} /> : null}
            <DataRow label="类型 / 尺寸" value={`${asset.mimeType ?? asset.type} · ${asset.width} × ${asset.height}`} />
            <DataRow label="文件大小" value={`${asset.fileSize ?? '未知'} B`} />
            <DataRow label="URI" value={asset.uri} />
            <DataRow label="资源 ID" value={asset.assetId ?? 'null'} />
            {asset.type === 'video' ? <DataRow label="时长" value={`${asset.duration ?? '未知'} ms`} /> : null}
            {asset.base64 ? <DataRow label="Base64 字符数" value={asset.base64.length} /> : null}
            {asset.exif ? <DataRow label="EXIF" value={json(asset.exif)} /> : null}
          </Panel>
        ))}
      </Panel>

      <Panel eyebrow="接口验证" title="参数边界与待恢复结果">
        <ActionButton disabled={busy} label="验证边界" onPress={() => void verify()} testID="image-picker-verify" />
        <Note>检查非法质量、HarmonyOS 不支持的裁剪组合以及非 Android 平台的空待恢复结果。验证后可再次选择文件，检查错误恢复。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 200, borderRadius: 10 },
});
