import { useEvent } from 'expo';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { useReleasingSharedObject } from 'expo-modules-core';
import { isPictureInPictureSupported, useVideoPlayer, VideoView } from 'expo-video';
import type { VideoContentFit, VideoThumbnail } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import sample from '../../assets/live-photo/video.mp4';
import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, Tag, useAsyncResult } from '../ui';

async function load() {
  const asset = await Asset.fromModule(sample).downloadAsync();
  if (!asset.localUri) throw new Error('样例没有可读的本地 URI。');

  return asset.localUri;
}

async function until(condition: () => boolean, message: string) {
  const deadline = Date.now() + 10_000;

  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);

    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function Thumbnail({ image }: { image: VideoThumbnail }) {
  const source = useReleasingSharedObject(() => image, [image]);

  return <Image source={source} style={styles.thumbnail} contentFit="contain" testID="video-thumbnail" />;
}

export function VideoDemo() {
  const player = useVideoPlayer(null, (instance) => {
    instance.muted = true;
    instance.timeUpdateEventInterval = 0.1;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', {
    currentTime: player.currentTime,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
    bufferedPosition: player.bufferedPosition,
  });
  const [attached, setAttached] = useState(true);
  const [controls, setControls] = useState(true);
  const [fit, setFit] = useState<VideoContentFit>('contain');
  const [source, setSource] = useState('');
  const [headers, setHeaders] = useState('{}');
  const [preview, setPreview] = useState<VideoThumbnail | null>(null);
  const [frames, setFrames] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const view = useRef<VideoView>(null);
  const mounted = useRef(true);
  const checks = useAsyncResult();
  const action = useAsyncResult();
  const busy = checks.state.phase === 'running' || action.state.phase === 'running';

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  async function capture() {
    const thumbnails = await player.generateThumbnailsAsync([0, 1], { maxWidth: 160, maxHeight: 120 });
    if (!mounted.current) {
      thumbnails.forEach(image => image.release());
      throw new Error('页面已关闭，缩略图已释放。');
    }

    const result = thumbnails.map(image => ({
      width: image.width,
      height: image.height,
      requestedTime: image.requestedTime,
    }));
    const preview = thumbnails[1];
    thumbnails.forEach((image) => {
      if (image !== preview) image.release();
    });
    if (!preview) throw new Error('没有返回第二张缩略图。');

    setPreview(preview);

    return result;
  }

  async function replace(uri: string) {
    await player.replaceAsync(uri);
    await until(() => player.status === 'readyToPlay' || player.status === 'error', '视频未能完成解码准备。');
    if (player.status === 'error') throw new Error('视频进入错误状态，请查看状态卡片。');

    setSource(uri);

    return json({ status: player.status, duration: player.duration, track: player.videoTrack });
  }

  async function verify() {
    const uri = await load();
    const results: string[] = [];
    const events = { source: 0, time: 0, end: 0, playing: 0 };
    const subscriptions = [
      player.addListener('sourceLoad', () => events.source++),
      player.addListener('timeUpdate', () => events.time++),
      player.addListener('playToEnd', () => events.end++),
      player.addListener('playingChange', () => events.playing++),
    ];

    try {
      player.pause();
      player.loop = false;
      player.playbackRate = 1;
      await replace(uri);

      const size = player.videoTrack?.size;
      if (Math.abs(player.duration - 3) > 0.2 || size?.width !== 640 || size.height !== 480 || events.source !== 1) {
        throw new Error(`源信息不符合样例：${json({ duration: player.duration, size, events })}`);
      }
      results.push('✓ 本地源、sourceLoad、3 秒时长与 640 × 480 视频轨道');

      player.play();
      await until(() => player.playing && player.currentTime > 0.25 && events.time > 0, '播放或进度事件未到达。');
      player.pause();
      await until(() => !player.playing, '暂停未生效。');
      player.currentTime = 1;
      await until(() => Math.abs(player.currentTime - 1) < 0.15, '绝对跳转未生效。');
      player.seekBy(0.5);
      await until(() => Math.abs(player.currentTime - 1.5) < 0.15, '相对跳转未生效。');
      results.push('✓ 播放、暂停、timeUpdate 与绝对/相对跳转');

      player.muted = false;
      player.volume = 0.25;
      player.playbackRate = 2;
      if (player.muted || player.volume !== 0.25 || player.playbackRate !== 2) throw new Error('播放属性读写不一致。');
      player.muted = true;
      player.playbackRate = 1;
      player.loop = true;
      player.currentTime = 2.5;
      await until(() => player.currentTime > 2.3, '循环前跳转未生效。');
      player.play();
      await until(() => player.playing && player.currentTime < 1, '循环播放没有回到开头。');
      player.loop = false;
      await until(() => events.end > 0 && !player.playing, '播放结束事件未到达。');
      player.replay();
      await until(() => player.playing && player.currentTime < 1, '重播未从开头开始。');
      player.pause();
      await until(() => !player.playing, '重播后暂停未生效。');
      results.push('✓ 音量、静音、倍速、循环、playToEnd 与 replay');

      const thumbnails = await capture();
      if (thumbnails.length !== 2 || thumbnails.some((image, index) => (
        image.width !== 160 || image.height !== 120 || image.requestedTime !== index
      ))) {
        throw new Error(`缩略图信息不符合预期：${json(thumbnails)}`);
      }
      results.push('✓ 两张 160 × 120 原生 SharedRef 缩略图，第二张交给 expo-image 显示');

      let rejected = false;
      try {
        player.volume = -1;
      } catch {
        rejected = true;
      }
      if (!rejected || player.volume !== 0.25) throw new Error('无效音量没有被拒绝，或修改了旧值。');

      rejected = false;
      try {
        await player.replaceAsync('invalid://video');
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('非法数据源没有拒绝 Promise。');
      await replace(uri);
      results.push('✓ 参数校验、非法源拒绝与重新加载恢复');

      await player.replaceAsync(sample);
      await until(() => player.status === 'readyToPlay', '官方 JS 未能解析并播放打包资源。');
      results.push('✓ 官方 JS 解析数字资源 ID，开发环境从 Metro HTTP 地址加载');

      return `${results.join('\n')}\n\n${json({ events, thumbnails })}`;
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${results.join('\n')}\n${json({
        status: player.status,
        playing: player.playing,
        currentTime: player.currentTime,
        events,
      })}`);
    } finally {
      subscriptions.forEach(subscription => subscription.remove());
      if (mounted.current) {
        player.pause();
        player.loop = false;
        player.playbackRate = 1;
        player.volume = 1;
        player.muted = true;
      }
    }
  }

  return (
    <>
      <Panel eyebrow="Native API" title="视频播放检查">
        <Note>使用内置 640 × 480、3 秒视频，在下方原生视图检查播放、事件、跳转、循环、缩略图及错误恢复。默认静音。</Note>
        <ActionButton disabled={busy || !attached} label="运行视频检查" testID="video-check" onPress={() => void checks.run(verify)} />
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="VideoView" title="画面与播放控制">
        <View style={styles.preview}>
          {attached
            ? <VideoView
                ref={view}
                player={player}
                style={styles.video}
                nativeControls={controls}
                contentFit={fit}
                onFirstFrameRender={() => setFrames(value => value + 1)}
                onFullscreenEnter={() => setFullscreen(true)}
                onFullscreenExit={() => setFullscreen(false)}
                testID="video-view"
              />
            : <Note>视图已卸载，重新挂载后复用同一个播放器。</Note>}
        </View>
        <DataRow label="状态" value={<Tag tone={status === 'error' ? 'danger' : 'signal'}>{status} · {isPlaying ? '播放中' : '已暂停'}</Tag>} />
        <DataRow label="进度 / 时长" value={`${currentTime.toFixed(2)} / ${player.duration.toFixed(2)} 秒`} />
        <DataRow label="首帧事件 / 全屏" value={`${frames} / ${fullscreen ? '是' : '否'}`} />
        {error && <Note>{error.message}</Note>}
        <ActionRow>
          <ActionButton disabled={busy || !attached} label="加载内置视频" testID="video-load" onPress={() => void action.run(async () => replace(await load()))} />
          <ActionButton disabled={busy || !attached} label={isPlaying ? '暂停' : '播放'} testID="video-play" tone="secondary" onPress={() => isPlaying ? player.pause() : player.play()} />
          <ActionButton disabled={busy || !attached} label="重播" testID="video-replay" tone="secondary" onPress={() => player.replay()} />
        </ActionRow>
        <ActionRow>
          <ActionButton
            disabled={busy || !attached}
            label="进入全屏"
            testID="video-fullscreen"
            tone="secondary"
            onPress={() => void action.run(async () => {
              await view.current?.enterFullscreen();

              return '已请求进入全屏。';
            })}
          />
          <ActionButton disabled={busy} label={attached ? '卸载视图' : '重新挂载'} testID="video-attach" tone="secondary" onPress={() => setAttached(value => !value)} />
          <ActionButton disabled={busy} label={controls ? '隐藏控制栏' : '显示控制栏'} testID="video-controls" tone="secondary" onPress={() => setControls(value => !value)} />
        </ActionRow>
        <ActionRow>
          {(['contain', 'cover', 'fill'] as const).map(value => <ActionButton key={value} disabled={busy} label={value} testID={`video-fit-${value}`} tone={fit === value ? 'primary' : 'secondary'} onPress={() => setFit(value)} />)}
        </ActionRow>
      </Panel>

      <Panel eyebrow="SharedRef" title="原生缩略图">
        {preview ? <Thumbnail image={preview} /> : <Note>生成缩略图后，这里直接显示 VideoThumbnail 原生图片引用。</Note>}
        <ActionButton disabled={busy || status !== 'readyToPlay'} label="生成缩略图" testID="video-capture" onPress={() => void action.run(async () => json(await capture()))} />
      </Panel>

      <Panel eyebrow="Source" title="网络源与平台能力">
        <Field label="视频 URI" value={source} onChangeText={setSource} placeholder="https://… 或 file:///…" testID="video-source" />
        <Field label="HTTP 请求头（JSON）" value={headers} onChangeText={setHeaders} testID="video-headers" />
        <ActionButton
          disabled={busy || !attached || !source}
          label="加载地址"
          testID="video-custom"
          onPress={() => void action.run(async () => {
            await player.replaceAsync({ uri: source, headers: JSON.parse(headers) });
            return '数据源已提交，解码状态见画面卡片。';
          })}
        />
        <DataRow label="画中画" value={isPictureInPictureSupported() ? '支持' : '不支持'} />
        <Note>HarmonyOS 上需要挂载 VideoView 才开始解码；一个播放器同时绑定一个视图。此版本不支持 DRM、持久化缓存、画中画和后台播放。</Note>
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { height: 220, overflow: 'hidden', borderRadius: 12, backgroundColor: '#000000' },
  video: { width: '100%', height: '100%' },
  thumbnail: { width: '100%', height: 160, backgroundColor: '#000000', borderRadius: 12 },
});
