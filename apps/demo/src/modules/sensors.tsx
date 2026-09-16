import {
  Accelerometer,
  Barometer,
  DeviceMotion,
  DeviceSensor,
  Gyroscope,
  LightSensor,
  Magnetometer,
  MagnetometerUncalibrated,
  Pedometer,
} from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { json } from '../format';
import { ActionButton, ActionRow, DataRow, Note, Panel, ResultPanel, Tag, useAsyncResult } from '../ui';

type Subscription = { remove(): void };
type Sensor = { id: string; label: string; unit: string; source: DeviceSensor<unknown> };

const SENSORS = [
  { id: 'accelerometer', label: '加速度计', unit: 'g', source: Accelerometer },
  { id: 'gyroscope', label: '陀螺仪', unit: 'rad/s', source: Gyroscope },
  { id: 'magnetometer', label: '磁力计', unit: 'μT', source: Magnetometer },
  { id: 'uncalibrated', label: '未校准磁力计', unit: 'μT', source: MagnetometerUncalibrated },
  { id: 'barometer', label: '气压计', unit: 'hPa', source: Barometer },
  { id: 'light', label: '环境光', unit: 'lux', source: LightSensor },
  { id: 'motion', label: '设备运动', unit: 'm/s² · rad · deg/s', source: DeviceMotion },
] as const satisfies readonly Sensor[];

function validate(id: string, value: unknown): void {
  if (typeof value !== 'object' || value === null) throw new Error('传感器返回的测量不是对象。');

  const data = value as Record<string, unknown>;
  const fields = id === 'barometer'
    ? ['pressure', 'timestamp']
    : id === 'light'
      ? ['illuminance', 'timestamp']
      : id === 'motion' ? ['interval', 'orientation'] : ['x', 'y', 'z', 'timestamp'];

  for (const field of fields) {
    if (typeof data[field] !== 'number' || !Number.isFinite(data[field])) {
      throw new Error(`${id}.${field} 不是有限数值。`);
    }
  }

  if (id === 'motion') {
    if (![0, 90, 180, -90].includes(data.orientation as number)) throw new Error('设备方向不在约定范围内。');

    for (const field of ['acceleration', 'accelerationIncludingGravity', 'rotation', 'rotationRate']) {
      if (data[field] === undefined || data[field] === null) continue;

      const sample = data[field] as Record<string, unknown>;
      const axes = field.startsWith('rotation') ? ['alpha', 'beta', 'gamma', 'timestamp'] : ['x', 'y', 'z', 'timestamp'];
      if (axes.some(axis => typeof sample[axis] !== 'number' || !Number.isFinite(sample[axis]))) {
        throw new Error(`${field} 中包含无效测量。`);
      }
    }
  }
}

export function SensorsDemo() {
  const action = useAsyncResult();
  const [selected, setSelected] = useState<Sensor>(SENSORS[0]);
  const [availability, setAvailability] = useState<Record<string, boolean>>({});

  const inspect = () => action.run(async () => {
    const entries = await Promise.all(SENSORS.map(async sensor => (
      [sensor.id, await sensor.source.isAvailableAsync()] as const
    )));
    const pedometer = await Pedometer.isAvailableAsync();
    const values = { ...Object.fromEntries(entries), pedometer };
    setAvailability(values);

    return json(values);
  });

  return (
    <>
      <Panel eyebrow="硬件能力" title="检查设备传感器">
        <ActionButton label="检查全部可用性" onPress={() => void inspect()} disabled={action.state.phase === 'running'} testID="sensors-inspect" />
        {SENSORS.map(sensor => (
          <DataRow key={sensor.id} label={sensor.label} value={availability[sensor.id] === undefined ? '未检查' : availability[sensor.id] ? '可用' : '不可用'} />
        ))}
        <DataRow label="计步器" value={availability.pedometer === undefined ? '未检查' : availability.pedometer ? '可用' : '不可用'} />
        <Note>模拟器可能只提供部分传感器。不可用会明确显示，页面不会补造测量数据。</Note>
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="实时测量" title="选择传感器">
        <ActionRow>
          {SENSORS.map(sensor => (
            <ActionButton key={sensor.id} label={sensor.label} tone={selected === sensor ? 'primary' : 'secondary'} onPress={() => setSelected(sensor)} testID={`sensors-select-${sensor.id}`} />
          ))}
        </ActionRow>
      </Panel>

      <SensorCard key={selected.id} sensor={selected} />
      <PedometerCard />
    </>
  );
}

function SensorCard({ sensor }: { sensor: Sensor }) {
  const action = useAsyncResult();
  const checks = useAsyncResult();
  const subscriptions = useRef<Subscription[]>([]);
  const generation = useRef(0);
  const [interval, setInterval] = useState(250);
  const [listening, setListening] = useState(false);
  const [count, setCount] = useState(0);
  const [sample, setSample] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = action.state.phase === 'running' || checks.state.phase === 'running';

  const release = () => {
    generation.current += 1;
    subscriptions.current.forEach(subscription => subscription.remove());
    subscriptions.current = [];
  };

  useEffect(() => () => {
    generation.current += 1;
    subscriptions.current.forEach(subscription => subscription.remove());
    subscriptions.current = [];
  }, []);

  const start = () => action.run(async () => {
    release();
    setListening(false);
    const token = generation.current;
    const [available, permission] = await Promise.all([
      sensor.source.isAvailableAsync(),
      sensor.source.getPermissionsAsync(),
    ]);
    if (token !== generation.current) return '页面已离开，取消订阅。';
    if (!available) return '当前设备不支持此传感器，已跳过订阅。';
    if (!permission.granted) return `权限未授予：${json(permission)}`;

    sensor.source.setUpdateInterval(interval);
    setCount(0);
    setSample(null);
    setError(null);
    subscriptions.current = [sensor.source.addListener((value) => {
      if (token !== generation.current) return;

      try {
        validate(sensor.id, value);
      } catch (failure) {
        setError(String(failure));
      }

      setCount(count => count + 1);
      setSample(value);
    })];
    setListening(true);

    return json({ available, permission, interval, listeners: sensor.source.getListenerCount() });
  });

  const verify = () => checks.run(async () => {
    release();
    setListening(false);
    const token = generation.current;
    const available = await sensor.source.isAvailableAsync();
    if (token !== generation.current) return '页面已离开，取消验证。';
    if (!available) return '当前设备不支持此传感器，已跳过验证。';

    const permission = await sensor.source.getPermissionsAsync();
    if (token !== generation.current) return '页面已离开，取消验证。';
    if (!permission.granted) return `权限未授予：${json(permission)}`;

    const counts: [number, number] = [0, 0];
    let invalid: unknown;
    sensor.source.setUpdateInterval(100);
    const listen = (index: 0 | 1) => sensor.source.addListener((value) => {
      counts[index] += 1;

      try {
        validate(sensor.id, value);
      } catch (error) {
        invalid = error;
      }
    });
    const listeners = [listen(0), listen(1)] as const;
    subscriptions.current = [...listeners];

    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (token !== generation.current) return '页面已离开，取消验证。';
      if (invalid) throw new Error(String(invalid));
      if (counts.some(count => count === 0)) throw new Error('传感器报告可用，但未收到测量事件；请检查模拟器传感器面板。');

      listeners[0].remove();
      const before = [...counts] as const;
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (token !== generation.current) return '页面已离开，取消验证。';
      if (invalid) throw new Error(String(invalid));
      if (counts[0] !== before[0]) throw new Error('已移除的监听仍收到事件。');
      if (counts[1] <= before[1]) throw new Error('移除一个监听后，另一个监听停止更新。');

      return json({ before, after: counts, removedListenerStopped: true, remainingListenerActive: true });
    } finally {
      listeners.forEach(listener => listener.remove());
      if (token === generation.current) {
        subscriptions.current = [];
        sensor.source.setUpdateInterval(interval);
      }
    }
  });

  return (
    <Panel eyebrow={sensor.unit} title={sensor.label}>
      <DataRow label="监听状态" value={listening ? '正在监听' : '已停止'} />
      <DataRow label="收到事件" value={String(count)} />
      <DataRow label="数据校验" value={<Tag tone={error ? 'danger' : sample ? 'success' : 'neutral'}>{error ?? (sample ? '有效' : '等待事件')}</Tag>} />
      <DataRow label="最近测量" value={sample === null ? '暂无' : json(sample)} />
      <ActionRow>
        {[100, 250, 1000].map(value => (
          <ActionButton
            key={value}
            label={`${value} ms`}
            tone={interval === value ? 'primary' : 'secondary'}
            disabled={busy}
            testID={`sensors-interval-${value}`}
            onPress={() => {
              sensor.source.setUpdateInterval(value);
              setInterval(value);
            }}
          />
        ))}
      </ActionRow>
      <ActionRow>
        <ActionButton label="开始监听" disabled={busy || listening} onPress={() => void start()} testID="sensors-start" />
        <ActionButton
          label="停止监听"
          tone="secondary"
          disabled={busy || !listening}
          testID="sensors-stop"
          onPress={() => {
            release();
            setListening(false);
          }}
        />
        <ActionButton label="验证订阅与清理" tone="secondary" disabled={busy} onPress={() => void verify()} testID="sensors-verify" />
      </ActionRow>
      <Note>验证会创建两个监听，检查数据后移除其中一个，确认另一个继续更新，最后清理全部监听。切换传感器或离开页面也会清理。可切到后台再返回，观察事件是否恢复。</Note>
      <ResultPanel state={action.state} />
      <ResultPanel state={checks.state} />
    </Panel>
  );
}

function PedometerCard() {
  const action = useAsyncResult();
  const subscription = useRef<Subscription | null>(null);
  const generation = useRef(0);
  const [listening, setListening] = useState(false);
  const [steps, setSteps] = useState<number | null>(null);
  const [permission, setPermission] = useState('未查询');
  const busy = action.state.phase === 'running';

  useEffect(() => () => {
    generation.current += 1;
    subscription.current?.remove();
  }, []);

  const authorize = (request: boolean) => action.run(async () => {
    const result = await (request ? Pedometer.requestPermissionsAsync() : Pedometer.getPermissionsAsync());
    setPermission(result.status);

    return json(result);
  });

  const watch = () => action.run(async () => {
    const token = generation.current;
    const [available, permission] = await Promise.all([Pedometer.isAvailableAsync(), Pedometer.getPermissionsAsync()]);
    if (token !== generation.current) return '页面已离开，取消订阅。';
    if (!available) return '当前设备不支持计步器，已跳过订阅。';
    if (!permission.granted) return '请先授予运动权限。';

    subscription.current?.remove();
    setSteps(null);
    subscription.current = Pedometer.watchStepCount(result => setSteps(result.steps));
    setListening(true);

    return '计步已开始；停止后重新开始会建立新的计数基线。';
  });

  const history = () => action.run(async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 60_000);

    try {
      const result = await Pedometer.getStepCountAsync(start, end);
      if (String(Platform.OS) === 'harmony') throw new Error('HarmonyOS 不应返回历史步数。');

      return json(result);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (String(Platform.OS) === 'harmony' && code === 'ERR_NOT_SUPPORTED') return '通过：历史步数查询返回 ERR_NOT_SUPPORTED。';

      throw new Error(String(error));
    }
  });

  return (
    <Panel eyebrow="计步器" title="运动权限与步数订阅">
      <DataRow label="运动权限" value={permission} />
      <DataRow label="监听状态" value={listening ? '正在监听' : '已停止'} />
      <DataRow label="当前订阅步数" value={steps === null ? '等待事件' : String(steps)} />
      <ActionRow>
        <ActionButton label="查询运动权限" disabled={busy} onPress={() => void authorize(false)} testID="sensors-permission-read" tone="secondary" />
        <ActionButton label="申请运动权限" disabled={busy} onPress={() => void authorize(true)} testID="sensors-permission-request" />
        <ActionButton label="开始计步" disabled={busy || listening} onPress={() => void watch()} testID="sensors-pedometer-start" tone="secondary" />
        <ActionButton
          label="停止计步"
          disabled={busy || !listening}
          testID="sensors-pedometer-stop"
          tone="secondary"
          onPress={() => {
            generation.current += 1;
            subscription.current?.remove();
            subscription.current = null;
            setListening(false);
          }}
        />
        <ActionButton label="验证历史查询限制" disabled={busy} onPress={() => void history()} testID="sensors-history" tone="secondary" />
      </ActionRow>
      <Note>计步需要真实步数或模拟器注入的事件。HarmonyOS 不支持历史步数查询；气压计也不提供相对海拔。</Note>
      <ResultPanel state={action.state} />
    </Panel>
  );
}
