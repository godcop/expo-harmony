import * as StoreReview from 'expo-store-review';
import { useState } from 'react';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

type Status = { available: boolean; action: boolean; url: string | null };

export function StoreReviewDemo() {
  const [info, setInfo] = useState<Status>();
  const [code, setCode] = useState<string>();
  const status = useAsyncResult();
  const review = useAsyncResult();
  const busy = status.state.phase === 'running' || review.state.phase === 'running';
  const harmony = String(Platform.OS) === 'harmony';

  const inspect = (count = 1) => status.run(async () => {
    const rows: Status[] = [];

    for (let index = 0; index < count; index++) {
      const [available, action] = await Promise.all([StoreReview.isAvailableAsync(), StoreReview.hasAction()]);
      const url = StoreReview.storeUrl();

      if (typeof available !== 'boolean' || typeof action !== 'boolean' || (url !== null && typeof url !== 'string')) {
        throw new Error('商店评价接口返回值不符合官方类型。');
      }
      if (harmony && (url !== null || action !== available)) {
        throw new Error('HarmonyOS 的 storeUrl 应为 null，hasAction 应与 isAvailableAsync 一致。');
      }

      const value = { available, action, url };

      setInfo(value);
      rows.push(value);
    }

    return json(rows);
  });

  const request = () => review.run(async () => {
    setCode(undefined);

    try {
      await StoreReview.requestReview();
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : 'UNKNOWN';

      setCode(code);

      throw new Error(`[${code}] ${error instanceof Error ? error.message : String(error)}`);
    }

    return '评价请求已返回。此结果不代表用户完成了评价，也不提供评分值。';
  });

  return (
    <>
      <Panel eyebrow="设备能力" title="商店评价与可用操作">
        <DataRow label="评价能力" value={info ? String(info.available) : '尚未查询'} />
        <DataRow label="可用操作" value={info ? String(info.action) : '尚未查询'} />
        <DataRow label="商店地址" value={info ? String(info.url) : '尚未查询'} />
        <ActionRow>
          <ActionButton disabled={busy} label="查询并校验" onPress={() => void inspect()} testID="store-review-inspect" />
          <ActionButton disabled={busy} label="连续查询两轮" onPress={() => void inspect(2)} testID="store-review-repeat" tone="secondary" />
        </ActionRow>
        <Note>查询不会打开弹窗。HarmonyOS 的商店地址为 null，可用操作与评价能力一致；返回 true 不代表账号有评价资格。</Note>
        <ResultPanel state={status.state} />
      </Panel>

      <Panel eyebrow="系统评价" title="请求评价与错误恢复">
        <DataRow label="错误码" value={code ?? '无'} />
        <ActionButton disabled={busy} label="请求应用内评价" onPress={() => void request()} testID="store-review-request" />
        <Note>即使能力查询返回 false，也可点击检查原生错误。请求失败后可再次点击，并重新查询能力，验证错误不会阻塞后续调用。</Note>
        <ResultPanel state={review.state} />
      </Panel>

      <Panel eyebrow="平台行为" title="模拟器与 AppGallery 限制">
        <Note>HarmonyOS 6.0（API 20）起支持应用内评价。华为说明此服务不支持模拟器；模拟器用于验证页面、接口返回和错误传播，实际弹窗需在真机验证。</Note>
        <Note>登录状态、历史评论与评价配额由 AppGallery 判断。此页面不会自动提交评价，调用成功也不能确认用户是否评分。</Note>
      </Panel>
    </>
  );
}
