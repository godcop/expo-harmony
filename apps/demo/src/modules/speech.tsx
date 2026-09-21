import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { ActionButton, ActionRow, DataRow, Field, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function SpeechDemo() {
  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [voice, setVoice] = useState('');
  const [text, setText] = useState('你好，欢迎使用 Expo Speech。今天是 2026 年，Hello HarmonyOS！');
  const [language, setLanguage] = useState('zh-CN');
  const [rate, setRate] = useState('1');
  const [pitch, setPitch] = useState('1');
  const [volume, setVolume] = useState('1');
  const [events, setEvents] = useState<string[]>([]);
  const [speaking, setSpeaking] = useState<boolean>();
  const active = useRef(true);
  const sequence = useRef(0);
  const status = useAsyncResult();
  const playback = useAsyncResult();
  const checks = useAsyncResult();
  const testing = checks.state.phase === 'running';
  const harmony = String(Platform.OS) === 'harmony';

  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
      void Speech.stop().catch(error => console.warn('Speech cleanup:', error));
    };
  }, []);

  const record = (id: number, event: string) => {
    console.info(`[SpeechDemo] ${id}: ${event}`);
    if (!active.current) return;

    setEvents(rows => [...rows, `${id}: ${event}`].slice(-30));
  };

  const inspect = () => status.run(async () => {
    const [voices, speaking] = await Promise.all([Speech.getAvailableVoicesAsync(), Speech.isSpeakingAsync()]);
    if (typeof speaking !== 'boolean') throw new Error('播报状态应为 boolean。');
    if (!voices.every(item => (
      item.identifier && item.language && item.name && Object.values(Speech.VoiceQuality).includes(item.quality)
    ))) {
      throw new Error('系统音色结果不符合 Voice 接口。');
    }
    if (!active.current) return '页面已关闭。';

    setVoices(voices);
    setSpeaking(speaking);

    return `音色 ${voices.length} 个\nisSpeakingAsync() → ${speaking}`;
  });

  const speak = (text: string) => {
    if ([rate, pitch, volume].some(value => value.trim() === '' || !Number.isFinite(Number(value)))) {
      throw new Error('语速、音调和音量必须填写有限数值。');
    }

    const id = ++sequence.current;
    record(id, 'queued');
    Speech.speak(text, {
      language: language || undefined,
      voice: voice || undefined,
      rate: Number(rate),
      pitch: Number(pitch),
      volume: Number(volume),
      onStart: () => record(id, 'onStart'),
      onDone: () => record(id, 'onDone'),
      onStopped: () => record(id, 'onStopped'),
      onError: error => record(id, `onError: ${error.message}`),
      onBoundary: (event: { charIndex: number; charLength: number }) => record(id, `onBoundary: ${JSON.stringify(event)}`),
    });
  };

  const stop = () => playback.run(async () => {
    await Speech.stop();
    const speaking = await Speech.isSpeakingAsync();
    if (active.current) setSpeaking(speaking);

    return `队列已清空\nisSpeakingAsync() → ${speaking}`;
  });

  const verify = () => checks.run(async () => {
    await Speech.stop();
    const rows: string[] = [];

    try {
      for (const item of [
        { name: '超长文本', text: 'a'.repeat(Speech.maxSpeechInputLength + 1), options: {} },
        { name: '无效语速', text: '语速校验', options: { rate: 3 } },
      ]) {
        const message = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`${item.name} 没有收到终止事件。`)), 5000);
          const finish = (error?: Error) => {
            clearTimeout(timer);
            if (error) resolve(error.message);
            else reject(new Error(`${item.name} 应触发 onError。`));
          };

          try {
            Speech.speak(item.text, {
              ...item.options,
              onError: finish,
              onDone: () => finish(),
              onStopped: () => finish(),
            });
          } catch (error) {
            clearTimeout(timer);
            reject(error);
          }
        });

        rows.push(`${item.name}：onError → ${message}`);
      }

      for (const method of ['pause', 'resume'] as const) {
        let failure: unknown;
        try {
          await Speech[method]();
        } catch (error) {
          failure = error;
        }
        if (!(failure instanceof Error) || !('code' in failure) || failure.code !== 'ERR_UNAVAILABLE') {
          throw new Error(`${method} 应返回 ERR_UNAVAILABLE。`);
        }

        rows.push(`${method}：ERR_UNAVAILABLE`);
      }

      return rows.join('\n');
    } finally {
      await Speech.stop();
    }
  });

  return (
    <>
      <Panel eyebrow="设备能力" title="音色与播报状态">
        <DataRow label="最大文本长度" value={Speech.maxSpeechInputLength} />
        <DataRow label="最近查询的播报状态" value={speaking === undefined ? '尚未查询' : String(speaking)} />
        <ActionButton disabled={testing || status.state.phase === 'running'} label="查询音色与状态" onPress={() => void inspect()} testID="speech-inspect" />
        <ActionRow>
          <ActionButton label={voice ? '按语言选择音色' : '✓ 按语言选择音色'} onPress={() => setVoice('')} tone="secondary" />
          {voices.map(item => (
            <ActionButton key={item.identifier} label={`${voice === item.identifier ? '✓ ' : ''}${item.name} · ${item.language}`} onPress={() => setVoice(item.identifier)} tone="secondary" />
          ))}
        </ActionRow>
        <Note>音色依赖设备已安装的系统语音模型。查询失败或没有可用音色时，请查看结果中的原生错误。</Note>
        <ResultPanel state={status.state} />
      </Panel>

      <Panel eyebrow="语音合成" title="文本、参数与队列">
        <Field label="播报文本" multiline onChangeText={setText} testID="speech-text" value={text} />
        <Field label="语言（选择音色时优先使用音色）" onChangeText={setLanguage} value={language} />
        <Field keyboardType="decimal-pad" label="语速 · 0.5–2" onChangeText={setRate} value={rate} />
        <Field keyboardType="decimal-pad" label="音调 · 0.5–2" onChangeText={setPitch} value={pitch} />
        <Field keyboardType="decimal-pad" label="音量 · 0–1" onChangeText={setVolume} value={volume} />
        <ActionRow>
          <ActionButton
            disabled={testing}
            label="播报文本"
            onPress={() => void playback.run(() => {
              speak(text);

              return '已加入队列，请查看播放事件。';
            })}
            testID="speech-speak"
          />
          <ActionButton
            disabled={testing}
            label="连续加入三条"
            onPress={() => void playback.run(() => {
              for (let index = 1; index <= 3; index++) speak(`第 ${index} 条。${text}`);

              return '三条文本已按顺序入队，请核对事件顺序。';
            })}
            testID="speech-queue"
            tone="secondary"
          />
          <ActionButton
            disabled={testing}
            label="播报空文本"
            onPress={() => void playback.run(() => {
              speak('');

              return '空文本已加入队列。';
            })}
            testID="speech-empty"
            tone="secondary"
          />
          <ActionButton disabled={testing} label="停止并清空" onPress={() => void stop()} testID="speech-stop" tone="danger" />
          <ActionButton
            disabled={testing}
            label="停止后立即播报"
            onPress={() => void playback.run(async () => {
              await Speech.stop();
              speak(text);

              return '已停止并立即重新播报，请确认新文本收到 onStart 和 onDone。';
            })}
            testID="speech-restart"
            tone="secondary"
          />
        </ActionRow>
        <Note>请确认实际发声、音量与语速。onDone 表示系统报告播放完成；HarmonyOS 不支持逐词边界事件。离开页面时会停止播放。</Note>
        <ResultPanel state={playback.state} />
      </Panel>

      <Panel eyebrow="回调" title="播放事件记录">
        <DataRow label="最近事件（最多 30 条）" value={events.join('\n') || '暂无事件'} />
        <ActionButton label="清空记录" onPress={() => setEvents([])} tone="secondary" />
      </Panel>

      <Panel eyebrow="接口校验" title="参数边界与平台限制">
        <ActionButton disabled={!harmony || testing} label="验证错误与不支持接口" onPress={() => void verify()} testID="speech-verify" />
        <Note>检查超长文本、越界语速触发 onError，以及 pause / resume 返回不可用错误。执行前后会清空播报队列。</Note>
        <ResultPanel state={checks.state} />
      </Panel>
    </>
  );
}
