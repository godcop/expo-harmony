import * as SecureStore from 'expo-secure-store';
import { useState } from 'react';
import { Platform } from 'react-native';

import { ActionButton, ActionRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const SERVICE = 'expo-harmony-demo.secure-store';
const harmony = (Platform.OS as string) === 'harmony';

export function SecureStoreDemo() {
  const [key, setKey] = useState('message');
  const [value, setValue] = useState('Hello HarmonyOS · 安全存储 🔐');
  const [service, setService] = useState(SERVICE);
  const [prompt, setPrompt] = useState('验证身份以读取演示数据');
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const authentication = useAsyncResult();
  const busy = [action, checks, authentication].some(result => result.state.phase === 'running');
  const options = { keychainService: service };
  const protectedOptions = { keychainService: `${SERVICE}.biometric`, requireAuthentication: true, authenticationPrompt: prompt };

  const inspect = () => action.run(async () => JSON.stringify({
    available: await SecureStore.isAvailableAsync(),
    biometrics: SecureStore.canUseBiometricAuthentication(),
  }, null, 2));

  return (
    <>
      <Panel eyebrow="存储" title="读写与重启后读回">
        <Field label="服务" onChangeText={setService} testID="secure-store-service" value={service} />
        <Field label="键" onChangeText={setKey} testID="secure-store-key" value={key} />
        <Field label="值" multiline onChangeText={setValue} testID="secure-store-value" value={value} />
        <ActionRow>
          <ActionButton
            disabled={busy}
            label="异步写入"
            onPress={() => void action.run(async () => {
              await SecureStore.setItemAsync(key, value, options);

              return '已写入。关闭并重新打开应用后，可使用相同服务与键读取。';
            })}
            testID="secure-store-write"
          />
          <ActionButton disabled={busy} label="异步读取" onPress={() => void action.run(async () => JSON.stringify(await SecureStore.getItemAsync(key, options)))} testID="secure-store-read" tone="secondary" />
          <ActionButton
            disabled={busy}
            label="同步写入"
            onPress={() => void action.run(() => {
              SecureStore.setItem(key, value, options);

              return '同步写入完成。';
            })}
            testID="secure-store-write-sync"
            tone="secondary"
          />
          <ActionButton disabled={busy} label="同步读取" onPress={() => void action.run(() => JSON.stringify(SecureStore.getItem(key, options)))} testID="secure-store-read-sync" tone="secondary" />
          <ActionButton
            disabled={busy}
            label="删除"
            onPress={() => void action.run(async () => {
              await SecureStore.deleteItemAsync(key, options);

              return `删除后读取：${JSON.stringify(await SecureStore.getItemAsync(key, options))}`;
            })}
            testID="secure-store-delete"
            tone="danger"
          />
          <ActionButton disabled={busy} label="检查可用性" onPress={() => void inspect()} testID="secure-store-inspect" tone="secondary" />
        </ActionRow>
        <Note>仅填写演示数据。读取结果显示在页面上；更换服务后，同一个键可以保存独立的值。</Note>
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="回归检查" title="内容、隔离、并发与错误恢复">
        <ActionRow>
          <ActionButton disabled={busy} label="运行读写检查" onPress={() => void checks.run(verify)} testID="secure-store-verify" />
          <ActionButton disabled={busy} label="运行边界检查" onPress={() => void checks.run(boundaries)} testID="secure-store-boundaries" tone="secondary" />
        </ActionRow>
        <Note>使用独立的临时服务，完成后自动删除测试数据。HarmonyOS 边界检查包含 1023 字节上限及超限后原值保留。</Note>
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="认证" title="生物认证与取消">
        <Field label="认证提示" onChangeText={setPrompt} testID="secure-store-prompt" value={prompt} />
        <ActionRow>
          <ActionButton
            disabled={busy}
            label="写入认证数据"
            onPress={() => void authentication.run(async () => {
              await SecureStore.setItemAsync('protected', value, protectedOptions);

              return '认证数据已写入。再次写入或读取时验证身份。';
            })}
            testID="secure-store-auth-write"
          />
          <ActionButton
            disabled={busy}
            label="读取认证数据"
            onPress={() => void authentication.run(async () => JSON.stringify(await SecureStore.getItemAsync('protected', {
              keychainService: protectedOptions.keychainService,
              authenticationPrompt: prompt,
            })))}
            testID="secure-store-auth-read"
            tone="secondary"
          />
          <ActionButton disabled={busy} label="同步读取认证数据" onPress={() => void authentication.run(() => JSON.stringify(SecureStore.getItem('protected', protectedOptions)))} testID="secure-store-auth-sync" tone="secondary" />
          <ActionButton
            disabled={busy}
            label="删除认证数据"
            onPress={() => void authentication.run(async () => {
              await SecureStore.deleteItemAsync('protected', protectedOptions);

              return '认证数据已删除。';
            })}
            testID="secure-store-auth-delete"
            tone="danger"
          />
        </ActionRow>
        <Note>需要已录入的强生物认证。可取消系统认证框验证错误返回，或在系统设置中变更生物信息后读回验证失效。HarmonyOS 同步读取有效认证数据会提示使用异步接口；模拟器可能不提供生物认证。</Note>
        <ResultPanel state={authentication.state} />
      </Panel>
    </>
  );
}

async function verify(): Promise<string> {
  const service = `${SERVICE}.checks.${Date.now()}`;
  const options = { keychainService: service };
  const other = { keychainService: `${service}-a` };
  const rows: string[] = [];

  try {
    await SecureStore.deleteItemAsync('value', options);
    await SecureStore.deleteItemAsync('value', options);
    if (await SecureStore.getItemAsync('value', options) !== null || SecureStore.getItem('value', options) !== null) {
      throw new Error('不存在的键没有返回 null。');
    }
    rows.push('缺失值与重复删除：通过');

    for (const value of ['', 'Hello HarmonyOS', '中文 🔐\n第二行\t\0', '\uFEFF保留 BOM']) {
      try {
        await SecureStore.setItemAsync('value', value, options);
        if (await SecureStore.getItemAsync('value', options) !== value || SecureStore.getItem('value', options) !== value) {
          throw new Error('异步写入或同步读回失败。');
        }

        SecureStore.setItem('value', `${value}!`, options);
        if (await SecureStore.getItemAsync('value', options) !== `${value}!`) {
          throw new Error('同步覆盖或异步读回失败。');
        }
      } catch (error) {
        throw new Error(`检查值 ${JSON.stringify(value)} 失败：${String(error)}`);
      }
    }
    rows.push('空字符串、Unicode、换行、NUL、BOM 及同步/异步交叉读写：通过');

    await SecureStore.setItemAsync('a-b', 'first service', options);
    await SecureStore.setItemAsync('b', 'second service', other);
    if (await SecureStore.getItemAsync('a-b', options) !== 'first service'
      || await SecureStore.getItemAsync('b', other) !== 'second service'
      || await SecureStore.getItemAsync('a-b', other) !== null) {
      throw new Error('服务与键的命名空间发生碰撞。');
    }
    rows.push('服务隔离与分隔符碰撞：通过');

    const results = await Promise.all([
      SecureStore.setItemAsync('value', 'first', options),
      SecureStore.getItemAsync('value', options),
      SecureStore.setItemAsync('value', 'second', options),
      SecureStore.getItemAsync('value', options),
    ]);
    if (results[1] !== 'first' || results[3] !== 'second') {
      throw new Error(`并发操作顺序不符：${JSON.stringify(results)}`);
    }
    rows.push('同键并发读写顺序：通过');

    await SecureStore.deleteItemAsync('value', options);
    if (SecureStore.getItem('value', options) !== null) throw new Error('删除后仍能读取旧值。');
    rows.push('删除后读回：通过');

    return rows.join('\n');
  } finally {
    await Promise.all([
      SecureStore.deleteItemAsync('value', options),
      SecureStore.deleteItemAsync('a-b', options),
      SecureStore.deleteItemAsync('b', other),
    ]);
  }
}

async function boundaries(): Promise<string> {
  const options = { keychainService: `${SERVICE}.limits.${Date.now()}` };
  const rows: string[] = [];

  try {
    for (const key of ['', 'with space', 'slash/key', '中文']) {
      await rejects(() => SecureStore.setItemAsync(key, 'value', options));
      await rejects(() => SecureStore.getItem(key, options));
      await rejects(() => SecureStore.deleteItemAsync(key, options));
    }
    rows.push('非法键的读写与删除：正确拒绝');

    if (harmony) {
      for (const value of ['x'.repeat(1023), '中'.repeat(341)]) {
        await SecureStore.setItemAsync('value', value, options);
        if (SecureStore.getItem('value', options) !== value) throw new Error('1023 字节值读回不一致。');
      }
      rows.push('ASCII / 中文 1023 字节边界：通过');

      await SecureStore.setItemAsync('value', 'retained', options);
      for (const value of ['x'.repeat(1024), '中'.repeat(342)]) {
        await rejects(() => SecureStore.setItemAsync('value', value, options), 'ERR_SECURE_STORE_VALUE_TOO_LARGE');
        await rejects(() => SecureStore.setItem('value', value, options), 'ERR_SECURE_STORE_VALUE_TOO_LARGE');
        if (await SecureStore.getItemAsync('value', options) !== 'retained') throw new Error('超限写入破坏了旧值。');
      }
      rows.push('同步/异步超限错误码与原值保留：通过');

      await rejects(() => SecureStore.getItemAsync('value', { ...options, accessGroup: 'unsupported' }), 'ERR_SECURE_STORE_UNSUPPORTED_OPTION');
      rows.push('不支持的 accessGroup：正确拒绝');
    }

    await SecureStore.setItemAsync('value', 'recovered', options);
    if (SecureStore.getItem('value', options) !== 'recovered') throw new Error('错误后无法继续读写。');
    rows.push('错误恢复：通过');

    return rows.join('\n');
  } finally {
    await SecureStore.deleteItemAsync('value', options);
  }
}

async function rejects(operation: () => unknown, code?: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof Error) || (code !== undefined && (!('code' in error) || error.code !== code))) {
      throw new Error(`预期错误 ${code ?? 'Error'}，实际：${String(error)}`);
    }

    return;
  }

  throw new Error(`操作未拒绝，预期：${code ?? 'Error'}`);
}
