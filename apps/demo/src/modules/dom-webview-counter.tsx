'use dom';

import { useState } from 'react';

type Props = {
  count: number;
  onChange: (value: number) => Promise<string>;
  dom?: import('expo/dom').DOMProps;
};

export default function DomCounter({ count, onChange }: Props) {
  const [result, setResult] = useState('等待网页调用原生函数');
  const [busy, setBusy] = useState(false);

  const increment = async () => {
    setBusy(true);

    try {
      setResult(await onChange(count + 1));
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ flex: 1, padding: 16, fontFamily: 'system-ui, sans-serif', color: '#111827', background: '#EAF3FF' }}>
      <style>{'body { margin: 0; } button:disabled { opacity: 0.5; }'}</style>
      <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>React DOM 计数器</h3>
      <p>原生传入的 count：<strong id="count">{count}</strong></p>
      <button
        disabled={busy}
        id="increment"
        onClick={() => void increment()}
        style={{ padding: '12px 16px', border: 0, borderRadius: 10, background: '#007AFF', color: '#FFFFFF', fontSize: 14 }}
        type="button"
      >
        {busy ? '等待原生返回…' : '网页调用原生 +1'}
      </button>
      <p aria-live="polite" id="result" style={{ marginBottom: 0, fontSize: 13 }}>{result}</p>
    </main>
  );
}
