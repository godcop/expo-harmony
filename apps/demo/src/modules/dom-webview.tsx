import { WebView, type DomWebViewRef } from '@expo/dom-webview';
import { File, Paths } from 'expo-file-system';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';
import DomCounter from './dom-webview-counter';

const HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Expo DOM WebView</title><style>
body { margin: 0; padding: 20px; font: 15px sans-serif; color: #111827; background: #EAF3FF; }
h2 { color: #007AFF; } button { padding: 12px; border: 0; border-radius: 8px; background: #007AFF; color: white; }
#bottom { margin-top: 1200px; padding: 20px; background: #EAF7ED; }
</style></head><body><h2>Expo DOM WebView</h2><p id="status">等待网页初始化</p>
<button onclick="report('message', '网页按钮消息')">网页发送消息</button>
<div id="bottom">页面底部 · 检查滚动与返回顶部</div><script>
function report(type, value, error) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ type, value, error }));
}
window.addEventListener('error', function(event) { report('error', null, event.message); });
window.addEventListener('unhandledrejection', function(event) { report('error', null, String(event.reason)); });

async function inspect() {
  let subscription;
  let timer;
  let counter;

  try {
    const module = window.ExpoDomWebView.expoModulesProxy.ExpoModuleShowcase;
    if (!module) throw new Error('缺少 ExpoModuleShowcase 原生模块');
    if (window.beforeContent !== true) throw new Error('预加载脚本没有在页面脚本之前执行');

    const value = 'DOM 中文 · "quotes" · $& · \\n';
    if (module.echo(value) !== value) throw new Error('同步调用返回值不符');
    if (await module.echoAsync(value) !== value) throw new Error('Promise 返回值不符');

    let failure;
    try { await module.failAsync(); } catch (error) { failure = error; }
    if (!failure || failure.code !== 'ERR_SHOWCASE') throw new Error('Promise 错误没有正确传回网页');

    const event = await new Promise(function(resolve, reject) {
      timer = setTimeout(function() { reject(new Error('原生事件超时')); }, 5000);
      subscription = module.addListener('onShowcaseEvent', resolve);
      module.emitEvent(value);
    });
    if (event.value !== value) throw new Error('原生事件内容不符');

    counter = new module.ShowcaseSharedCounter(2);
    if (counter.increment(3) !== 5 || await counter.incrementAsync(4) !== 9) {
      throw new Error('SharedObject 方法返回值不符');
    }

  } catch (error) {
    report('checks', null, error.message || String(error));
    return;
  } finally {
    clearTimeout(timer);
    if (subscription) subscription.remove();
    if (counter) counter.release();
  }

  report('checks', '预加载脚本、同步调用、Promise 成功与拒绝、原生事件、SharedObject：全部通过');
}

document.getElementById('status').textContent = window.beforeContent ? '预加载脚本已执行，页面就绪' : '预加载脚本未执行';
report('ready', window.beforeContent === true);
</script></body></html>`;

type Pending = {
  type: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export function DomWebViewDemo() {
  const [count, setCount] = useState(0);
  const view = useRef<DomWebViewRef>(null);
  const pending = useRef<Pending | null>(null);
  const files = useRef<File[]>([]);
  const [uri, setUri] = useState('');
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('尚未收到消息');
  const [indicators, setIndicators] = useState(true);
  const loading = useAsyncResult();
  const checks = useAsyncResult();
  const busy = loading.state.phase === 'running' || checks.state.phase === 'running';

  useEffect(() => () => {
    if (pending.current) {
      clearTimeout(pending.current.timer);
      pending.current.reject(new Error('测试页面已卸载。'));
      pending.current = null;
    }

    for (const file of files.current) {
      if (file.exists) file.delete();
    }
  }, []);

  const load = () => loading.run(async () => {
    const file = new File(Paths.cache, `dom-webview-${Date.now()}.html`);
    files.current.push(file);
    file.write(HTML);

    setReady(false);
    checks.clear();
    setUri(file.uri);

    return `已写入本地网页：${file.uri}`;
  });

  const request = async (type: string, script: string): Promise<unknown> => {
    if (!view.current || !ready) throw new Error('请先加载网页并等待就绪。');
    if (pending.current) throw new Error('已有检查正在执行。');

    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = new Promise<unknown>((resolve, reject) => {
      timer = setTimeout(() => {
        pending.current = null;
        reject(new Error(`等待网页 ${type} 响应超时。`));
      }, 15000);
      pending.current = { type, resolve, reject, timer };
    });

    try {
      const [value] = await Promise.all([response, view.current.injectJavaScript(script)]);

      return value;
    } finally {
      clearTimeout(timer);
      pending.current = null;
    }
  };

  const inject = () => checks.run(async () => {
    const value = await request('inject', 'document.getElementById("status").textContent = "原生脚本注入成功"; report("inject", document.getElementById("status").textContent); true;');
    if (value !== '原生脚本注入成功') throw new Error('注入后网页内容不符。');

    return 'injectJavaScript → DOM 更新 → onMessage：通过';
  });

  const scroll = (y: number) => checks.run(async () => {
    if (!view.current || !ready) throw new Error('请先加载网页并等待就绪。');

    await view.current.scrollTo({ x: 0, y, animated: false });
    const offset = await request('scroll', 'setTimeout(function() { report("scroll", window.scrollY); }, 100); true;');
    if (typeof offset !== 'number' || (y === 0 ? offset !== 0 : offset <= 0)) {
      throw new Error(`滚动位置不符：${String(offset)}`);
    }

    return `scrollTo → 网页 scrollY=${offset}：通过`;
  });

  return (
    <>
      <Panel eyebrow="DOM COMPONENT" title="use dom 组件与双向交互">
        <ActionRow>
          <ActionButton label="原生更新 props +1" onPress={() => setCount(value => value + 1)} testID="dom-component-increment" />
        </ActionRow>
        <DataRow label="原生端 count" value={count} />
        <DomCounter
          count={count}
          dom={{ useExpoDOMWebView: true, matchContents: true, containerStyle: styles.component, testID: 'dom-component-preview' }}
          onChange={async (value) => {
            setCount(value);

            return `原生已确认计数：${value}`;
          }}
        />
        <Note>上方按钮更新原生状态并传给 DOM 组件；网页按钮调用异步原生函数，更新同一个计数并显示返回值。</Note>
      </Panel>

      <Panel eyebrow="网页容器" title="本地页面与消息通信">
        <ActionRow>
          <ActionButton disabled={busy} label={uri ? '切换新文档' : '加载本地网页'} onPress={() => void load()} testID="dom-webview-load" />
          <ActionButton
            disabled={busy || !uri}
            label="重新挂载"
            onPress={() => {
              setReady(false);
              setGeneration(value => value + 1);
            }}
            testID="dom-webview-remount"
            tone="secondary"
          />
        </ActionRow>
        {uri
          ? (
              <WebView
                key={generation}
                ref={view}
                containerStyle={styles.webview}
                injectedJavaScriptBeforeContentLoaded="window.beforeContent = true;"
                nestedScrollEnabled
                webviewDebuggingEnabled={__DEV__}
                onMessage={({ nativeEvent }) => {
                  try {
                    const result = JSON.parse(nativeEvent.data);
                    setMessage(`${nativeEvent.title}: ${nativeEvent.data}`);
                    if (result.type === 'ready' && nativeEvent.url === uri) {
                      for (const file of files.current) {
                        if (file.uri !== uri && file.exists) file.delete();
                      }
                      files.current = files.current.filter(file => file.uri === uri);
                      setReady(result.value === true);
                    }

                    const active = pending.current;
                    if (active && (result.type === active.type || result.type === 'error')) {
                      clearTimeout(active.timer);
                      pending.current = null;
                      if (result.error) active.reject(new Error(result.error));
                      else active.resolve(result.value);
                    }
                  } catch (error) {
                    setMessage(String(error));
                  }
                }}
                showsHorizontalScrollIndicator={indicators}
                showsVerticalScrollIndicator={indicators}
                source={{ uri }}
                testID="dom-webview-preview"
              />
            )
          : <Note>生成应用缓存目录中的 HTML 文件，再交给官方 WebView 组件加载。</Note>}
        <DataRow label="页面状态" value={ready ? '已就绪，预加载脚本通过' : '等待加载'} />
        <DataRow label="最近消息" value={message} />
        <ResultPanel state={loading.state} />
      </Panel>

      <Panel eyebrow="原生桥与视图方法" title="验证网页与 Expo 模块交互">
        <ActionRow>
          <ActionButton disabled={busy || !ready} label="检查原生桥" onPress={() => void checks.run(async () => String(await request('checks', 'void inspect(); true;')))} testID="dom-webview-checks" />
          <ActionButton disabled={busy || !ready} label="注入脚本" onPress={() => void inject()} testID="dom-webview-inject" tone="secondary" />
          <ActionButton disabled={busy || !ready} label="滚动到底部" onPress={() => void scroll(2000)} testID="dom-webview-bottom" tone="secondary" />
          <ActionButton disabled={busy || !ready} label="回到顶部" onPress={() => void scroll(0)} testID="dom-webview-top" tone="secondary" />
          <ActionButton label={indicators ? '隐藏滚动条' : '显示滚动条'} onPress={() => setIndicators(value => !value)} testID="dom-webview-indicators" tone="secondary" />
        </ActionRow>
        <Note>原生桥检查使用 demo 已有的 ExpoModuleShowcase，覆盖同步、异步、错误、事件和 SharedObject。切换新文档或重新挂载后可以重复执行，检查桥接恢复。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  component: { flex: 0, width: '100%', borderRadius: 12, overflow: 'hidden' },
  webview: { flex: 0, height: 260, borderRadius: 12, overflow: 'hidden' },
});
