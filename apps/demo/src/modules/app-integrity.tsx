import * as AppIntegrity from '@expo/app-integrity';
import { randomUUID } from 'expo-crypto';
import { useState } from 'react';
import { Platform } from 'react-native';

import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const harmony = (Platform.OS as string) === 'harmony';

export function AppIntegrityDemo() {
  const [alias, setAlias] = useState('expo-harmony-demo.app-integrity');
  const [challenge, setChallenge] = useState(() => randomUUID());
  const support = useAsyncResult();
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [support, action, checks].some(result => result.state.phase === 'running');

  const run = (operation: () => Promise<unknown>) => action.run(async () => {
    try {
      return JSON.stringify(await operation(), null, 2) ?? '完成';
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';

      throw new Error(`[${code}] ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return (
    <>
      <Panel eyebrow="系统能力" title="检查证明服务支持情况">
        <DataRow label="App Attest" value={String(AppIntegrity.isSupported)} />
        <ActionButton
          disabled={busy}
          label="检查硬件证明能力"
          onPress={() => void support.run(async () => JSON.stringify({
            hardware: await AppIntegrity.isHardwareAttestationSupportedAsync(),
          }, null, 2))}
          testID="app-integrity-support"
        />
        <Note>HarmonyOS 的能力检查只确认 HUKS 和证书接口存在。证明服务仍可能拒绝请求；模拟器证书仅供调试，取得证书后仍需后端验证。</Note>
        <ResultPanel state={support.state} />
      </Panel>

      <Panel eyebrow="硬件密钥" title="生成证明与读取证书链">
        <Field editable={!busy} label="密钥别名" onChangeText={setAlias} testID="app-integrity-alias" value={alias} />
        <Field editable={!busy} label="Challenge" onChangeText={setChallenge} testID="app-integrity-challenge" value={challenge} />
        <ActionRow>
          <ActionButton
            disabled={busy}
            label="生成硬件证明"
            onPress={() => void run(async () => {
              await AppIntegrity.generateHardwareAttestedKeyAsync(alias, challenge);

              return '密钥和证明已保存，可读取证书链。';
            })}
            testID="app-integrity-generate"
          />
          <ActionButton
            disabled={busy}
            label="读取证书链"
            onPress={() => void run(async () => {
              const chain = await AppIntegrity.getAttestationCertificateChainAsync(alias);

              return {
                count: chain.length,
                certificates: chain.map(value => ({ length: value.length, prefix: value.slice(0, 64) })),
              };
            })}
            testID="app-integrity-read"
            tone="secondary"
          />
          <ActionButton disabled={busy} label="更换 Challenge" onPress={() => setChallenge(randomUUID())} testID="app-integrity-challenge-new" tone="secondary" />
        </ActionRow>
        <Note>相同别名会替换原密钥。成功后可重启应用，以相同别名再次读取；失败后读取应拒绝。这里的 Challenge 只用于演示，业务中应由服务端生成并验证。</Note>
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="回归检查" title="证书读回、参数与平台边界">
        <ActionRow>
          <ActionButton
            disabled={busy}
            label="校验证书读回"
            onPress={() => void checks.run(async () => {
              const first = await AppIntegrity.getAttestationCertificateChainAsync(alias);
              const second = await AppIntegrity.getAttestationCertificateChainAsync(alias);
              if (first.length === 0 || first.some(value => !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0)) {
                throw new Error('证书链应为非空的 Base64 DER 字符串数组。');
              }
              if (JSON.stringify(first) !== JSON.stringify(second)) {
                throw new Error('未替换密钥时，两次读取的证书链不一致。');
              }

              return `${first.length} 张证书的 Base64 格式和重复读回一致性：通过`;
            })}
            testID="app-integrity-verify"
          />
          <ActionButton disabled={busy || !harmony} label="校验参数边界" onPress={() => void checks.run(boundaries)} testID="app-integrity-boundaries" tone="secondary" />
          <ActionButton disabled={busy || !harmony} label="校验平台限制" onPress={() => void checks.run(platforms)} testID="app-integrity-platforms" tone="secondary" />
        </ActionRow>
        <Note>证书读回检查需要先成功生成。HarmonyOS 边界检查覆盖空别名、UTF-8 字节上限、缺失证书及错误后的再次调用；平台检查覆盖全部 Apple / Google 专用接口。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}

async function boundaries(): Promise<string> {
  const supported = await AppIntegrity.isHardwareAttestationSupportedAsync();
  const code = supported ? 'ERR_APP_INTEGRITY_INVALID_INPUT' : 'ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_NOT_SUPPORTED';

  for (const alias of ['', 'x'.repeat(128), '中'.repeat(43)]) {
    await rejects(() => AppIntegrity.generateHardwareAttestedKeyAsync(alias, 'challenge'), code);
    await rejects(() => AppIntegrity.getAttestationCertificateChainAsync(alias), code);
  }

  await rejects(
    () => AppIntegrity.getAttestationCertificateChainAsync(randomUUID()),
    supported ? 'ERR_APP_INTEGRITY_HARDWARE_ATTESTATION_CERTIFICATE_CHAIN_INVALID' : code
  );
  if (await AppIntegrity.isHardwareAttestationSupportedAsync() !== supported) {
    throw new Error('错误后的硬件能力查询结果不一致。');
  }

  return supported
    ? '空别名、ASCII / 中文超限、缺失证书、错误后再次调用：通过'
    : '设备不支持硬件证明，生成与读取均正确拒绝；错误后再次查询：通过';
}

async function platforms(): Promise<string> {
  if (AppIntegrity.isSupported) {
    throw new Error('HarmonyOS 的 App Attest 支持常量应为 false。');
  }

  const apple = 'ERR_APP_INTEGRITY_FEATURE_UNSUPPORTED';
  await rejects(() => AppIntegrity.generateKeyAsync(), apple);
  await rejects(() => AppIntegrity.attestKeyAsync('key', 'challenge'), apple);
  await rejects(() => AppIntegrity.generateAssertionAsync('key', 'challenge'), apple);

  const google = 'ERR_APP_INTEGRITY_API_NOT_AVAILABLE';
  await rejects(() => AppIntegrity.prepareIntegrityTokenProviderAsync('123456789'), google);
  await rejects(() => AppIntegrity.requestIntegrityCheckAsync('request-hash'), google);

  return 'App Attest 支持常量、3 个 Apple 接口与 2 个 Google 接口的错误码：通过';
}

async function rejects(operation: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== code) {
      throw new Error(`预期 ${code}，实际：${String(error)}`);
    }

    return;
  }

  throw new Error(`操作未拒绝，预期 ${code}`);
}
