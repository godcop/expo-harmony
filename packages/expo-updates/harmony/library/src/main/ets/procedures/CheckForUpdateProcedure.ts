import { ExpoUpdatesError, Json } from '../UpdatesProtocol';
import { ProcedureContext, StateMachineProcedure } from './StateMachineProcedure';
import { UpdatesProcedureHost } from './UpdatesProcedureHost';

export class CheckForUpdateProcedure implements StateMachineProcedure<Json> {
  constructor(private readonly host: UpdatesProcedureHost) {}

  async run(context: ProcedureContext): Promise<Json> {
    context.process({ type: 'check' });
    try {
      await this.host.loadEmbedded();
      const { result } = await this.host.loader.check(this.host.configuration, this.host.policy, this.host.launched, this.host.embedded);
      if (result.isAvailable) context.process({ type: 'checkCompleteWithUpdate', manifest: result.manifest });
      else if (result.isRollBackToEmbedded) context.process({ type: 'checkCompleteWithRollback', commitTime: result.time });
      else context.process({ type: 'checkCompleteUnavailable' });

      const { time, ...value } = result;

      return value;
    } catch (error) {
      context.process({ type: 'checkError', errorMessage: error instanceof Error ? error.message : String(error) });
      this.host.storage.logger.error(String(error), error as Error, 'UpdateFailedToLoad');
      throw new ExpoUpdatesError(error instanceof ExpoUpdatesError ? error.code : 'ERR_UPDATES_CHECK', `Unable to check for updates: ${String(error)}`, error as Error);
    }
  }
}
