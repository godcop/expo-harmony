import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const IMMEDIATE = 'expo-notifications-demo-immediate';
const REMINDER = 'expo-notifications-demo-reminder';
const CATEGORY = 'expo-notifications-demo-actions';
const harmony = String(Platform.OS) === 'harmony';

async function verifyMetadata() {
  const id = `expo-notifications-check-${Date.now()}`;
  const date = new Date(Date.now() + 60_123);
  const trigger: Notifications.DateTriggerInput = { type: Notifications.SchedulableTriggerInputTypes.DATE, date };
  const checks: string[] = [];

  try {
    const next = await Notifications.getNextTriggerDateAsync(trigger);
    const expected = harmony ? Math.ceil(date.getTime() / 1000) * 1000 : date.getTime();
    if (next !== expected) throw new Error(`触发日期不一致：${next}，预期 ${expected}。`);
    checks.push('下一次触发日期');

    await Notifications.setNotificationCategoryAsync(id, [{ identifier: 'open', buttonTitle: '打开' }]);
    const categories = await Notifications.getNotificationCategoriesAsync();
    if (!categories.some(value => value.identifier === id && value.actions[0]?.identifier === 'open')) {
      throw new Error('通知类别或按钮未正确保存。');
    }
    checks.push('类别创建与读取');
  } finally {
    await Notifications.deleteNotificationCategoryAsync(id);
  }

  if ((await Notifications.getNotificationCategoriesAsync()).some(value => value.identifier === id)) {
    throw new Error('临时通知类别未清理。');
  }
  checks.push('类别清理');

  return json({ passed: true, checks });
}

async function verifyReminders() {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) throw new Error('请先授予通知权限。');

  const id = `expo-notifications-check-${Date.now()}`;
  const trigger: Notifications.DateTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: new Date(Date.now() + 60_123),
  };
  const checks: string[] = [];

  try {
    await Notifications.scheduleNotificationAsync({ identifier: id, content: { title: '通知往返校验', body: '初始内容', sound: 'default', data: { check: id } }, trigger });
    await Notifications.scheduleNotificationAsync({ identifier: id, content: { title: '通知往返校验', body: '已替换内容', sound: 'default', data: { check: id } }, trigger });
    const saved = (await Notifications.getAllScheduledNotificationsAsync()).filter(value => value.identifier === id);
    if (saved.length !== 1 || saved[0]?.content.body !== '已替换内容' || saved[0]?.content.data?.check !== id) {
      throw new Error('同 identifier 替换后应只有一条提醒，且内容和 data 完整。');
    }
    checks.push('提醒创建、替换、列表与 data 往返');

    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.cancelScheduledNotificationAsync(id);
    if ((await Notifications.getAllScheduledNotificationsAsync()).some(value => value.identifier === id)) {
      throw new Error('已取消的提醒仍在计划列表中。');
    }
    checks.push('取消与重复取消');
  } finally {
    await Notifications.cancelScheduledNotificationAsync(id);
  }

  return json({ passed: true, checks });
}

async function verifyUnsupported() {
  const service = 'ERR_NOTIFICATIONS_EXPO_PUSH_SERVICE_UNSUPPORTED';
  const cases = [
    { name: 'Expo token', code: service, run: () => Notifications.getExpoPushTokenAsync() },
    { name: '自带参数的 Expo token', code: service, run: () => Notifications.getExpoPushTokenAsync({ projectId: 'demo', deviceId: 'demo', devicePushToken: { type: 'android', data: 'demo' } }) },
    { name: '开启自动注册', code: service, run: () => Notifications.setAutoServerRegistrationEnabledAsync(true) },
    { name: '关闭自动注册', code: service, run: () => Notifications.setAutoServerRegistrationEnabledAsync(false) },
    { name: '后台任务', code: 'ERR_NOTIFICATIONS_UNSUPPORTED', run: () => Notifications.registerTaskAsync('expo-notifications-demo') },
    { name: '重复间隔', code: 'ERR_NOTIFICATIONS_UNSUPPORTED', run: () => Notifications.getNextTriggerDateAsync({ type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 60, repeats: true }) },
  ];
  const checks: string[] = [];

  for (const entry of cases) {
    const [result] = await Promise.allSettled([entry.run()]);
    if (result.status !== 'rejected' || result.reason?.code !== entry.code) {
      throw new Error(`${entry.name} 应拒绝并返回 ${entry.code}；实际结果：${json(result)}。`);
    }
    checks.push(`${entry.name}: ${entry.code}`);
  }

  return json({ passed: true, checks });
}

export function NotificationsDemo() {
  const [permission, setPermission] = useState<Notifications.NotificationPermissionsStatus>();
  const [events, setEvents] = useState<string[]>([]);
  const response = Notifications.useLastNotificationResponse();
  const access = useAsyncResult();
  const local = useAsyncResult();
  const schedule = useAsyncResult();
  const badge = useAsyncResult();
  const checks = useAsyncResult();
  const push = useAsyncResult();
  const busy = [access, local, schedule, badge, checks, push].some(value => value.state.phase === 'running');

  useEffect(() => {
    const append = (text: string) => setEvents(values => [text, ...values].slice(0, 8));
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
      handleSuccess: id => append(`已展示：${id}`),
      handleError: (id, error) => append(`处理失败：${id} · ${error.message}`),
    });
    const received = Notifications.addNotificationReceivedListener(value => append(`已接收：${value.request.identifier}`));
    const clicked = Notifications.addNotificationResponseReceivedListener(value => append(`已点击：${value.actionIdentifier}`));

    return () => {
      received.remove();
      clicked.remove();
      Notifications.setNotificationHandler(null);
    };
  }, []);

  const inspect = (request: boolean) => access.run(async () => {
    const result = await (request ? Notifications.requestPermissionsAsync() : Notifications.getPermissionsAsync());
    setPermission(result);

    return json(result);
  });

  return (
    <>
      <Panel eyebrow="权限" title="通知授权">
        <DataRow label="权限状态" value={permission?.status ?? '尚未查询'} />
        <DataRow label="可再次询问" value={permission ? String(permission.canAskAgain) : '尚未查询'} />
        <ActionRow>
          <ActionButton disabled={busy} label="检查权限" onPress={() => void inspect(false)} testID="notifications-permissions-get" tone="secondary" />
          <ActionButton disabled={busy} label="请求权限" onPress={() => void inspect(true)} testID="notifications-permissions-request" />
        </ActionRow>
        <ResultPanel state={access.state} />
      </Panel>

      <Panel eyebrow="本地通知" title="发送与点击响应">
        <Note>页面打开时启用静音前台展示。发送后可在系统通知中心点击正文或“打开”按钮，下方显示接收、处理和点击事件。</Note>
        <ActionRow>
          <ActionButton
            disabled={busy || !permission?.granted}
            label="发送本地通知"
            testID="notifications-send"
            onPress={() => void local.run(async () => {
              await Notifications.setNotificationCategoryAsync(CATEGORY, [{ identifier: 'open', buttonTitle: '打开' }]);
              const id = await Notifications.scheduleNotificationAsync({ identifier: IMMEDIATE, content: { title: 'Expo 通知验证', body: '点击查看通知响应', data: { source: 'notifications-demo' }, categoryIdentifier: CATEGORY, sound: false }, trigger: null });

              return `已发送 ${id}，请查看事件与系统通知中心。`;
            })}
          />
          <ActionButton disabled={busy} label="查询已展示通知" testID="notifications-presented" tone="secondary" onPress={() => void local.run(async () => json(await Notifications.getPresentedNotificationsAsync()))} />
          <ActionButton
            disabled={busy}
            label="清除本地通知"
            testID="notifications-dismiss"
            tone="secondary"
            onPress={() => void local.run(async () => {
              await Notifications.dismissNotificationAsync(IMMEDIATE);
              await Notifications.deleteNotificationCategoryAsync(CATEGORY);

              return '本页的即时通知和按钮类别已清除。';
            })}
          />
        </ActionRow>
        <DataRow label="最近事件" value={events.join('\n') || '等待通知'} />
        <DataRow label="最近点击" value={response ? json({ action: response.actionIdentifier, request: response.notification.request }) : '尚无点击'} />
        <ActionButton
          disabled={busy}
          label="清除点击记录"
          testID="notifications-response-clear"
          tone="secondary"
          onPress={() => void local.run(async () => {
            await Notifications.clearLastNotificationResponseAsync();

            return '点击记录已清除。';
          })}
        />
        <ResultPanel state={local.state} />
      </Panel>

      <Panel eyebrow="定时提醒" title="系统代理提醒">
        <Note>demo 已声明代理提醒权限；系统仍可能因应用权益或配额拒绝发布。创建成功后等待 15 秒，可切到后台观察投递；再次创建会替换旧提醒。</Note>
        <ActionRow>
          <ActionButton
            disabled={busy || !permission?.granted}
            label="15 秒后提醒"
            testID="notifications-schedule"
            onPress={() => void schedule.run(async () => {
              const id = await Notifications.scheduleNotificationAsync({ identifier: REMINDER, content: { title: 'Expo 定时提醒', body: '系统代理提醒已触发', sound: 'default', data: { source: 'notifications-demo' } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 15 } });

              return `已创建 ${id}`;
            })}
          />
          <ActionButton disabled={busy} label="查询计划" testID="notifications-scheduled" tone="secondary" onPress={() => void schedule.run(async () => json(await Notifications.getAllScheduledNotificationsAsync()))} />
          <ActionButton
            disabled={busy}
            label="取消并清理提醒"
            testID="notifications-cancel"
            tone="secondary"
            onPress={() => void schedule.run(async () => {
              await Notifications.cancelScheduledNotificationAsync(REMINDER);
              await Notifications.dismissNotificationAsync(REMINDER);

              return '本页的定时提醒已清理。';
            })}
          />
        </ActionRow>
        <ResultPanel state={schedule.state} />
      </Panel>

      <Panel eyebrow="角标" title="读取与设置角标">
        <ActionRow>
          <ActionButton disabled={busy} label="读取角标" testID="notifications-badge-get" tone="secondary" onPress={() => void badge.run(async () => json(await Notifications.getBadgeCountAsync()))} />
          <ActionButton disabled={busy || !permission?.granted} label="设置为 3" testID="notifications-badge-set" onPress={() => void badge.run(async () => json({ set: await Notifications.setBadgeCountAsync(3), count: await Notifications.getBadgeCountAsync() }))} />
          <ActionButton disabled={busy} label="清零" testID="notifications-badge-clear" tone="secondary" onPress={() => void badge.run(async () => json({ set: await Notifications.setBadgeCountAsync(0), count: await Notifications.getBadgeCountAsync() }))} />
        </ActionRow>
        <ResultPanel state={badge.state} />
      </Panel>

      <Panel eyebrow="接口校验" title="往返与错误边界">
        <Note>类别与日期、提醒往返分别校验，完成后清理本次数据。提醒校验需系统允许发布；不支持接口校验只在 HarmonyOS 执行。</Note>
        <ActionRow>
          <ActionButton disabled={busy} label="校验类别与日期" testID="notifications-verify-metadata" onPress={() => void checks.run(verifyMetadata)} />
          <ActionButton disabled={busy || !permission?.granted} label="校验提醒往返" testID="notifications-verify-reminders" onPress={() => void checks.run(verifyReminders)} />
          <ActionButton disabled={busy || !harmony} label="验证不支持接口" testID="notifications-unsupported" tone="secondary" onPress={() => void checks.run(verifyUnsupported)} />
        </ActionRow>
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="原生推送" title="Huawei Push Kit 注册">
        <Note>实际注册需要支持 Push Kit 的设备、应用签名及 AGC 配置。模拟器可能返回系统不支持或配置错误；不会回退到 Expo Push Service。</Note>
        <ActionRow>
          <ActionButton
            disabled={busy}
            label="获取设备 token"
            testID="notifications-token"
            onPress={() => void push.run(async () => {
              const token = await Notifications.getDevicePushTokenAsync();

              return json({ type: token.type, length: String(token.data).length });
            })}
          />
          <ActionButton
            disabled={busy}
            label="注销推送"
            testID="notifications-unregister"
            tone="secondary"
            onPress={() => void push.run(async () => {
              await Notifications.unregisterForNotificationsAsync();

              return '已注销系统推送注册。';
            })}
          />
        </ActionRow>
        <ResultPanel state={push.state} />
      </Panel>
    </>
  );
}
