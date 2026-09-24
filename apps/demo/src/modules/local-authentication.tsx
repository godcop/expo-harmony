import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef, useState } from 'react';
import { Platform, Switch } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

type Capabilities = {
  hardware: boolean;
  enrolled: boolean;
  types: LocalAuthentication.AuthenticationType[];
  level: LocalAuthentication.SecurityLevel;
};

export function LocalAuthenticationDemo() {
  const [capabilities, setCapabilities] = useState<Capabilities>();
  const [prompt, setPrompt] = useState('验证身份以继续');
  const [label, setLabel] = useState('取消认证');
  const [fallback, setFallback] = useState(true);
  const [strong, setStrong] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(false);
  const query = useAsyncResult();
  const auth = useAsyncResult();
  const cancel = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [query, auth, cancel, checks].some(action => action.state.phase === 'running');
  const harmony = String(Platform.OS) === 'harmony';
  const cancellable = harmony || Platform.OS === 'android';

  useEffect(() => () => {
    clearTimeout(timer.current);

    if (active.current && cancellable) {
      void LocalAuthentication.cancelAuthenticate().catch(error => console.warn(error));
    }
  }, [cancellable]);

  const inspect = () => query.run(async () => {
    const [hardware, enrolled, types, level] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
      LocalAuthentication.getEnrolledLevelAsync(),
    ]);

    const methods = [
      LocalAuthentication.AuthenticationType.FINGERPRINT,
      LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
      LocalAuthentication.AuthenticationType.IRIS,
    ];
    const levels = [
      LocalAuthentication.SecurityLevel.NONE,
      LocalAuthentication.SecurityLevel.SECRET,
      LocalAuthentication.SecurityLevel.BIOMETRIC_WEAK,
      LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG,
    ];

    if (typeof hardware !== 'boolean' || typeof enrolled !== 'boolean'
      || types.some(type => !methods.includes(type)) || !levels.includes(level)) {
      throw new Error('设备能力返回值不符合官方接口约定。');
    }

    const result = { hardware, enrolled, types, level };

    setCapabilities(result);

    return json(result);
  });

  const stop = () => cancel.run(async () => {
    await LocalAuthentication.cancelAuthenticate();

    return 'cancelAuthenticate() 已完成，请同时查看认证结果。';
  });

  const authenticate = (automatic = false) => auth.run(async () => {
    active.current = true;
    cancel.clear();

    if (automatic) {
      timer.current = setTimeout(() => {
        if (active.current) void stop();
      }, 1000);
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: prompt,
        cancelLabel: label,
        disableDeviceFallback: !fallback,
        biometricsSecurityLevel: strong ? 'strong' : 'weak',
      });

      return json(result);
    } finally {
      clearTimeout(timer.current);
      timer.current = undefined;
      active.current = false;
    }
  });

  const verify = () => checks.run(async () => {
    const results: string[] = [];
    const prompts = harmony ? ['', 'A'.repeat(501)] : [''];

    for (const prompt of prompts) {
      let rejected = false;

      try {
        await LocalAuthentication.authenticateAsync({ promptMessage: prompt });
      } catch (error) {
        rejected = true;
        results.push(`${prompt.length} 字符：${String(error)}`);
      }

      if (!rejected) throw new Error(`${prompt.length} 字符的无效提示未被拒绝。`);
    }

    if (cancellable) {
      await LocalAuthentication.cancelAuthenticate();
      await LocalAuthentication.cancelAuthenticate();
      results.push('没有认证请求时，连续取消均正常返回。');
    }

    return results.join('\n');
  });

  return (
    <>
      <Panel eyebrow="设备能力" title="查看认证方式与录入状态">
        <DataRow label="生物识别硬件" value={capabilities ? String(capabilities.hardware) : '尚未读取'} />
        <DataRow label="已录入生物凭据" value={capabilities ? String(capabilities.enrolled) : '尚未读取'} />
        <DataRow label="认证方式" value={capabilities ? capabilities.types.map(type => LocalAuthentication.AuthenticationType[type]).join('、') || '无' : '尚未读取'} />
        <DataRow label="安全等级" value={capabilities ? LocalAuthentication.SecurityLevel[capabilities.level] : '尚未读取'} />
        <ActionButton disabled={busy} label="读取并校验设备能力" onPress={() => void inspect()} testID="local-authentication-inspect" />
        <ResultPanel state={query.state} />
      </Panel>

      <Panel eyebrow="系统认证" title="指纹、人脸与锁屏密码">
        <Field editable={!busy} label="认证提示" onChangeText={setPrompt} testID="local-authentication-prompt" value={prompt} />
        <Field editable={!busy} label="取消按钮文字" onChangeText={setLabel} testID="local-authentication-label" value={label} />
        <DataRow label="允许锁屏密码回退" value={<Switch disabled={busy} onValueChange={setFallback} testID="local-authentication-fallback" value={fallback} />} />
        <DataRow label="仅允许强生物识别" value={<Switch disabled={busy} onValueChange={setStrong} testID="local-authentication-strong" value={strong} />} />
        <ActionRow>
          <ActionButton disabled={busy} label="开始认证" onPress={() => void authenticate()} testID="local-authentication-authenticate" />
          <ActionButton disabled={busy || !cancellable} label="认证并在 1 秒后取消" onPress={() => void authenticate(true)} testID="local-authentication-auto-cancel" tone="secondary" />
          <ActionButton disabled={!cancellable || cancel.state.phase === 'running' || checks.state.phase === 'running'} label="取消认证" onPress={() => void stop()} testID="local-authentication-cancel" tone="secondary" />
        </ActionRow>
        <Note>是否通过认证以返回值 success 为准。没有可用凭据时认证会直接返回；自动取消仅在请求仍未结束时执行。</Note>
        <ResultPanel state={auth.state} />
        <ResultPanel state={cancel.state} />
      </Panel>

      <Panel eyebrow="接口校验" title="参数边界与重复取消">
        <Note>检查空提示是否被拒绝；HarmonyOS 额外检查 501 字符的提示。随后在没有请求时连续取消两次。</Note>
        <ActionButton disabled={busy} label="运行边界检查" onPress={() => void verify()} testID="local-authentication-verify" />
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="平台行为" title="设备能力决定可验证范围">
        <Note>HarmonyOS 弱、强生物等级分别使用 ATL2、ATL3。关闭密码回退后只进行生物认证；仅有锁屏密码时，开启回退可验证密码流程。</Note>
        <Note>模拟器可能没有生物识别硬件或已录入凭据。查询返回 false、空列表，或认证返回 not_available / not_enrolled 都是有效结果，不能代替真机上的认证成功验证。</Note>
      </Panel>
    </>
  );
}
