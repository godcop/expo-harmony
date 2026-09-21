import * as SMS from 'expo-sms';
import { useState } from 'react';
import { Platform } from 'react-native';

import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function SMSDemo() {
  const [addresses, setAddresses] = useState('');
  const [message, setMessage] = useState('Expo SMS · 中文 & + ? # % 😀\n第二行');
  const [available, setAvailable] = useState<boolean>();
  const status = useAsyncResult();
  const composer = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [status, composer, checks].some(item => item.state.phase === 'running');
  const harmony = String(Platform.OS) === 'harmony';
  const recipients = addresses.split(',').map(value => value.trim()).filter(Boolean);

  const inspect = () => status.run(async () => {
    const value = await SMS.isAvailableAsync();
    if (typeof value !== 'boolean') throw new Error('短信能力查询应返回 boolean。');

    setAvailable(value);

    return `isAvailableAsync() → ${value}`;
  });

  const open = (addresses: string | string[], options?: SMS.SMSOptions) => composer.run(async () => {
    const result = await SMS.sendSMSAsync(addresses, message, options);
    if (!['sent', 'cancelled', 'unknown'].includes(result.result)) throw new Error('短信结果值不符合官方接口。');
    if (harmony && result.result !== 'unknown') throw new Error('HarmonyOS 应返回 unknown。');

    return JSON.stringify(result, null, 2);
  });

  const verify = () => checks.run(async () => {
    const rows: string[] = [];

    for (const address of [null, undefined]) {
      let failure: unknown;
      try {
        await SMS.sendSMSAsync(address as unknown as string, message);
      } catch (error) {
        failure = error;
      }
      if (!(failure instanceof TypeError)) throw new Error(`${String(address)} 地址应由官方 JS 拒绝为 TypeError。`);

      rows.push(`${String(address)} 地址：TypeError`);
    }

    const value = await SMS.isAvailableAsync();
    setAvailable(value);

    const code = value ? 'ERR_SMS_ATTACHMENTS_UNSUPPORTED' : 'ERR_SMS_UNAVAILABLE';
    const options = value
      ? { attachments: { uri: 'data:text/plain,Expo%20SMS', mimeType: 'text/plain', filename: 'sms.txt' } }
      : undefined;

    for (let attempt = 1; attempt <= 2; attempt++) {
      let failure: unknown;
      try {
        await SMS.sendSMSAsync([], message, options);
      } catch (error) {
        failure = error;
      }
      if (!(failure instanceof Error) || !('code' in failure) || failure.code !== code) {
        throw new Error(`第 ${attempt} 次调用：预期 ${code}，实际 ${String(failure)}。`);
      }

      rows.push(`第 ${attempt} 次调用：${code}`);
    }

    return `${rows.join('\n')}\n错误后没有残留待完成请求。`;
  });

  const concurrent = () => checks.run(async () => {
    if (!(await SMS.isAvailableAsync())) throw new Error('当前设备不支持短信，无法验证编辑页并发。');

    const [first, second] = await Promise.allSettled([
      SMS.sendSMSAsync(recipients, message),
      SMS.sendSMSAsync(recipients, message),
    ]);
    if (first.status !== 'fulfilled') throw new Error(`首次打开失败：${String(first.reason)}`);
    if (first.value.result !== 'unknown') throw new Error('首次请求应返回 unknown。');
    if (second.status !== 'rejected' || second.reason?.code !== 'ERR_SMS_PENDING') {
      throw new Error('并发请求应返回 ERR_SMS_PENDING。');
    }

    return '首次请求：unknown\n并发请求：ERR_SMS_PENDING\n并发保护通过。';
  });

  return (
    <>
      <Panel eyebrow="设备能力" title="检查短信是否可用">
        <DataRow label="短信能力" value={available === undefined ? '尚未查询' : String(available)} />
        <ActionButton disabled={busy} label="查询短信能力" onPress={() => void inspect()} testID="sms-available" />
        <Note>能力查询不代表已插入 SIM 或可以发送短信。模拟器可能没有短信能力或系统短信应用。</Note>
        <ResultPanel state={status.state} />
      </Panel>

      <Panel eyebrow="系统编辑页" title="预填收件人与正文">
        <Field label="收件人（多个用英文逗号分隔，可留空）" onChangeText={setAddresses} placeholder="0123456789, +12025550123" testID="sms-addresses" value={addresses} />
        <Field label="正文" multiline onChangeText={setMessage} testID="sms-message" value={message} />
        <ActionRow>
          <ActionButton disabled={busy} label="打开短信编辑页" onPress={() => void open(recipients)} testID="sms-open" />
          <ActionButton disabled={busy || recipients.length === 0} label="单号码字符串" onPress={() => void open(recipients[0] ?? '')} testID="sms-open-single" tone="secondary" />
          <ActionButton disabled={busy} label="空附件数组" onPress={() => void open(recipients, { attachments: [] })} testID="sms-open-empty-attachments" tone="secondary" />
        </ActionRow>
        <Note>检查号码、中文、特殊符号、表情和换行是否正确回填，然后返回 demo。按钮只打开编辑页，不会自动发送；HarmonyOS 返回前台后结果应为 unknown。</Note>
        <ResultPanel state={composer.state} />
      </Panel>

      <Panel eyebrow="接口校验" title="参数、错误恢复与并发">
        <ActionRow>
          <ActionButton disabled={busy || !harmony} label="验证参数与错误恢复" onPress={() => void verify()} testID="sms-verify-errors" />
          <ActionButton disabled={busy || !harmony} label="验证并发请求" onPress={() => void concurrent()} testID="sms-verify-concurrent" tone="secondary" />
        </ActionRow>
        <Note>HarmonyOS 专用：检查 null / undefined 地址、附件限制或设备不可用错误，以及失败后的重试。并发验证需要打开短信页后再返回 demo。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
