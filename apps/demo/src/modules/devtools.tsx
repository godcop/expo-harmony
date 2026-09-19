import { reloadAppAsync } from 'expo';
import { useEffect, useRef, useState } from 'react';
import { NativeModules } from 'react-native';
import { ActionButton, ActionRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';
import { checkCancellation, checkFetch, checkFiles } from './devtools/network';

export function DevToolsDemo() {
  const action = useAsyncResult();
  const reload = useAsyncResult();
  const [address, setAddress] = useState(() => {
    const bundle = NativeModules.SourceCode?.scriptURL as string | undefined;
    return bundle?.startsWith('http') ? new URL(bundle).origin : 'http://127.0.0.1:8088';
  });
  const controller = useRef<AbortController | null>(null);
  const busy = action.state.phase === 'running';

  useEffect(() => () => controller.current?.abort(), []);

  function request(check: (base: URL, controller: AbortController) => Promise<string>) {
    return action.run(async () => {
      const base = new URL('/__devtools__/', address.trim());
      const pending = new AbortController();
      controller.current = pending;
      const timer = setTimeout(() => pending.abort(), 20000);

      try {
        return await check(base, pending);
      } finally {
        clearTimeout(timer);
        if (controller.current === pending) controller.current = null;
      }
    });
  }

  return (
    <>
      <Panel eyebrow="NETWORK INSPECTION" title="Expo 原生网络检查">
        <Note>
          先连接 React Native DevTools 的 Network 面板。这里使用 demo Metro 的本地响应，不访问外网。
          页面校验真实传输结果；Network 中还需核对文本、二进制、1 MiB 边界、流式响应及文件上传的预览策略。
        </Note>
        <Field label="Demo Metro 地址" value={address} onChangeText={setAddress} />
        <ActionRow>
          <ActionButton label="校验 Fetch 响应" testID="devtools-fetch" disabled={busy} onPress={() => void request(checkFetch)} />
          <ActionButton label="校验文件传输" testID="devtools-files" disabled={busy} onPress={() => void action.run(() => checkFiles(new URL('/__devtools__/', address.trim())))} />
          <ActionButton label="校验请求取消" testID="devtools-cancel" disabled={busy} onPress={() => void request(checkCancellation)} />
          <ActionButton label="中止 Fetch" tone="danger" disabled={!busy || controller.current === null} onPress={() => controller.current?.abort()} />
        </ActionRow>
        <ResultPanel state={action.state} />
      </Panel>
      <Panel eyebrow="DEV CLIENT" title="运行时重新加载">
        <Note>开发模式：{String(__DEV__)}。重载会重新创建应用，页面状态随之重置；Home、偏好设置和错误查看分别在启动器、开发菜单和 LogBox 卡片中验证。</Note>
        <ActionButton
          label="重新加载应用"
          testID="devtools-reload"
          disabled={busy || reload.state.phase === 'running'}
          onPress={() => void reload.run(async () => {
            await reloadAppAsync('DevTools demo');
            return '已请求重新加载';
          })}
        />
        <ResultPanel state={reload.state} />
      </Panel>
    </>
  );
}
