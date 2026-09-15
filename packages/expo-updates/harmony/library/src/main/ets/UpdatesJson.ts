export function isRecord(value: unknown): value is Record<string, ESObject> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
