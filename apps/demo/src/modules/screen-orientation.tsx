import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const { Orientation, OrientationLock } = ScreenOrientation;
const LOCKS = [
  { label: '正向竖屏', value: OrientationLock.PORTRAIT_UP },
  { label: '左横屏', value: OrientationLock.LANDSCAPE_LEFT },
  { label: '右横屏', value: OrientationLock.LANDSCAPE_RIGHT },
  { label: '反向竖屏', value: OrientationLock.PORTRAIT_DOWN },
  { label: '自动竖屏', value: OrientationLock.PORTRAIT },
  { label: '自动横屏', value: OrientationLock.LANDSCAPE },
  { label: '全部方向', value: OrientationLock.ALL },
];

export function ScreenOrientationDemo() {
  const [orientation, setOrientation] = useState<ScreenOrientation.Orientation | null>(null);
  const [lock, setLock] = useState<ScreenOrientation.OrientationLock | null>(null);
  const [listening, setListening] = useState(false);
  const [events, setEvents] = useState(0);
  const [event, setEvent] = useState<ScreenOrientation.OrientationChangeEvent | null>(null);
  const active = useRef(true);
  const size = useWindowDimensions();
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const busy = action.state.phase === 'running' || checks.state.phase === 'running';

  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
      void ScreenOrientation.unlockAsync().catch(error => console.warn('恢复屏幕默认方向失败', error));
    };
  }, []);

  useEffect(() => {
    if (!listening) return;

    let subscribed = true;
    const subscription = ScreenOrientation.addOrientationChangeListener((value) => {
      if (!subscribed) return;

      setOrientation(value.orientationInfo.orientation);
      setLock(value.orientationLock);
      setEvents(count => count + 1);
      setEvent(value);
    });

    return () => {
      subscribed = false;
      subscription.remove();
    };
  }, [listening]);

  const read = async () => {
    const [orientation, lock, platform] = await Promise.all([
      ScreenOrientation.getOrientationAsync(),
      ScreenOrientation.getOrientationLockAsync(),
      ScreenOrientation.getPlatformOrientationLockAsync(),
    ]);
    if (active.current) {
      setOrientation(orientation);
      setLock(lock);
    }

    return JSON.stringify({ orientation: Orientation[orientation], lock: OrientationLock[lock], platform }, null, 2);
  };

  const write = (value: ScreenOrientation.OrientationLock) => action.run(async () => {
    await ScreenOrientation.lockAsync(value);

    const actual = await ScreenOrientation.getOrientationLockAsync();
    if (actual !== value) {
      throw new Error(`锁定策略读回不符：预期 ${OrientationLock[value]}，实际 ${OrientationLock[actual]}。`);
    }

    return read();
  });

  const unlock = () => action.run(async () => {
    await ScreenOrientation.unlockAsync();

    const actual = await ScreenOrientation.getOrientationLockAsync();
    if (actual !== OrientationLock.DEFAULT) throw new Error(`解锁后策略未恢复 DEFAULT：${actual}。`);

    return read();
  });

  const support = () => checks.run(async () => {
    const values = [
      OrientationLock.DEFAULT, ...LOCKS.map(item => item.value), OrientationLock.OTHER, OrientationLock.UNKNOWN,
    ];
    const rows = await Promise.all(values.map(async (value) => {
      const supported = await ScreenOrientation.supportsOrientationLockAsync(value);
      const expected = value !== OrientationLock.OTHER && value !== OrientationLock.UNKNOWN;
      if (supported !== expected) throw new Error(`${OrientationLock[value]} 支持情况不符：${supported}。`);

      return `${OrientationLock[value]} → ${supported}：通过`;
    }));

    return rows.join('\n');
  });

  const verify = () => checks.run(async () => {
    const rows: string[] = [];

    try {
      for (const value of [-1, 0.5, NaN, OrientationLock.UNKNOWN]) {
        if (!active.current) return '页面已离开，停止验证。';

        let rejected = false;
        try {
          await ScreenOrientation.lockAsync(value);
        } catch {
          rejected = true;
        }
        if (!rejected) throw new Error(`非法锁定值 ${value} 未被拒绝。`);

        rows.push(`拒绝 ${value}：通过`);
      }

      if (!active.current) return '页面已离开，停止验证。';

      await ScreenOrientation.lockAsync(OrientationLock.PORTRAIT_UP);
      await ScreenOrientation.lockAsync(OrientationLock.OTHER);

      const unchanged = await ScreenOrientation.getOrientationLockAsync();
      if (unchanged !== OrientationLock.PORTRAIT_UP) throw new Error('OTHER 改变了原有策略。');

      rows.push('OTHER 保持原策略：通过');

      if (!active.current) return '页面已离开，停止验证。';

      const results = await Promise.allSettled([
        ScreenOrientation.lockAsync(OrientationLock.PORTRAIT_UP),
        ScreenOrientation.lockAsync(OrientationLock.LANDSCAPE_LEFT),
      ]);
      if (results.some(result => result.status === 'rejected')) throw new Error('并发锁定请求失败。');

      const actual = await ScreenOrientation.getOrientationLockAsync();
      if (actual !== OrientationLock.LANDSCAPE_LEFT) throw new Error(`最终策略不符：${actual}。`);

      rows.push('非法输入后继续读写、并发请求按序生效：通过');
    } finally {
      await ScreenOrientation.unlockAsync();
    }

    if (!active.current) return rows.join('\n');

    return `${rows.join('\n')}\n${await read()}`;
  });

  return (
    <>
      <Panel eyebrow="当前窗口" title="方向与锁定策略">
        <DataRow label="屏幕方向" value={orientation === null ? '尚未读取' : Orientation[orientation]} />
        <DataRow label="锁定策略" value={lock === null ? '尚未读取' : OrientationLock[lock]} />
        <DataRow label="窗口尺寸" value={`${Math.round(size.width)} × ${Math.round(size.height)}`} />
        <ActionRow>
          <ActionButton disabled={busy} label="读取方向" onPress={() => void action.run(read)} testID="screen-orientation-read" />
          <ActionButton disabled={busy} label="解锁方向" onPress={() => void unlock()} testID="screen-orientation-unlock" tone="secondary" />
        </ActionRow>
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="方向策略" title="横竖屏锁定">
        <ActionRow>
          {LOCKS.map(item => (
            <ActionButton
              disabled={busy}
              key={item.value}
              label={item.label}
              onPress={() => void write(item.value)}
              testID={`screen-orientation-lock-${item.value}`}
              tone={lock === item.value ? 'primary' : 'secondary'}
            />
          ))}
        </ActionRow>
        <Note>锁定完成表示系统接受策略，旋转动画可能尚未结束。可稍后读取方向核对画面；离开本页会恢复默认策略。</Note>
      </Panel>

      <Panel eyebrow="变化事件" title="订阅与移除方向监听">
        <DataRow label="正在监听" value={listening ? '是' : '否'} />
        <DataRow label="事件次数" value={events} />
        <DataRow label="最近事件方向" value={event ? Orientation[event.orientationInfo.orientation] : '尚无事件'} />
        <DataRow label="最近事件策略" value={event ? OrientationLock[event.orientationLock] : '尚无事件'} />
        <ActionButton disabled={busy} label={listening ? '移除监听' : '开始监听'} onPress={() => setListening(value => !value)} testID="screen-orientation-listen" tone="secondary" />
        <Note>开始监听后切换横竖屏，观察事件和尺寸变化。180° 旋转可能不触发事件；移除监听后计数应保持不变。</Note>
      </Panel>

      <Panel eyebrow="接口验证" title="支持情况与参数边界">
        <ActionRow>
          <ActionButton disabled={busy} label="验证方向支持" onPress={() => void support()} testID="screen-orientation-support" />
          <ActionButton disabled={busy} label="验证边界与并发" onPress={() => void verify()} testID="screen-orientation-verify" tone="secondary" />
        </ActionRow>
        <Note>边界验证会短暂改变方向，结束后解锁。HarmonyOS 平台专属策略查询沿用官方 JS，返回空对象；多窗口和无传感器设备不保证发生物理旋转。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
