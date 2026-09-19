const TimeoutEnvPrefix = 'EXPO_HARMONY_';

const warnedEnvNames = new Set<string>();

function timeoutEnvName(operation: string): string {
  return `${TimeoutEnvPrefix}${operation.toUpperCase().replace(/-/gu, '_')}_TIMEOUT_MS`;
}

function timeoutFromEnv(operation: string): number | null {
  const name = timeoutEnvName(operation);
  const raw = process.env[name];
  if (!raw) return null;

  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  if (!warnedEnvNames.has(name)) {
    warnedEnvNames.add(name);
    console.warn(`Ignoring unsupported ${name} value: ${raw}. Use a positive number of milliseconds.`);
  }
  return null;
}

/**
 * Resolves a command timeout: explicit option first, then the
 * `EXPO_HARMONY_<OPERATION>_TIMEOUT_MS` environment variable derived from the
 * operation name (dashes become underscores), then the built-in default.
 */
function resolveTimeoutMs(operation: string, fallbackMs: number, explicitMs?: number): number {
  return explicitMs && explicitMs > 0
    ? explicitMs
    : timeoutFromEnv(operation) ?? fallbackMs;
}

export { resolveTimeoutMs, timeoutEnvName };
