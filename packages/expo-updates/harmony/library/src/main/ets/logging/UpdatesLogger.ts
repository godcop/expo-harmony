import type common from '@ohos.app.ability.common';
import { Logger, LoggerTimer, LogHandlers, LogType } from '@expo-harmony/expo-modules-core/Logging';
import { Json } from '../UpdatesProtocol';
import { PersistentUpdatesLog, updatesLogCategory } from './PersistentUpdatesLog';

export class UpdatesLogger {
  private readonly logger: Logger;

  constructor(context: common.ApplicationContext) {
    new PersistentUpdatesLog(context.filesDir).prepare().catch(error => console.error(`[ExpoUpdates] ${String(error)}`));
    this.logger = new Logger([
      LogHandlers.createOSLogHandler(updatesLogCategory),
      LogHandlers.createPersistentFileLogHandler(context.filesDir, updatesLogCategory),
    ], context.applicationInfo.debug);
  }

  trace(message: string, code: string = 'None', updateId?: string, assetId?: string): void { this.log(message, code, 'trace', updateId, assetId); }
  debug(message: string, code: string = 'None', updateId?: string, assetId?: string): void { this.log(message, code, 'debug', updateId, assetId); }
  info(message: string, code: string = 'None', updateId?: string, assetId?: string): void { this.log(message, code, 'info', updateId, assetId); }
  warn(message: string, code: string = 'None', updateId?: string, assetId?: string): void { this.log(message, code, 'warn', updateId, assetId); }
  error(message: string, cause: Error, code: string = 'None', updateId?: string, assetId?: string): void { this.log(message, code, 'error', updateId, assetId, cause); }
  fatal(message: string, cause: Error, code: string = 'None', updateId?: string, assetId?: string): void { this.log(message, code, 'fatal', updateId, assetId, cause); }

  startTimer(label: string): LoggerTimer {
    return this.logger.startTimer(duration => this.entry(label, 'None', 'timer', undefined, undefined, undefined, duration));
  }

  log(message: string, code: string = 'None', level: LogType = 'info', updateId?: string, assetId?: string, cause?: Error): void {
    this.logger.log(level, this.entry(message, code, level, updateId, assetId, cause));
  }

  private entry(message: string, code: string, level: LogType, updateId?: string, assetId?: string, cause?: Error, duration?: number): string {
    const entry: Json = { timestamp: Date.now(), message, code, level };
    if (updateId !== undefined) entry.updateId = updateId;
    if (assetId !== undefined) entry.assetId = assetId;
    if (duration !== undefined) entry.duration = duration;
    if ((level === 'error' || level === 'fatal') && cause?.stack) {
      const frames = cause.stack.split('\n').filter(line => line.length > 0);
      if (frames[0] === `${cause.name}: ${cause.message}` || frames[0] === cause.message) frames.shift();
      if (frames.length > 0) entry.stacktrace = frames.slice(0, 20);
    }

    return JSON.stringify(entry);
  }
}
