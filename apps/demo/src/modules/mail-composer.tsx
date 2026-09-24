import { Directory, File, Paths } from 'expo-file-system';
import * as MailComposer from 'expo-mail-composer';
import { useState } from 'react';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

function addresses(value: string): string[] {
  return value.split(',').map(address => address.trim()).filter(Boolean);
}

export function MailComposerDemo() {
  const [recipients, setRecipients] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('Expo Mail Composer · 中文 & + ? # % 😀');
  const [body, setBody] = useState('邮件正文 · 中文 & + ? # % 😀\n第二行');
  const [available, setAvailable] = useState<boolean>();
  const [clients, setClients] = useState<MailComposer.MailClient[]>();
  const [files, setFiles] = useState<string[]>([]);
  const status = useAsyncResult();
  const composer = useAsyncResult();
  const checks = useAsyncResult();
  const busy = [status, composer, checks].some(action => action.state.phase === 'running');
  const harmony = String(Platform.OS) === 'harmony';

  const options: MailComposer.MailComposerOptions = {
    recipients: addresses(recipients),
    ccRecipients: addresses(cc),
    bccRecipients: addresses(bcc),
    subject,
    body,
  };

  const inspect = () => status.run(async () => {
    const available = await MailComposer.isAvailableAsync();
    const clients = MailComposer.getClients();

    if (typeof available !== 'boolean' || !Array.isArray(clients) || clients.some(client => typeof client.label !== 'string')) {
      throw new Error('邮件能力或客户端列表不符合官方接口。');
    }
    if (harmony && clients.length > 0) throw new Error('HarmonyOS 的客户端列表应为空数组。');

    setAvailable(available);
    setClients(clients);

    return json({ available, clients });
  });

  const open = (options: MailComposer.MailComposerOptions) => composer.run(async () => {
    const result = await MailComposer.composeAsync(options);

    if (!Object.values(MailComposer.MailComposerStatus).includes(result.status)) throw new Error('邮件结果不符合官方接口。');
    if (harmony && result.status !== MailComposer.MailComposerStatus.UNDETERMINED) throw new Error('HarmonyOS 应返回 undetermined。');

    return json(result);
  });

  const prepare = () => composer.run(() => {
    const directory = new Directory(Paths.cache, 'expo-mail-composer-demo');
    directory.create({ idempotent: true, intermediates: true });

    const files = ['邮件 附件 #1%.txt', 'mail-attachment-2.txt'].map((name) => {
      const file = new File(directory, name);
      file.create({ overwrite: true });
      file.write(`Expo Mail Composer\n${name}\n中文 & + ? # % 😀\n`);

      return file.uri;
    });

    setFiles(files);

    return json(files);
  });

  const clean = () => composer.run(() => {
    const directory = new Directory(Paths.cache, 'expo-mail-composer-demo');
    if (directory.exists) directory.delete();

    setFiles([]);

    return '测试附件已清理。';
  });

  const verify = () => checks.run(async () => {
    const cases: [MailComposer.MailComposerOptions, string][] = [
      [{ body: '<b>HTML</b>', isHtml: true }, 'ERR_MAIL_COMPOSER_HTML_UNSUPPORTED'],
      [{ attachments: ['https://example.com/attachment.txt'] }, 'ERR_MAIL_COMPOSER_ATTACHMENT'],
      [{ attachments: [new File(Paths.cache, `missing-mail-${Date.now()}.txt`).uri] }, 'ERR_MAIL_COMPOSER_ATTACHMENT'],
      [{ attachments: [Paths.cache.uri] }, 'ERR_MAIL_COMPOSER_ATTACHMENT'],
    ];
    const rows: string[] = [];

    for (let attempt = 1; attempt <= 2; attempt++) {
      for (const [options, code] of cases) {
        let failure: unknown;

        try {
          await MailComposer.composeAsync(options);
        } catch (error) {
          failure = error;
        }

        if (!(failure instanceof Error) || !('code' in failure) || failure.code !== code) {
          throw new Error(`第 ${attempt} 轮：预期 ${code}，实际 ${String(failure)}。`);
        }

        rows.push(`第 ${attempt} 轮：${code}`);
      }
    }

    return `${rows.join('\n')}\n参数、附件与错误恢复检查通过。`;
  });

  const concurrent = () => checks.run(async () => {
    const [first, second] = await Promise.allSettled([
      MailComposer.composeAsync(options),
      MailComposer.composeAsync(options),
    ]);

    if (first.status !== 'fulfilled') throw new Error(`首次打开失败：${String(first.reason)}`);
    if (first.value.status !== MailComposer.MailComposerStatus.UNDETERMINED) throw new Error('首次请求应返回 undetermined。');
    if (second.status !== 'rejected' || second.reason?.code !== 'ERR_MAIL_COMPOSER_IN_PROGRESS') {
      throw new Error('并发请求应返回 ERR_MAIL_COMPOSER_IN_PROGRESS。');
    }

    return '首次请求：undetermined\n并发请求：ERR_MAIL_COMPOSER_IN_PROGRESS\n并发保护通过。';
  });

  return (
    <>
      <Panel eyebrow="设备能力" title="邮件应用与客户端列表">
        <DataRow label="邮件能力" value={available === undefined ? '尚未查询' : String(available)} />
        <DataRow label="客户端列表" value={clients === undefined ? '尚未查询' : json(clients)} />
        <ActionButton disabled={busy} label="查询邮件能力" onPress={() => void inspect()} testID="mail-composer-inspect" />
        <Note>HarmonyOS 返回空客户端列表，选择客户端交由系统面板完成。能力查询仅检查 mailto 链接，不检查账户登录状态，结果不代表邮件面板是否可用。</Note>
        <ResultPanel state={status.state} />
      </Panel>

      <Panel eyebrow="系统编辑页" title="预填收件人、主题与正文">
        <Field label="收件人（多个用英文逗号分隔，可留空）" onChangeText={setRecipients} placeholder="recipient@example.com" testID="mail-composer-recipients" value={recipients} />
        <Field label="抄送" onChangeText={setCc} testID="mail-composer-cc" value={cc} />
        <Field label="密送" onChangeText={setBcc} testID="mail-composer-bcc" value={bcc} />
        <Field label="主题" onChangeText={setSubject} testID="mail-composer-subject" value={subject} />
        <Field label="正文" multiline onChangeText={setBody} testID="mail-composer-body" value={body} />
        <ActionRow>
          <ActionButton disabled={busy} label="打开邮件面板" onPress={() => void open(options)} testID="mail-composer-open" />
          <ActionButton disabled={busy} label="打开空白邮件" onPress={() => void open({})} testID="mail-composer-empty" tone="secondary" />
        </ActionRow>
        <Note>核对中文、特殊符号、表情和换行，然后关闭面板或返回 demo。不会自动发送邮件；undetermined 仅表示面板返回或客户端启动，不能确认邮件发送状态。</Note>
        <ResultPanel state={composer.state} />
      </Panel>

      <Panel eyebrow="本地文件" title="多附件与文件名编码">
        <DataRow label="测试附件" value={`${files.length} 个`} />
        <ActionRow>
          <ActionButton disabled={busy} label="创建两个附件" onPress={() => void prepare()} testID="mail-composer-prepare" />
          <ActionButton disabled={busy || files.length === 0} label="打开带附件邮件" onPress={() => void open({ ...options, attachments: files })} testID="mail-composer-attachments" tone="secondary" />
          <ActionButton disabled={busy} label="清理测试附件" onPress={() => void clean()} testID="mail-composer-clean" tone="secondary" />
        </ActionRow>
        <Note>包含中文、空格、# 和 % 的文件名。请在邮件客户端结束读取后手动清理，系统选择面板关闭时附件可能仍在使用。</Note>
      </Panel>

      <Panel eyebrow="接口校验" title="参数、错误恢复与并发">
        <ActionRow>
          <ActionButton disabled={busy || !harmony} label="验证参数与错误恢复" onPress={() => void verify()} testID="mail-composer-verify" />
          <ActionButton disabled={busy || !harmony} label="验证并发请求" onPress={() => void concurrent()} testID="mail-composer-concurrent" tone="secondary" />
        </ActionRow>
        <Note>HarmonyOS 专用。错误校验连续执行两轮；并发校验会打开系统邮件面板，请确认有可用客户端再运行。无客户端且系统不回调时，请求会持续等待。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
