import { closeMenu, hideMenu, openMenu, registerDevMenuItems } from 'expo-dev-client';
import { requireNativeModule } from 'expo-modules-core';
import { useEffect, useRef, useState } from 'react';
import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

interface Preferences {
  getPreferencesAsync(): Promise<Record<string, boolean>>;
  setPreferencesAsync(values: Record<string, unknown>): Promise<void>;
}

export function DevMenuDemo() {
  const action = useAsyncResult();
  const prefs = useAsyncResult();
  const [callbacks, setCallbacks] = useState(0);
  const registered = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = !__DEV__ || action.state.phase === 'running' || prefs.state.phase === 'running';

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
    if (registered.current) void registerDevMenuItems([]).catch(error => console.warn('Unable to clear demo menu items:', error));
  }, []);

  function dismiss(close: () => void) {
    if (timer.current !== null) clearTimeout(timer.current);
    openMenu();
    timer.current = setTimeout(() => {
      timer.current = null;
      close();
    }, 1500);
  }

  async function checkPreferences() {
    const preferences = requireNativeModule<Preferences>('DevMenuPreferences');
    const original = await preferences.getPreferencesAsync();
    for (const key of ['motionGestureEnabled', 'touchGestureEnabled', 'keyCommandsEnabled', 'showsAtLaunch', 'isOnboardingFinished', 'showFloatingActionButton']) {
      if (typeof original[key] !== 'boolean') throw new Error(`Preference ${key} is missing or invalid.`);
    }

    const changes = Object.fromEntries(Object.entries(original).filter(([key]) => key !== 'isOnboardingFinished').map(([key, value]) => [key, !value]));

    try {
      await preferences.setPreferencesAsync({
        ...changes,
        isOnboardingFinished: !original.isOnboardingFinished,
        unknown: true,
      });
      const updated = await preferences.getPreferencesAsync();
      for (const [key, value] of Object.entries(changes)) {
        if (updated[key] !== value) throw new Error(`Preference ${key} did not persist.`);
      }
      if (updated.isOnboardingFinished !== original.isOnboardingFinished || 'unknown' in updated) throw new Error('Read-only or unknown preference was modified.');

      await preferences.setPreferencesAsync({ keyCommandsEnabled: 'invalid' });
      const ignored = await preferences.getPreferencesAsync();
      if (ignored.keyCommandsEnabled !== updated.keyCommandsEnabled) throw new Error('Non-boolean preference was accepted.');

      return `偏好往返、只读键及未知键校验通过；退出前恢复原设置。\n${json(updated)}`;
    } finally {
      await preferences.setPreferencesAsync(original);
    }
  }

  return (
    <>
      <Panel eyebrow="DEV MENU" title="菜单与自定义回调">
        <DataRow label="收到回调" value={String(callbacks)} />
        <Note>注册后打开菜单，分别点击保留菜单 / 收起菜单两个项目。重复注册应替换旧项目，清除后不应再出现；离开页面会注销。菜单设置页可继续验证源码、复制、字号和换行。</Note>
        <ActionRow>
          <ActionButton
            label="注册回调"
            testID="menu-register"
            disabled={busy}
            onPress={() => void action.run(async () => {
              registered.current = true;
              await registerDevMenuItems([
                { name: 'Demo: keep menu open', shouldCollapse: false, callback: () => setCallbacks(count => count + 1) },
                { name: 'Demo: collapse menu', shouldCollapse: true, callback: () => setCallbacks(count => count + 1) },
              ]);
              return '已注册两个回调';
            })}
          />
          <ActionButton
            label="清除回调"
            testID="menu-clear"
            disabled={busy}
            tone="secondary"
            onPress={() => void action.run(async () => {
              await registerDevMenuItems([]);
              registered.current = false;
              return '已清除回调';
            })}
          />
          <ActionButton label="打开菜单" testID="devtools-open-menu" disabled={busy} onPress={openMenu} />
          <ActionButton label="打开后自动关闭" testID="menu-close" disabled={busy} tone="secondary" onPress={() => dismiss(closeMenu)} />
          <ActionButton label="打开后自动隐藏" testID="menu-hide" disabled={busy} tone="secondary" onPress={() => dismiss(hideMenu)} />
        </ActionRow>
        <ResultPanel state={action.state} />
      </Panel>
      <Panel eyebrow="PREFERENCES" title="偏好、悬浮按钮与接口联动">
        <Note>
          FAB 可点击、拖动、吸附；闲置会灰化，打开菜单后会移出屏幕。Home 和工具开关同时覆盖 dev-menu-interface 的宿主代理联动。
          摇动开关不能控制 RNOH 内部检测，当前在原生设置中禁用。
        </Note>
        <ActionRow>
          <ActionButton label="读取偏好" testID="menu-preferences" disabled={busy} onPress={() => void prefs.run(async () => json(await requireNativeModule<Preferences>('DevMenuPreferences').getPreferencesAsync()))} />
          <ActionButton label="校验偏好往返" testID="menu-roundtrip" disabled={busy} onPress={() => void prefs.run(checkPreferences)} />
          <ActionButton
            label="切换 FAB"
            testID="menu-fab"
            disabled={busy}
            tone="secondary"
            onPress={() => void prefs.run(async () => {
              const preferences = requireNativeModule<Preferences>('DevMenuPreferences');
              const values = await preferences.getPreferencesAsync();
              await preferences.setPreferencesAsync({ showFloatingActionButton: !values.showFloatingActionButton });
              return json(await preferences.getPreferencesAsync());
            })}
          />
        </ActionRow>
        <ResultPanel state={prefs.state} />
      </Panel>
    </>
  );
}
