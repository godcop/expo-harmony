import { UnavailabilityError } from 'expo-modules-core';
import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, Tag, useAsyncResult } from '../ui';

const KEYS = ['demo-screen-capture-a', 'demo-screen-capture-b'] as const;

function Protection() {
  ScreenCapture.usePreventScreenCapture('demo-screen-capture-hook');
  return <Tag tone="success">保护 Hook 已挂载</Tag>;
}

function ScreenshotListener({ onScreenshot }: { onScreenshot: () => void }) {
  ScreenCapture.useScreenshotListener(onScreenshot);
  return <Tag tone="success">监听 Hook 已挂载</Tag>;
}

export function ScreenCaptureDemo() {
  const [permission, request, get] = ScreenCapture.usePermissions();
  const [active, setActive] = useState<string[]>([]);
  const [protecting, setProtecting] = useState(false);
  const [listening, setListening] = useState(false);
  const [hook, setHook] = useState(false);
  const [events, setEvents] = useState(0);
  const [hookEvents, setHookEvents] = useState(0);
  const subscription = useRef<ScreenCapture.Subscription | null>(null);
  const access = useAsyncResult();
  const action = useAsyncResult();
  const observer = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [access, action, observer, checks].some(result => result.state.phase === 'running');
  const screenshot = useCallback(() => setHookEvents(count => count + 1), []);

  useEffect(() => () => {
    subscription.current?.remove();
    for (const key of KEYS) {
      void ScreenCapture.allowScreenCaptureAsync(key).catch(console.warn);
    }
  }, []);

  const inspect = () => access.run(async () => {
    const [available, permissions] = await Promise.all([ScreenCapture.isAvailableAsync(), get()]);
    if (!available) throw new Error('ScreenCapture 原生接口不可用。');

    return json({ available, permissions });
  });

  const toggle = (key: string) => action.run(async () => {
    if (active.includes(key)) {
      await ScreenCapture.allowScreenCaptureAsync(key);
      setActive(keys => keys.filter(value => value !== key));

      return `${key} 已释放；其他标签仍有效时，窗口应继续禁止截图。`;
    }

    await ScreenCapture.preventScreenCaptureAsync(key);
    setActive(keys => [...keys, key]);

    return `${key} 已启用；请尝试系统截图，并检查后台应用预览。`;
  });

  const reset = () => action.run(async () => {
    for (const key of KEYS) await ScreenCapture.allowScreenCaptureAsync(key);
    setActive([]);

    return '手动标签已全部释放。保护 Hook 仍挂载时会继续阻止截图。';
  });

  const observe = () => observer.run(() => {
    if (subscription.current) {
      ScreenCapture.removeScreenshotListener(subscription.current);
      subscription.current = null;
      setListening(false);

      return '已移除手动监听；再次截图时手动计数应保持不变。';
    }

    subscription.current = ScreenCapture.addScreenshotListener(() => setEvents(count => count + 1));
    setListening(true);

    return '已开始监听；请使用系统截图，或在模拟器上触发截图。';
  });

  const verify = () => checks.run(async () => {
    const rows: string[] = [];
    const methods = [ScreenCapture.enableAppSwitcherProtectionAsync, ScreenCapture.disableAppSwitcherProtectionAsync];

    for (const method of methods) {
      try {
        await method();
      } catch (error) {
        if (!(error instanceof UnavailabilityError)) {
          throw new Error(`预期 UnavailabilityError，实际为 ${String(error)}。`);
        }

        rows.push(error.message);
        continue;
      }

      throw new Error('iOS 专属接口未按预期拒绝调用。');
    }

    return `两个 iOS 专属接口均按预期拒绝调用：\n${rows.join('\n')}`;
  });

  return (
    <>
      <Panel eyebrow="能力与权限" title="查询可用性和截图权限">
        <DataRow label="授权状态" value={permission?.status ?? '加载中'} />
        <ActionRow>
          <ActionButton disabled={busy} label="查询能力与权限" onPress={() => void inspect()} testID="screen-capture-inspect" />
          <ActionButton disabled={busy} label="请求权限" onPress={() => void access.run(async () => json(await request()))} testID="screen-capture-permissions" tone="secondary" />
        </ActionRow>
        <Note>HarmonyOS 无需运行时授权，不会弹出相册或存储权限对话框。</Note>
        <ResultPanel state={access.state} />
      </Panel>

      <Panel eyebrow="窗口保护" title="两个独立标签">
        <DataRow label="本页手动标签" value={active.map(key => key === KEYS[0] ? 'A' : 'B').join('、') || '无'} />
        <ActionRow>
          {KEYS.map((key, index) => (
            <ActionButton
              disabled={busy}
              key={key}
              label={`${active.includes(key) ? '释放' : '启用'}标签 ${index === 0 ? 'A' : 'B'}`}
              onPress={() => void toggle(key)}
              testID={`screen-capture-tag-${index}`}
              tone={active.includes(key) ? 'secondary' : 'primary'}
            />
          ))}
          <ActionButton disabled={busy} label="释放全部手动标签" onPress={() => void reset()} testID="screen-capture-reset" tone="secondary" />
        </ActionRow>
        <Note>先启用 A、B，再单独释放 A，保护应继续生效；释放 B 后才恢复截图。离开页面会释放本页的标签。</Note>
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="React Hook" title="随组件挂载保护窗口">
        <ActionButton disabled={busy} label={protecting ? '卸载保护 Hook' : '挂载保护 Hook'} onPress={() => setProtecting(value => !value)} testID="screen-capture-protection-hook" tone="secondary" />
        {protecting ? <Protection /> : <Tag>保护 Hook 已卸载</Tag>}
        <Note>usePreventScreenCapture 使用独立标签，与上面的手动标签共同生效。卸载组件后会自动释放。</Note>
      </Panel>

      <Panel eyebrow="截图事件" title="手动订阅与 Hook 订阅">
        <DataRow label="手动监听" value={listening ? '监听中' : '已停止'} />
        <DataRow label="手动事件次数" value={String(events)} />
        <DataRow label="Hook 事件次数" value={String(hookEvents)} />
        <ActionRow>
          <ActionButton disabled={busy} label={listening ? '移除监听' : '开始监听'} onPress={() => void observe()} testID="screen-capture-listen" />
          <ActionButton disabled={busy} label={hook ? '卸载监听 Hook' : '挂载监听 Hook'} onPress={() => setHook(value => !value)} testID="screen-capture-listener-hook" tone="secondary" />
        </ActionRow>
        {hook ? <ScreenshotListener onScreenshot={screenshot} /> : <Tag>监听 Hook 已卸载</Tag>}
        <Note>先释放所有保护，再截图验证计数。移除手动监听后，Hook 应继续收到通知；后台不应收到通知，返回前台后恢复。</Note>
        <ResultPanel state={observer.state} />
      </Panel>

      <Panel eyebrow="平台差异" title="iOS 专属模糊接口">
        <ActionButton disabled={busy || Platform.OS === 'ios'} label="验证不支持的接口" onPress={() => void verify()} testID="screen-capture-unavailable" tone="secondary" />
        <Note>HarmonyOS 使用系统隐私遮罩；两个应用切换器模糊接口应抛出 UnavailabilityError。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
