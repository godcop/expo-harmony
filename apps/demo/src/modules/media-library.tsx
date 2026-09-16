import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet } from 'react-native';

import picture from '../../assets/app-icon.png';
import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function MediaLibraryDemo() {
  const [permission, request, get] = MediaLibrary.usePermissions();
  const [size, setSize] = useState('2');
  const [page, setPage] = useState<MediaLibrary.PagedInfo<MediaLibrary.Asset> | null>(null);
  const [selected, setSelected] = useState<MediaLibrary.Asset | null>(null);
  const [albums, setAlbums] = useState<MediaLibrary.Album[]>([]);
  const [album, setAlbum] = useState('');
  const [title, setTitle] = useState('Expo Harmony');
  const [created, setCreated] = useState<MediaLibrary.Asset[]>([]);
  const [listening, setListening] = useState(false);
  const [events, setEvents] = useState(0);
  const [event, setEvent] = useState<MediaLibrary.MediaLibraryAssetsChangeEvent | null>(null);
  const subscription = useRef<ReturnType<typeof MediaLibrary.addListener> | null>(null);
  const access = useAsyncResult();
  const query = useAsyncResult();
  const details = useAsyncResult();
  const writes = useAsyncResult();
  const collection = useAsyncResult();
  const observer = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [access, query, details, writes, collection, observer, checks].some(result => result.state.phase === 'running');
  const latest = created.at(-1);

  useEffect(() => () => subscription.current?.remove(), []);

  const inspect = () => access.run(async () => {
    const [available, read, write] = await Promise.all([
      MediaLibrary.isAvailableAsync(), get(), MediaLibrary.getPermissionsAsync(true),
    ]);
    if (!available) throw new Error('MediaLibrary 原生接口不可用。');

    return json({ available, read, write });
  });

  const load = (next = false) => query.run(async () => {
    const first = Number(size);
    if (!size.trim() || !Number.isSafeInteger(first) || first < 1) throw new Error('每页数量需为正整数。');
    if (next && (!page?.hasNextPage || !page.endCursor)) throw new Error('当前没有下一页。');

    const result = await MediaLibrary.getAssetsAsync({
      first, after: next ? page?.endCursor : undefined,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
    });
    if (result.assets.length > first || result.totalCount < result.assets.length) throw new Error('分页数量无效。');
    if (new Set(result.assets.map(asset => asset.id)).size !== result.assets.length) throw new Error('页内出现重复资产。');
    if (next && result.assets.some(asset => page?.assets.some(previous => previous.id === asset.id))) {
      throw new Error('相邻分页出现重复资产。');
    }

    setPage(result);
    setSelected(result.assets[0] ?? null);

    return json({
      count: result.assets.length, totalCount: result.totalCount,
      endCursor: result.endCursor, hasNextPage: result.hasNextPage,
    });
  });

  const info = (asset: MediaLibrary.Asset) => details.run(async () => {
    const result = await MediaLibrary.getAssetInfoAsync(asset);
    if (!result || result.id !== asset.id || !result.uri || !Number.isFinite(result.creationTime)) {
      throw new Error('资产详情的 ID、URI 或时间无效。');
    }

    setSelected(asset);

    return json(result);
  });

  const save = (only = false) => writes.run(async () => {
    const asset = Asset.fromModule(picture);
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('内置图片未下载到本地。');

    const file = new File(Paths.cache, `media-library-${Date.now()}.png`);
    try {
      new File(asset.localUri).copy(file);

      if (only) {
        await MediaLibrary.saveToLibraryAsync(file.uri);

        return 'saveToLibraryAsync 已完成。此接口不返回 ID，可在系统图库查看并删除保存的图片。';
      }

      const result = await MediaLibrary.createAssetAsync(file.uri);
      if (result?.id) setCreated(values => [...values, result]);
      if (!result?.id || !result.uri || result.mediaType !== 'photo' || result.width <= 0 || result.height <= 0) {
        throw new Error('保存结果的资产标识、媒体类型或尺寸无效。');
      }

      setSelected(result);

      return json(result);
    } finally {
      if (file.exists) file.delete();
    }
  });

  const cleanup = () => writes.run(async () => {
    if (created.length === 0) return '没有需要清理的本页资源。';

    const removed = await MediaLibrary.deleteAssetsAsync(created);
    if (!removed) throw new Error('删除未完成，已保留待清理列表。');

    setCreated([]);
    if (selected && created.some(asset => asset.id === selected.id)) setSelected(null);
    setPage(null);

    return `已删除本页创建的 ${created.length} 项资源。`;
  });

  const list = () => collection.run(async () => {
    const result = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
    setAlbums(result);

    return json(result);
  });

  const membership = (remove: boolean) => collection.run(async () => {
    if (!latest || !album) throw new Error('请先创建图片并选择用户相册。');

    const result = remove
      ? await MediaLibrary.removeAssetsFromAlbumAsync([latest], album)
      : await MediaLibrary.addAssetsToAlbumAsync([latest], album, false);
    if (!result) throw new Error('相册成员操作未完成。');

    return remove ? '已移除本页图片的相册成员关系。' : '已将本页图片加入所选相册。';
  });

  const observe = () => observer.run(() => {
    if (subscription.current) {
      subscription.current.remove();
      subscription.current = null;
      setListening(false);

      return '监听已停止。';
    }

    subscription.current = MediaLibrary.addListener((value) => {
      setEvents(count => count + 1);
      setEvent(value);
    });
    setListening(true);

    return '监听已开启。请保存或清理本页图片，检查事件计数是否变化。';
  });

  const verify = () => checks.run(async () => {
    const rows: string[] = [];
    const sizes = String(Platform.OS) === 'harmony' ? [-1, NaN] : [-1];
    for (const first of sizes) {
      let rejected = false;
      try {
        await MediaLibrary.getAssetsAsync({ first });
      } catch (error) {
        if (!(error instanceof Error)) throw new Error(`未返回错误对象：${String(error)}`);
        const code = 'code' in error ? error.code : undefined;
        if (first !== -1 && code !== 'ERR_MEDIA_LIBRARY_INVALID_ARGUMENT') {
          throw new Error(`未返回预期的参数错误：${String(error)}`);
        }
        rejected = true;
      }
      if (!rejected) throw new Error(`非法 first ${first} 未被拒绝。`);
      rows.push(`first ${first}：正确拒绝`);
    }

    const empty = await MediaLibrary.getAssetsAsync({ first: 0 });
    if (empty.assets.length !== 0) throw new Error('first: 0 不应返回资产。');
    rows.push('first: 0：正确返回空页');

    if (String(Platform.OS) === 'harmony') {
      const audio = await MediaLibrary.getAssetsAsync({ mediaType: MediaLibrary.MediaType.audio });
      if (audio.assets.length !== 0 || audio.totalCount !== 0) throw new Error('音频查询应返回空结果。');
      rows.push('音频查询：正确返回空结果');

      let rejected = false;
      try {
        await MediaLibrary.createAlbumAsync('Expo Harmony');
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ERR_MEDIA_LIBRARY_UNSUPPORTED_ALBUM_OPERATION') {
          throw new Error(`相册创建错误码不符：${String(error)}`);
        }
        rejected = true;
      }
      if (!rejected) throw new Error('不支持的相册创建未被拒绝。');
      rows.push('相册创建：正确报告平台限制');
    }

    return rows.join('\n');
  });

  return (
    <>
      <Panel eyebrow="权限" title="图库读写权限">
        <DataRow label="当前状态" value={permission?.status ?? '未读取'} />
        <ActionRow>
          <ActionButton disabled={busy} label="读取能力与权限" onPress={() => void inspect()} testID="media-library-permissions" />
          <ActionButton disabled={busy} label="申请读写权限" onPress={() => void access.run(async () => json(await request()))} testID="media-library-request" tone="secondary" />
          <ActionButton disabled={busy} label="申请只写权限" onPress={() => void access.run(async () => json(await MediaLibrary.requestPermissionsAsync(true)))} testID="media-library-write" tone="secondary" />
        </ActionRow>
        <Note>HarmonyOS 全库访问需要受限开放权限。只写权限可验证仅保存接口，查询与创建后读取详情需要读写权限。</Note>
        <ResultPanel state={access.state} />
      </Panel>

      <Panel eyebrow="图库" title="图片、视频与分页">
        <Field keyboardType="number-pad" label="每页数量" onChangeText={setSize} testID="media-library-size" value={size} />
        <ActionRow>
          <ActionButton disabled={busy} label="查询首页" onPress={() => void load()} testID="media-library-first" />
          <ActionButton disabled={busy || !page?.hasNextPage} label="查询下一页" onPress={() => void load(true)} testID="media-library-next" tone="secondary" />
        </ActionRow>
        <ResultPanel state={query.state} />
        {page?.assets.map(asset => (
          <ActionButton disabled={busy} key={asset.id} label={`${asset.filename} · ${asset.mediaType}`} onPress={() => void info(asset)} tone="secondary" />
        ))}
      </Panel>

      <Panel eyebrow="写入" title="保存与清理内置图片">
        <DataRow label="本页待清理资源" value={created.length} />
        <ActionRow>
          <ActionButton disabled={busy} label="创建图片资源" onPress={() => void save()} testID="media-library-create" />
          <ActionButton disabled={busy} label="仅保存到图库" onPress={() => void save(true)} testID="media-library-save" tone="secondary" />
          <ActionButton disabled={busy || created.length === 0} label="清理本页资源" onPress={() => void cleanup()} testID="media-library-cleanup" tone="danger" />
        </ActionRow>
        <Note>清理只删除本页创建且取得 ID 的资源。仅保存接口不返回 ID，其结果需在系统图库中手动删除；离开页面前可先清理。</Note>
        <ResultPanel state={writes.state} />
      </Panel>

      <Panel eyebrow="详情" title="元数据与图片预览">
        <ActionButton disabled={busy || !selected} label="读取选中资源详情" onPress={() => selected && void info(selected)} testID="media-library-info" />
        {selected ? <DataRow label="资源 ID" value={selected.id} /> : null}
        {selected?.mediaType === 'photo' ? <Image accessibilityLabel="媒体库图片预览" resizeMode="contain" source={{ uri: selected.uri }} style={styles.preview} /> : null}
        <ResultPanel state={details.state} />
      </Panel>

      <Panel eyebrow="相册" title="查询与成员管理">
        <ActionButton disabled={busy} label="读取所有相册" onPress={() => void list()} testID="media-library-albums" />
        {albums.filter(item => item.type !== 'smartAlbum').map(item => (
          <ActionButton disabled={busy} key={item.id} label={`${album === item.id ? '已选 · ' : ''}${item.title}（${item.assetCount}）`} onPress={() => setAlbum(item.id)} tone="secondary" />
        ))}
        <Field label="相册名称" onChangeText={setTitle} testID="media-library-title" value={title} />
        <ActionRow>
          <ActionButton disabled={busy} label="按名称查询" onPress={() => void collection.run(async () => json(await MediaLibrary.getAlbumAsync(title)))} testID="media-library-find-album" tone="secondary" />
          <ActionButton disabled={busy || !latest || !album} label="加入最新图片" onPress={() => void membership(false)} testID="media-library-add" tone="secondary" />
          <ActionButton disabled={busy || !latest || !album} label="移除最新图片" onPress={() => void membership(true)} testID="media-library-remove" tone="secondary" />
        </ActionRow>
        <Note>HarmonyOS 仅支持修改已有用户相册的成员，不提供创建或删除相册的公开接口。</Note>
        <ResultPanel state={collection.state} />
      </Panel>

      <Panel eyebrow="事件" title="图库变更监听">
        <DataRow label="事件次数" value={events} />
        <ActionButton disabled={busy} label={listening ? '停止监听' : '开始监听'} onPress={() => void observe()} testID="media-library-observe" />
        {event ? <DataRow label="最近事件" value={json(event)} /> : null}
        <ResultPanel state={observer.state} />
      </Panel>

      <Panel eyebrow="接口验证" title="分页边界与平台限制">
        <ActionButton disabled={busy} label="验证接口边界" onPress={() => void verify()} testID="media-library-verify" />
        <Note>先授予读写权限，再验证非法页大小、空页和 HarmonyOS 的音频与相册限制。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 200, borderRadius: 10 },
});
