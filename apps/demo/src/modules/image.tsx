import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Image, useImage } from 'expo-image';
import type { ImageContentFit, ImageSource } from 'expo-image';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import animation from '../../assets/image/animation.gif';
import sample from '../../assets/image/sample.png';
import { json } from '../format';
import { palette } from '../theme';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const fits: ImageContentFit[] = ['contain', 'cover', 'fill', 'none', 'scale-down'];
const placeholder = { blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' };

function ReferencePreview() {
  const [error, setError] = useState('');
  const image = useImage(sample, { maxWidth: 80, maxHeight: 80, onError: error => setError(error.message) });

  return (
    <Panel eyebrow="useImage / ImageRef" title="共享引用">
      {image ? <Image source={image} style={styles.reference} contentFit="contain" testID="image-reference" /> : null}
      <DataRow label="引用尺寸" value={image ? `${image.width} × ${image.height} · ${image.mediaType}` : error || '加载中'} />
      <Note>通过官方 useImage 加载并将 ImageRef 传回原生视图。清理缓存后，这张仍被引用的图片应继续显示。</Note>
    </Panel>
  );
}

export function ImageDemo() {
  const view = useRef<Image>(null);
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const [source, setSource] = useState<ImageSource | number>(sample);
  const [uri, setUri] = useState('https://reactnative.dev/img/tiny_logo.png');
  const [fit, setFit] = useState<ImageContentFit>('contain');
  const [tint, setTint] = useState(false);
  const [blur, setBlur] = useState(false);
  const [mounted, setMounted] = useState(true);
  const [position, setPosition] = useState(false);
  const [status, setStatus] = useState('等待加载');
  const [events, setEvents] = useState<string[]>([]);
  const [hashes, setHashes] = useState<{ blurhash: string; thumbhash: string }>();
  const busy = action.state.phase === 'running' || checks.state.phase === 'running';

  function record(name: string, detail = '') {
    setEvents(events => [...events.slice(-9), `${name}${detail ? `: ${detail}` : ''}`]);
  }

  function load(source: ImageSource | number) {
    setSource(source);
    setMounted(true);
    setStatus('等待加载');
  }

  async function data() {
    const asset = await Asset.fromModule(sample).downloadAsync();
    if (!asset.localUri) throw new Error('样例没有可读的本地 URI。');

    return `data:image/png;base64,${await new File(asset.localUri).base64()}`;
  }

  async function verify() {
    const results: string[] = [];
    const ref = await Image.loadAsync(sample, { maxWidth: 80, maxHeight: 80, tintColor: '#007AFF' });

    try {
      if (ref.width !== 80 || ref.height !== 48 || ref.isAnimated) throw new Error(`ImageRef 尺寸或类型错误：${ref.width} × ${ref.height}`);
      results.push('✓ loadAsync：缩放、着色、ImageRef 元数据');

      const [blurhash, thumbhash] = await Promise.all([
        Image.generateBlurhashAsync(ref, [4, 3]),
        Image.generateThumbhashAsync(ref),
      ]);
      if (!blurhash || !thumbhash) throw new Error('哈希生成结果为空。');
      setHashes({ blurhash, thumbhash });
      results.push('✓ BlurHash / ThumbHash 编码');

      for (const source of [{ blurhash }, { thumbhash }]) {
        const image = await Image.loadAsync(source, { maxWidth: 8, maxHeight: 8 });
        try {
          if (image.width <= 0 || image.width > 8 || image.height <= 0 || image.height > 8) throw new Error('哈希解码尺寸超出上限。');
        } finally {
          image.release();
        }
      }
      results.push('✓ 两种哈希解码与最大尺寸');

      const image = await Image.loadAsync(await data());
      try {
        if (image.width !== 160 || image.height !== 96) throw new Error('data URI 解码尺寸错误。');
      } finally {
        image.release();
      }
      results.push('✓ data URI 解码');

      const gif = await Image.loadAsync(animation);
      try {
        if (!gif.isAnimated || gif.width !== 64 || gif.height !== 40) throw new Error('GIF 动画元数据错误。');
      } finally {
        gif.release();
      }
      results.push('✓ GIF 多帧解码');

      let rejected = false;
      try {
        const invalid = await Image.loadAsync('data:image/png;base64,AAAA');
        invalid.release();
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('损坏图片没有拒绝加载。');
      results.push('✓ 损坏图片错误返回');

      if (!await Image.clearMemoryCache() || !await Image.clearDiskCache()) throw new Error('缓存清理失败。');
      if (ref.width !== 80) throw new Error('缓存清理损坏了活动 ImageRef。');
      results.push('✓ 缓存清理与活动引用保留');

      return results.join('\n');
    } finally {
      ref.release();
    }
  }

  return (
    <>
      <Panel eyebrow="Image" title="图片显示与事件">
        <View style={styles.preview}>
          {mounted
            ? (
                <Image
                  ref={view}
                  source={source}
                  placeholder={placeholder}
                  contentFit={fit}
                  contentPosition={position ? { left: 0, top: 0 } : 'center'}
                  cachePolicy="memory-disk"
                  blurRadius={blur ? 8 : 0}
                  tintColor={tint ? palette.signal : undefined}
                  transition={250}
                  style={StyleSheet.absoluteFill}
                  onLoadStart={() => {
                    setStatus('加载中');
                    record('onLoadStart');
                  }}
                  onLoad={(event) => {
                    setStatus(`${event.source.width} × ${event.source.height} · ${event.cacheType}`);
                    record('onLoad', json(event));
                  }}
                  onDisplay={() => record('onDisplay')}
                  onProgress={event => record('onProgress', `${event.loaded}/${event.total}`)}
                  onError={(event) => {
                    setStatus(event.error);
                    record('onError', event.error);
                  }}
                  accessibilityLabel="Expo Image 色块样例"
                  testID="image-preview"
                />
              )
            : <Text style={styles.text}>组件已卸载</Text>}
        </View>
        <DataRow label="状态" value={status} />
        <ActionRow>
          <ActionButton label="本地 PNG" onPress={() => load(sample)} testID="image-local" />
          <ActionButton label="GIF 动画" onPress={() => load(animation)} testID="image-animation" tone="secondary" />
          <ActionButton
            disabled={busy}
            label="data URI"
            onPress={() => void action.run(async () => {
              load({ uri: await data() });

              return '已提交 data URI，查看加载事件。';
            })}
            testID="image-data"
            tone="secondary"
          />
          <ActionButton label="损坏图片" onPress={() => load({ uri: 'data:image/png;base64,AAAA' })} testID="image-invalid" tone="secondary" />
        </ActionRow>
        <ActionRow>
          <ActionButton label={`适配：${fit}`} onPress={() => setFit(fits[(fits.indexOf(fit) + 1) % fits.length] ?? 'contain')} testID="image-fit" tone="secondary" />
          <ActionButton label={`位置：${position ? '左上' : '居中'}`} onPress={() => setPosition(value => !value)} testID="image-position" tone="secondary" />
          <ActionButton label={`着色：${tint ? '开' : '关'}`} onPress={() => setTint(value => !value)} testID="image-tint" tone="secondary" />
          <ActionButton label={`模糊：${blur ? '开' : '关'}`} onPress={() => setBlur(value => !value)} testID="image-blur" tone="secondary" />
        </ActionRow>
        <ActionRow>
          <ActionButton
            disabled={!mounted || busy}
            label="暂停"
            onPress={() => void action.run(async () => {
              await view.current?.stopAnimating();

              return '已暂停';
            })}
            testID="image-stop"
            tone="secondary"
          />
          <ActionButton
            disabled={!mounted || busy}
            label="播放"
            onPress={() => void action.run(async () => {
              await view.current?.startAnimating();

              return '已播放';
            })}
            testID="image-play"
            tone="secondary"
          />
          <ActionButton
            disabled={!mounted || busy}
            label="重新加载"
            onPress={() => void action.run(async () => {
              await view.current?.reloadAsync();

              return '已重新加载';
            })}
            testID="image-reload"
            tone="secondary"
          />
          <ActionButton label={mounted ? '卸载组件' : '挂载组件'} onPress={() => setMounted(value => !value)} testID="image-mount" tone="secondary" />
        </ActionRow>
        <Text selectable style={styles.events} testID="image-events">{events.join('\n') || '尚未收到事件'}</Text>
      </Panel>

      <Panel eyebrow="Native API" title="加载、哈希与资源检查">
        <Note>使用内置样例检查缩放、着色、ImageRef、两种哈希、data URI、动画、错误和缓存清理。临时引用在检查后释放。</Note>
        <ActionButton disabled={busy} label="运行图片检查" onPress={() => void checks.run(verify)} testID="image-check" />
        <ResultPanel state={checks.state} />
        {hashes
          ? (
              <View style={styles.hashes}>
                <Image source={{ blurhash: hashes.blurhash }} style={styles.hash} contentFit="contain" testID="image-blurhash" />
                <Image source={{ thumbhash: hashes.thumbhash }} style={styles.hash} contentFit="contain" testID="image-thumbhash" />
              </View>
            )
          : null}
      </Panel>

      <ReferencePreview />

      <Panel eyebrow="Network / Cache" title="网络加载与预取">
        <Field label="图片 URL" onChangeText={setUri} value={uri} testID="image-uri" />
        <ActionRow>
          <ActionButton disabled={busy} label="加载 URL" onPress={() => load({ uri })} testID="image-url" />
          <ActionButton
            disabled={busy}
            label="预取并查询缓存"
            onPress={() => void action.run(async () => {
              const success = await Image.prefetch(uri, 'memory-disk');
              if (!success) throw new Error('预取失败。');

              const path = await Image.getCachePathAsync(uri);
              if (!path) throw new Error('预取后没有找到磁盘缓存。');

              const file = new File(path.startsWith('/') ? `file://${path}` : path);
              const image = await Image.loadAsync(file.uri);
              try {
                return json({ prefetched: success, bytes: file.size, width: image.width, height: image.height, path });
              } finally {
                image.release();
              }
            })}
            testID="image-prefetch"
            tone="secondary"
          />
          <ActionButton
            disabled={busy}
            label="清理缓存"
            onPress={() => void action.run(async () => json({
              memory: await Image.clearMemoryCache(), disk: await Image.clearDiskCache(),
            }))}
            testID="image-clear-cache"
            tone="secondary"
          />
        </ActionRow>
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { height: 190, overflow: 'hidden', borderRadius: 12, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  reference: { width: '100%', height: 96 },
  hashes: { flexDirection: 'row', gap: 12 },
  hash: { flex: 1, height: 96, borderRadius: 8 },
  text: { color: palette.muted },
  events: { color: palette.muted, fontSize: 11, lineHeight: 16, fontFamily: 'monospace' },
});
