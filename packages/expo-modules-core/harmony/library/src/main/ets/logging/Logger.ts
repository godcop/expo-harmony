import systemDateTime from '@ohos.systemDateTime';

export type LogType = 'trace' | 'timer' | 'stacktrace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface LogHandler { log(type: LogType, message: string, cause?: Error): void; }
export interface LoggerTimer { stop(): number; }

export class Logger {
  constructor(private readonly handlers: LogHandler[], private readonly debugEnabled: boolean = false) {}

  trace(message: string): void { this.log('trace', message); }
  debug(message: string): void { this.log('debug', message); }
  info(message: string): void { this.log('info', message); }
  warn(message: string, cause?: Error): void { this.log('warn', message, cause); }
  error(message: string, cause?: Error): void { this.log('error', message, cause); }
  fatal(message: string, cause?: Error): void { this.log('fatal', message, cause); }

  startTimer(format: (duration: number) => string): LoggerTimer {
    const start = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE);
    return { stop: (): number => {
      const duration = systemDateTime.getUptime(systemDateTime.TimeType.ACTIVE) - start;
      this.log('timer', format(duration));
      return duration;
    } };
  }

  log(type: LogType, message: string, cause?: Error): void {
    if (!this.debugEnabled && ['trace', 'timer', 'stacktrace', 'debug'].includes(type)) return;
    for (const handler of this.handlers) handler.log(type, message, cause);
  }
}
