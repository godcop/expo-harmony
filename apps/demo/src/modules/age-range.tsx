import * as AgeRange from 'expo-age-range';
import { useState } from 'react';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

export function AgeRangeDemo() {
  const [range, setRange] = useState<AgeRange.AgeRangeResponse>();
  const [code, setCode] = useState<string>();
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const busy = action.state.phase === 'running' || checks.state.phase === 'running';
  const harmony = String(Platform.OS) === 'harmony';

  const read = async (options: AgeRange.AgeRangeRequest) => {
    setRange(undefined);
    setCode(undefined);

    try {
      const value = await AgeRange.requestAgeRangeAsync(options);

      setRange(value);

      return value;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';

      setCode(code);

      throw new Error(`[${code}] ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const inspect = (options: AgeRange.AgeRangeRequest) => action.run(async () => json(await read(options)));

  const verify = () => checks.run(async () => {
    const results: AgeRange.AgeRangeResponse[] = [];

    for (const options of [{ threshold1: 18 }, { threshold1: 13, threshold2: 16, threshold3: 18 }]) {
      const value = await read(options);

      for (const bound of [value.lowerBound, value.upperBound]) {
        if (bound !== null && (!Number.isSafeInteger(bound) || bound < 0)) {
          throw new Error('年龄边界必须是非负整数或 null。');
        }
      }

      if (value.lowerBound !== null && value.upperBound !== null && value.lowerBound > value.upperBound) {
        throw new Error('年龄下限不能大于上限。');
      }

      if (harmony) {
        if ((value.lowerBound === null) !== (value.upperBound === null)) {
          throw new Error('HarmonyOS 未提供年龄时，两个边界都应为 null。');
        }

        if (Object.keys(value).some(key => key !== 'lowerBound' && key !== 'upperBound')) {
          throw new Error('HarmonyOS 不应返回 iOS 或 Android 专用元数据。');
        }
      }

      results.push(value);
    }

    return json({ passed: true, results });
  });

  return (
    <>
      <Panel eyebrow="系统年龄段" title="请求年龄范围">
        <DataRow label="年龄下限" value={range ? String(range.lowerBound) : '尚未读取'} />
        <DataRow label="年龄上限" value={range ? String(range.upperBound) : '尚未读取'} />
        <DataRow label="错误码" value={code ?? '无'} />
        <ActionRow>
          <ActionButton disabled={busy} label="读取年龄段（18）" onPress={() => void inspect({ threshold1: 18 })} testID="age-range-read" />
          <ActionButton disabled={busy} label="读取年龄段（13 / 16 / 18）" onPress={() => void inspect({ threshold1: 13, threshold2: 16, threshold3: 18 })} testID="age-range-thresholds" tone="secondary" />
        </ActionRow>
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="接口校验" title="验证返回值与重复请求">
        <Note>使用两组阈值依次请求，检查年龄边界、空值和平台字段。系统年龄段可能在两次请求之间变化，因此不要求两次结果相同。</Note>
        <ActionButton disabled={busy} label="校验接口返回值" onPress={() => void verify()} testID="age-range-verify" />
        <ResultPanel state={checks.state} />
      </Panel>

      <Panel eyebrow="平台行为" title="理解未知年龄与服务限制">
        <Note>HarmonyOS 读取系统未成年人模式的年龄段，忽略 iOS 专用阈值，不弹出年龄输入框，也不改变系统模式。模式关闭时返回两个 null，这不代表用户成年。</Note>
        <Note>HarmonyOS 年龄上限包含在区间内，与 Android 一致；iOS 使用排除式上限。模拟器或不支持的账号可能返回服务不可用或系统错误，页面保留错误码，可再次请求。</Note>
      </Panel>
    </>
  );
}
