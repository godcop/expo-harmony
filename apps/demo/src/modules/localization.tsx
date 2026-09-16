import * as Localization from 'expo-localization';
import { useEffect, useState } from 'react';

import { json } from '../format';
import { ActionButton, DataRow, Note, Panel, ResultPanel, useAsyncResult } from '../ui';

const FIELDS: (keyof Localization.Locale)[] = [
  'languageTag', 'languageCode', 'languageScriptCode', 'languageRegionCode', 'regionCode',
  'textDirection', 'decimalSeparator', 'digitGroupingSeparator', 'measurementSystem',
  'currencyCode', 'currencySymbol', 'languageCurrencyCode', 'languageCurrencySymbol', 'temperatureUnit',
];

function LocalizationHooks() {
  const locales = Localization.useLocales();
  const calendars = Localization.useCalendars();
  const [updates, setUpdates] = useState(0);

  useEffect(() => {
    setUpdates(value => value + 1);
  }, [locales, calendars]);

  return (
    <>
      <DataRow label="偏好语言" value={locales.map(locale => locale.languageTag).join('、')} />
      <DataRow label="系统地区 / 文字方向" value={`${locales[0].regionCode} / ${locales[0].textDirection}`} />
      <DataRow label="系统货币" value={`${locales[0].currencyCode} / ${locales[0].currencySymbol}`} />
      <DataRow label="数字分隔符（小数 / 分组）" value={`${JSON.stringify(locales[0].decimalSeparator)} / ${JSON.stringify(locales[0].digitGroupingSeparator)}`} />
      <DataRow label="计量制 / 温度单位" value={`${locales[0].measurementSystem} / ${locales[0].temperatureUnit}`} />
      <DataRow label="日历 / 时区" value={`${calendars[0].calendar} / ${calendars[0].timeZone}`} />
      <DataRow label="24 小时制 / 每周起始日" value={`${calendars[0].uses24hourClock} / ${calendars[0].firstWeekday}`} />
      <DataRow label="Hook 快照更新次数（含首次）" value={updates} />
    </>
  );
}

export function LocalizationDemo() {
  const locales = useAsyncResult();
  const calendars = useAsyncResult();
  const [watching, setWatching] = useState(true);
  const busy = locales.state.phase === 'running' || calendars.state.phase === 'running';

  const inspectLocales = () => locales.run(() => {
    const values = Localization.getLocales();

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('getLocales() 必须同步返回非空数组。');
    }

    for (const locale of values) {
      if (typeof locale.languageTag !== 'string' || !locale.languageTag.trim()) {
        throw new Error('语言标签必须是非空字符串。');
      }

      for (const name of FIELDS) {
        const value = locale[name];

        if (value !== null && typeof value !== 'string') {
          throw new Error(`${name} 必须是字符串或 null：${String(value)}`);
        }
      }

      if (!['ltr', 'rtl'].includes(locale.textDirection)) {
        throw new Error(`文字方向无效：${locale.textDirection}`);
      }
      if (locale.measurementSystem !== null && !['metric', 'us', 'uk'].includes(locale.measurementSystem)) {
        throw new Error(`计量制无效：${locale.measurementSystem}`);
      }
      if (locale.temperatureUnit !== null && !['celsius', 'fahrenheit'].includes(locale.temperatureUnit)) {
        throw new Error(`温度单位无效：${locale.temperatureUnit}`);
      }
    }

    return `语言字段校验通过，共 ${values.length} 项。\n${json(values)}`;
  });

  const inspectCalendars = () => calendars.run(() => {
    const values = Localization.getCalendars();

    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('getCalendars() 必须同步返回非空数组。');
    }

    for (const calendar of values) {
      if (calendar.calendar !== null && !Object.values(Localization.CalendarIdentifier).includes(calendar.calendar)) {
        throw new Error(`日历类型无效：${calendar.calendar}`);
      }
      if (calendar.timeZone !== null && (typeof calendar.timeZone !== 'string' || !calendar.timeZone.trim())) {
        throw new Error(`时区必须是非空字符串或 null：${String(calendar.timeZone)}`);
      }
      if (calendar.uses24hourClock !== null && typeof calendar.uses24hourClock !== 'boolean') {
        throw new Error(`24 小时制必须是布尔值或 null：${String(calendar.uses24hourClock)}`);
      }
      if (calendar.firstWeekday !== null
        && (!Number.isInteger(calendar.firstWeekday) || calendar.firstWeekday < 1 || calendar.firstWeekday > 7)) {
        throw new Error(`每周起始日必须是 1–7 或 null：${String(calendar.firstWeekday)}`);
      }
    }

    return `日历字段校验通过，共 ${values.length} 项。\n${json(values)}`;
  });

  return (
    <>
      <Panel eyebrow="实时设置" title="语言、地区与日历 Hooks">
        <Note>在系统设置中修改语言、地区、时区或 24 小时制，再回到本页观察更新。暂停会卸载 Hooks 并移除页面监听，重新开启会读取最新设置。</Note>
        <ActionButton
          label={watching ? '暂停 Hooks' : '开启 Hooks'}
          onPress={() => setWatching(value => !value)}
          testID="localization-toggle-hooks"
          tone="secondary"
        />
        {watching ? <LocalizationHooks /> : <Note>Hooks 已卸载，页面监听已移除。</Note>}
      </Panel>

      <Panel eyebrow="语言快照" title="读取并校验全部 Locale 字段">
        <Note>语言地区与系统地区可能不同；未指定语言地区时，其地区和货币字段可以为 null。</Note>
        <ActionButton disabled={busy} label="读取并校验语言" onPress={() => void inspectLocales()} testID="localization-read-locales" />
        <ResultPanel state={locales.state} />
      </Panel>

      <Panel eyebrow="日历快照" title="读取并校验 Calendar 字段">
        <Note>每周起始日采用 Expo 编号：周日为 1，周六为 7。</Note>
        <ActionButton disabled={busy} label="读取并校验日历" onPress={() => void inspectCalendars()} testID="localization-read-calendars" />
        <ResultPanel state={calendars.state} />
      </Panel>
    </>
  );
}
