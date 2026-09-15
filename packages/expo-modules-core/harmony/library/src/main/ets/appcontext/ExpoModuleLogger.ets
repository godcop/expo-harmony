import type { RNOHLogger } from '@rnoh/react-native-openharmony';
import { Logger, LogHandler, LogType } from '../logging/Logger';
import { describeLogError } from '../logging/LogHandlers';

export type ExpoModuleLogger = Logger;

export function createExpoModuleLogger(logger: RNOHLogger, moduleName: string, debug: boolean): ExpoModuleLogger {
  return new Logger([new RNOHLogHandler(logger.clone(['ExpoModules', moduleName]))], debug);
}

class RNOHLogHandler implements LogHandler {
  private readonly logger: RNOHLogger;
  constructor(logger: RNOHLogger) { this.logger = logger; }

  log(type: LogType, message: string, cause?: Error): void {
    const text = cause === undefined ? message : `${message}\n${describeLogError(cause)}`;
    switch (type) {
      case 'info': this.logger.info(text); break;
      case 'warn': this.logger.warn(text); break;
      case 'error': this.logger.error(text); break;
      case 'fatal': this.logger.fatal(text); break;
      default: this.logger.debug(text);
    }
  }
}
