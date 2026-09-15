import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function UpdatesDemo() {
  const state = Updates.useUpdates();
  const action = useAsyncResult();
  const queue = useAsyncResult();
  const params = useAsyncResult();
  const busy = state.isChecking || state.isDownloading || state.isRestarting || [action, queue, params].some(value => value.state.phase === 'running');

  return (
    <>
      <Panel eyebrow="EXPO UPDATES" title={process.env.EXPO_PUBLIC_UPDATE_LABEL ?? 'Embedded demo'}>
        <DataRow label="已启用" value={String(Updates.isEnabled)} />
        <DataRow label="运行时" value={Updates.runtimeVersion ?? '未配置'} />
        <DataRow label="更新 ID" value={Updates.updateId ?? '开发服务'} />
        <DataRow label="内置更新" value={String(Updates.isEmbeddedLaunch)} />
        <DataRow label="使用内置资产" value={String(Updates.isUsingEmbeddedAssets)} />
        <DataRow label="紧急启动" value={String(Updates.isEmergencyLaunch)} />
        <DataRow label="下载进度" value={`${Math.round((state.downloadProgress ?? 0) * 100)}%`} />
        <DataRow label="可用 / 待重载" value={`${state.isUpdateAvailable} / ${state.isUpdatePending}`} />
        {!Updates.isEnabled ? <Note>配置 updates.url 与 runtimeVersion 后构建应用；普通 Metro 开发模式不启用 OTA。</Note> : null}
        <DataRow label="Constants 更新 ID" value={Constants.manifest2?.id ?? Constants.manifest?.id ?? '无'} />
      </Panel>
      <Panel eyebrow="更新操作" title="检查、下载与重载">
        <ActionButton label="检查更新" disabled={busy || !Updates.isEnabled} onPress={() => void action.run(async () => json(await Updates.checkForUpdateAsync()))} />
        <ActionButton label="下载更新" disabled={busy || !Updates.isEnabled} onPress={() => void action.run(async () => json(await Updates.fetchUpdateAsync()))} />
        <ActionButton
          label="重载应用"
          disabled={busy || !Updates.isEnabled}
          onPress={() => void action.run(async () => {
            await Updates.reloadAsync({ reloadScreenOptions: { backgroundColor: '#F2F2F7', fade: true } });

            return '重载已开始';
          })}
        />
        <ActionButton label="读取更新日志" disabled={busy} onPress={() => void action.run(async () => json(await Updates.readLogEntriesAsync()))} />
        <ActionButton
          label="清空更新日志"
          disabled={busy}
          onPress={() => void action.run(async () => {
            await Updates.clearLogEntriesAsync();

            return '日志已清空';
          })}
        />
        <ResultPanel state={action.state} />
      </Panel>
      <Panel eyebrow="状态与队列" title="官方 Hook 和并发检查">
        <DataRow label="检查 / 下载 / 重载" value={`${state.isChecking} / ${state.isDownloading} / ${state.isRestarting}`} />
        <DataRow label="检查错误" value={state.checkError?.message ?? '无'} />
        <DataRow label="下载错误" value={state.downloadError?.message ?? '无'} />
        <Note>同时提交两次检查，可观察原生队列依次执行。请求失败后可以再次检查，确认队列仍能继续。</Note>
        <ActionRow>
          <ActionButton
            label="并发检查两次"
            disabled={busy || !Updates.isEnabled}
            onPress={() => void queue.run(async () => {
              const results = await Promise.allSettled([Updates.checkForUpdateAsync(), Updates.checkForUpdateAsync()]);

              return json(results.map(result => result.status === 'fulfilled'
                ? { status: result.status, value: result.value }
                : { status: result.status, error: String(result.reason) }));
            })}
            testID="updates-concurrent-check"
          />
        </ActionRow>
        <ResultPanel state={queue.state} />
      </Panel>
      <Panel eyebrow="请求参数" title="持久化额外参数">
        <Note>额外参数会随下一次更新请求发送，并在应用重启后保留。</Note>
        <ActionButton
          label="设置示例参数"
          disabled={busy || !Updates.isEnabled}
          onPress={() => void params.run(async () => {
            await Updates.setExtraParamAsync('demo', 'harmony');

            return json(await Updates.getExtraParamsAsync());
          })}
        />
        <ActionButton label="读取请求参数" disabled={busy || !Updates.isEnabled} onPress={() => void params.run(async () => json(await Updates.getExtraParamsAsync()))} />
        <ActionButton
          label="清除示例参数"
          disabled={busy || !Updates.isEnabled}
          onPress={() => void params.run(async () => {
            await Updates.setExtraParamAsync('demo', null);

            return json(await Updates.getExtraParamsAsync());
          })}
        />
        <ResultPanel state={params.state} />
      </Panel>
    </>
  );
}
