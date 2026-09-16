import { JSONObject, JSONObjectUtils, JSONUtilsError, JSONValue } from '@expo-harmony/expo-json-utils';

export function readJSON(input: string, key: string, type: string, nullable: boolean): string {
  const data = JSON.parse(input) as JSONObject;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new JSONUtilsError('Input must be a JSON object');
  }

  let value: JSONValue;
  switch (type) {
    case 'raw':
      value = nullable ? JSONObjectUtils.getNullable(data, key) : JSONObjectUtils.require(data, key);
      break;
    case 'string':
      value = nullable ? JSONObjectUtils.getNullableString(data, key) : JSONObjectUtils.requireString(data, key);
      break;
    case 'number':
      value = nullable ? JSONObjectUtils.getNullableNumber(data, key) : JSONObjectUtils.requireNumber(data, key);
      break;
    case 'boolean':
      value = nullable ? JSONObjectUtils.getNullableBoolean(data, key) : JSONObjectUtils.requireBoolean(data, key);
      break;
    case 'array':
      value = nullable ? JSONObjectUtils.getNullableArray(data, key) : JSONObjectUtils.requireArray(data, key);
      break;
    case 'object':
      value = nullable ? JSONObjectUtils.getNullableObject(data, key) : JSONObjectUtils.requireObject(data, key);
      break;
    default: throw new JSONUtilsError(`Unknown reader type: ${type}`);
  }

  return JSON.stringify({
    present: JSONObjectUtils.hasValue(data, key),
    type: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
    value: typeof value === 'number' && !Number.isFinite(value) ? String(value) : value,
  });
}

export function checkJSON(): string {
  const data: JSONObject = {
    text: '你好 HarmonyOS', number: 2.5, decimal: ' 2.5e1 ', flag: false, truth: 'TrUe',
    array: [1, null], object: { nested: true }, empty: null, absent: undefined,
  };
  const readers = [
    JSONObjectUtils.require, JSONObjectUtils.requireString, JSONObjectUtils.requireNumber,
    JSONObjectUtils.requireBoolean, JSONObjectUtils.requireArray, JSONObjectUtils.requireObject,
  ];
  const nullable = [
    JSONObjectUtils.getNullable, JSONObjectUtils.getNullableString, JSONObjectUtils.getNullableNumber,
    JSONObjectUtils.getNullableBoolean, JSONObjectUtils.getNullableArray, JSONObjectUtils.getNullableObject,
  ];
  const checks: { name: string; run: () => boolean }[] = [
    { name: '原始值与自有字段', run: () => JSONObjectUtils.require(data, 'text') === data.text
      && JSONObjectUtils.hasValue(data, 'empty') && !JSONObjectUtils.hasValue(data, 'missing') },
    { name: '全部必填读取器拒绝缺失字段', run: () => readers.every(read => rejects(() => read(data, 'missing'))) },
    { name: '全部可空读取器处理缺失字段', run: () => nullable.every(read => read(data, 'missing') === null) },
    { name: '标量与容器字符串化', run: () => JSONObjectUtils.requireString(data, 'text') === data.text
      && JSONObjectUtils.requireString(data, 'number') === '2.5' && JSONObjectUtils.requireString(data, 'flag') === 'false'
      && JSONObjectUtils.requireString(data, 'array') === '[1,null]'
      && JSONObjectUtils.requireString(data, 'object') === '{"nested":true}' },
    { name: '显式 null 与缺失字段区分', run: () => JSONObjectUtils.require(data, 'empty') === null
      && JSONObjectUtils.getNullableString(data, 'empty') === 'null'
      && nullable.slice(2).every(read => rejects(() => read(data, 'empty'))) },
    { name: '数值与十进制字符串转换', run: () => JSONObjectUtils.requireNumber(data, 'number') === 2.5
      && JSONObjectUtils.getNullableNumber(data, 'decimal') === 25
      && JSONObjectUtils.requireNumber({ value: '1.5f' }, 'value') === 1.5 },
    { name: '非有限数值转换', run: () => Number.isNaN(JSONObjectUtils.requireNumber({ value: 'NaN' }, 'value'))
      && JSONObjectUtils.requireNumber({ value: '1e400' }, 'value') === Infinity },
    { name: '拒绝无效数值字符串', run: () => ['', ' ', '0x10', '0b10', 'abc'].every(value =>
      rejects(() => JSONObjectUtils.requireNumber({ value }, 'value'))) },
    { name: '布尔值与大小写转换', run: () => JSONObjectUtils.requireBoolean(data, 'flag') === false
      && JSONObjectUtils.getNullableBoolean(data, 'truth') === true
      && rejects(() => JSONObjectUtils.requireBoolean({ value: ' true ' }, 'value')) },
    { name: '数组与对象引用不复制', run: () => JSONObjectUtils.requireArray(data, 'array') === data.array
      && JSONObjectUtils.getNullableArray(data, 'array') === data.array
      && JSONObjectUtils.requireObject(data, 'object') === data.object
      && JSONObjectUtils.getNullableObject(data, 'object') === data.object },
    { name: '容器类型错误', run: () => rejects(() => JSONObjectUtils.requireArray(data, 'object'))
      && rejects(() => JSONObjectUtils.getNullableObject(data, 'array')) },
    { name: '继承属性与特殊键', run: () => !JSONObjectUtils.hasValue(data, 'toString')
      && rejects(() => JSONObjectUtils.require(data, 'constructor'))
      && JSONObjectUtils.requireString(JSON.parse('{"__proto__":"own"}'), '__proto__') === 'own' },
    { name: 'undefined 保留与类型检查', run: () => JSONObjectUtils.hasValue(data, 'absent')
      && JSONObjectUtils.require(data, 'absent') === undefined
      && readers.slice(1).every(read => rejects(() => read(data, 'absent'))) },
    { name: '嵌套无效值拒绝', run: () => [undefined, NaN, Infinity].every(value =>
      rejects(() => JSONObjectUtils.requireString({ value: { nested: value } }, 'value'))) },
    { name: 'toJSON 不执行', run: () => {
      let calls = 0;
      const value = { toJSON: () => {
        calls++;
        return 'changed';
      } };

      return rejects(() => JSONObjectUtils.requireString({ value }, 'value'))
        && rejects(() => JSONObjectUtils.requireString({ value: [value] }, 'value')) && calls === 0;
    } },
    { name: '访问器不执行', run: () => {
      let calls = 0;
      const value = Object.defineProperty({}, 'nested', { enumerable: true, get: () => {
        calls++;
        return 1;
      } });

      return rejects(() => JSONObjectUtils.requireString({ value }, 'value')) && calls === 0;
    } },
    { name: '循环引用拒绝', run: () => {
      const value: JSONObject = {};
      value.self = value;

      return rejects(() => JSONObjectUtils.requireString({ value }, 'value'));
    } },
    { name: '稀疏数组与类实例拒绝', run: () => rejects(() => JSONObjectUtils.requireString({ value: new Array(2) }, 'value'))
      && rejects(() => JSONObjectUtils.requireString({ value: [new Date()] }, 'value')) },
    { name: '安全整数与原始大整数文本', run: () => JSONObjectUtils.requireNumber({ value: Number.MAX_SAFE_INTEGER }, 'value') === Number.MAX_SAFE_INTEGER
      && JSONObjectUtils.requireString({ value: '9007199254740993' }, 'value') === '9007199254740993' },
  ];

  const results = checks.map((check) => {
    try {
      return { name: check.name, passed: check.run(), error: '' };
    } catch (error) {
      return { name: check.name, passed: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  return JSON.stringify(results);
}

function rejects(operation: () => JSONValue): boolean {
  try {
    operation();
  } catch (error) {
    return error instanceof JSONUtilsError;
  }

  return false;
}
