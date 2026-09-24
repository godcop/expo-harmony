import * as Tracking from 'expo-tracking-transparency';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

function validate(value: Tracking.PermissionResponse): Tracking.PermissionResponse {
  if (!Object.values(Tracking.PermissionStatus).includes(value.status)
    || value.granted !== (value.status === Tracking.PermissionStatus.GRANTED)
    || typeof value.canAskAgain !== 'boolean' || value.expires !== 'never') {
    throw new Error('跟踪权限返回值不符合 PermissionResponse 约定。');
  }

  return value;
}

export function TrackingTransparencyDemo() {
  const [permission, request, refresh] = Tracking.useTrackingPermissions({ get: false });
  const query = useAsyncResult();
  const identifier = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [query, identifier, checks].some(action => action.state.phase === 'running');
  const harmony = String(Platform.OS) === 'harmony';

  const inspect = (ask = false) => query.run(async () => {
    const result = await (ask ? request() : refresh());

    return json(validate(result));
  });

  const read = () => identifier.run(async () => {
    let id: string | null;

    if (harmony) {
      const module = await import('@expo-harmony/expo-tracking-transparency');
      id = await module.getAdvertisingIdAsync();
    } else {
      id = Tracking.getAdvertisingId();
    }

    if (id !== null && (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)
      || id === '00000000-0000-0000-0000-000000000000')) {
      throw new Error('广告标识应为有效 UUID 或 null，不能返回全零标识符。');
    }

    return json({ advertisingId: id });
  });

  const concurrent = () => checks.run(async () => {
    const results = await Promise.all([
      Tracking.requestTrackingPermissionsAsync(),
      Tracking.requestTrackingPermissionsAsync(),
    ]);

    results.forEach(validate);
    await refresh();

    return json({ passed: true, results });
  });

  const verify = () => checks.run(async () => {
    let failure: unknown;

    try {
      Tracking.getAdvertisingId();
    } catch (error) {
      failure = error;
    }

    if (!(failure instanceof Error) || !('code' in failure) || failure.code !== 'ERR_UNAVAILABLE') {
      throw new Error(`同步接口应抛出 ERR_UNAVAILABLE，实际为 ${String(failure)}。`);
    }

    const result = validate(await refresh());

    return json({ passed: true, code: failure.code, permission: result });
  });

  return (
    <>
      <Panel eyebrow="跟踪权限" title="查询授权与系统请求">
        <DataRow label="模块可用" value={String(Tracking.isAvailable())} />
        <DataRow label="权限状态" value={permission?.status ?? '尚未读取'} />
        <DataRow label="已授权" value={permission ? String(permission.granted) : '尚未读取'} />
        <DataRow label="可以再次询问" value={permission ? String(permission.canAskAgain) : '尚未读取'} />
        <ActionRow>
          <ActionButton disabled={busy} label="查询跟踪权限" onPress={() => void inspect()} testID="tracking-query" />
          <ActionButton disabled={busy} label="请求跟踪权限" onPress={() => void inspect(true)} testID="tracking-request" tone="secondary" />
        </ActionRow>
        <Note>状态通过官方权限 Hook 更新。HarmonyOS 是否弹窗取决于系统“要求应用请求关联”开关；从设置返回后，可再次查询确认当前授权。</Note>
        <ResultPanel state={query.state} />
      </Panel>

      <Panel eyebrow="广告标识" title="读取当前广告 ID">
        <Note>读取不会申请权限。HarmonyOS 使用异步 OAID 接口；未授权或系统返回全零标识时显示 null。可以多次读取，或在系统设置中重置标识后再次读取。</Note>
        <ActionButton disabled={busy} label="读取广告标识" onPress={() => void read()} testID="tracking-read" />
        <ResultPanel state={identifier.state} />
      </Panel>

      <Panel eyebrow="接口校验" title="并发请求与错误恢复">
        <ActionRow>
          <ActionButton disabled={busy} label="验证并发权限请求" onPress={() => void concurrent()} testID="tracking-concurrent" />
          <ActionButton disabled={busy || !harmony} label="验证同步接口限制" onPress={() => void verify()} testID="tracking-sync" tone="secondary" />
        </ActionRow>
        <Note>并发检查会发起两次授权请求。HarmonyOS 的同步广告 ID 接口应返回 ERR_UNAVAILABLE，随后权限查询仍应正常工作。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
