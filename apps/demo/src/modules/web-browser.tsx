import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function WebBrowserDemo() {
  const [url, setUrl] = useState('https://example.com');
  const [redirect, setRedirect] = useState(() => Linking.createURL('module/web-browser'));
  const active = useRef(false);
  const browser = useAsyncResult();
  const session = useAsyncResult();
  const checks = useAsyncResult();
  const harmony = String(Platform.OS) === 'harmony';
  const cancellable = Platform.OS !== 'android';
  const busy = [browser, session, checks].some(action => action.state.phase === 'running');

  useEffect(() => () => {
    if (active.current && cancellable) WebBrowser.dismissAuthSession();
  }, [cancellable]);

  const inspect = () => checks.run(async () => {
    const [browsers, warm, init, cool] = await Promise.all([
      WebBrowser.getCustomTabsSupportingBrowsersAsync(),
      WebBrowser.warmUpAsync(),
      WebBrowser.mayInitWithUrlAsync(url),
      WebBrowser.coolDownAsync(),
    ]);
    const complete = WebBrowser.maybeCompleteAuthSession();

    if (harmony && (browsers.browserPackages.length !== 0 || browsers.servicePackages.length !== 0
      || browsers.defaultBrowserPackage !== undefined || browsers.preferredBrowserPackage !== undefined
      || [warm, init, cool].some(value => Object.keys(value).length !== 0) || complete.type !== 'failed')) {
      throw new Error('非 Android / Web 平台的兼容返回值不符合预期。');
    }

    return json({ browsers, warm, init, cool, complete });
  });

  const open = () => browser.run(async () => {
    const result = await WebBrowser.openBrowserAsync(url);

    if (harmony && result.type !== WebBrowser.WebBrowserResultType.OPENED) throw new Error(`预期 opened，实际为 ${result.type}。`);

    return json(result);
  });

  const authenticate = () => session.run(async () => {
    active.current = true;

    try {
      const result = await WebBrowser.openAuthSessionAsync(url, redirect || null);

      if (result.type === 'success' && !result.url.startsWith(redirect)) throw new Error('回跳 URL 与配置的前缀不符。');

      return json(result);
    } finally {
      active.current = false;
    }
  });

  const verify = () => checks.run(async () => {
    const cases: [string, () => Promise<unknown>][] = [
      ['ERR_WEB_BROWSER_INVALID_URL', () => WebBrowser.openBrowserAsync('not a URL')],
      ['ERR_WEB_BROWSER_INVALID_URL', () => WebBrowser.openBrowserAsync('file:///tmp/browser.html')],
      ['ERR_WEB_BROWSER_INVALID_URL', () => WebBrowser.openBrowserAsync('https://')],
      ['ERR_WEB_BROWSER_INVALID_URL', () => WebBrowser.openAuthSessionAsync('https://example.com', 'invalid redirect')],
      ['ERR_WEB_BROWSER_DISMISS_UNAVAILABLE', () => WebBrowser.dismissBrowser()],
    ];
    const rows: string[] = [];

    for (let attempt = 1; attempt <= 2; attempt++) {
      for (const [code, operation] of cases) {
        let failure: unknown;

        try {
          await operation();
        } catch (error) {
          failure = error;
        }

        if (!(failure instanceof Error) || !('code' in failure) || failure.code !== code) {
          throw new Error(`预期 ${code}，实际 ${String(failure)}。`);
        }

        rows.push(`第 ${attempt} 轮：${code}`);
      }
    }

    WebBrowser.dismissAuthSession();

    return `${rows.join('\n')}\n无会话 dismissAuthSession：通过\n参数与错误恢复检查通过。`;
  });

  const concurrent = () => checks.run(async () => {
    const address = new URL(url);

    if (/\s/.test(url) || !['http:', 'https:'].includes(address.protocol) || !address.hostname) {
      throw new Error('并发校验需要有效的 HTTP/HTTPS URL。');
    }

    active.current = true;
    const pending = WebBrowser.openAuthSessionAsync(url, redirect || null);
    const completion = Promise.allSettled([pending]);

    try {
      const [auth, browser] = await Promise.allSettled([
        WebBrowser.openAuthSessionAsync(url, redirect || null),
        WebBrowser.openBrowserAsync(url),
      ]);

      if (auth.status !== 'rejected' || auth.reason?.code !== 'ERR_WEB_BROWSER_ALREADY_OPEN') {
        throw new Error('并发认证应返回 ERR_WEB_BROWSER_ALREADY_OPEN。');
      }
      if (browser.status !== 'fulfilled' || browser.value.type !== WebBrowser.WebBrowserResultType.LOCKED) {
        throw new Error('认证期间打开浏览器应返回 locked。');
      }

      WebBrowser.dismissAuthSession();
      const [result] = await completion;

      if (result.status !== 'fulfilled' || result.value.type !== WebBrowser.WebBrowserResultType.DISMISS) {
        throw new Error('主动结束认证应返回 dismiss。');
      }

      return '并发认证：ERR_WEB_BROWSER_ALREADY_OPEN\n并发浏览器：locked\n主动结束认证：dismiss';
    } finally {
      WebBrowser.dismissAuthSession();
      active.current = false;
    }
  });

  return (
    <>
      <Panel eyebrow="系统浏览器" title="打开网页">
        <Field label="网页或认证 URL" onChangeText={setUrl} testID="web-browser-url" value={url} />
        <ActionButton disabled={busy || !url} label="打开浏览器" onPress={() => void open()} testID="web-browser-open" />
        <Note>HarmonyOS 启动外部浏览器后返回 opened。查看网页后返回 demo；该结果不表示网页已加载完成。</Note>
        <ResultPanel state={browser.state} />
      </Panel>

      <Panel eyebrow="认证会话" title="回跳与返回结果">
        <Field label="回跳 URL（留空只验证结束等待）" onChangeText={setRedirect} testID="web-browser-redirect" value={redirect} />
        <DataRow label="回跳前缀" value={redirect || '未配置'} />
        <ActionRow>
          <ActionButton disabled={busy || !url} label="开始认证会话" onPress={() => void authenticate()} testID="web-browser-auth" />
          <ActionButton disabled={session.state.phase !== 'running' || !cancellable} label="结束认证等待" onPress={() => WebBrowser.dismissAuthSession()} testID="web-browser-dismiss" tone="secondary" />
        </ActionRow>
        <Note>从浏览器打开以该前缀开头的回跳链接，应返回 success 和完整 URL。直接切回 demo 应返回 dismiss。默认网页用于验证会话，不执行真实登录。</Note>
        <ResultPanel state={session.state} />
      </Panel>

      <Panel eyebrow="接口校验" title="兼容返回、错误恢复与并发">
        <ActionRow>
          <ActionButton disabled={busy} label="检查平台兼容接口" onPress={() => void inspect()} testID="web-browser-inspect" />
          <ActionButton disabled={busy || !harmony} label="验证参数与错误恢复" onPress={() => void verify()} testID="web-browser-verify" tone="secondary" />
          <ActionButton disabled={busy || !harmony || !url} label="验证并发与主动结束" onPress={() => void concurrent()} testID="web-browser-concurrent" tone="secondary" />
        </ActionRow>
        <Note>错误与并发校验为 HarmonyOS 专用。并发校验会启动浏览器，随后结束本模块的等待；外部浏览器仍需手动返回。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
