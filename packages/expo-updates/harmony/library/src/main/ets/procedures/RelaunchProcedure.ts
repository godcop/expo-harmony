import { ExpoUpdatesError, UpdateRecord } from '../UpdatesProtocol';
import { ProcedureContext, StateMachineProcedure } from './StateMachineProcedure';

export interface RelaunchDelegate {
  select(): Promise<UpdateRecord | undefined>;
  launch(update: UpdateRecord): Promise<void>;
}

export class RelaunchProcedure implements StateMachineProcedure<void> {
  constructor(private readonly delegate: RelaunchDelegate) {}

  async run(context: ProcedureContext): Promise<void> {
    context.process({ type: 'restart' });
    try {
      const update = await this.delegate.select();
      if (!update) throw new ExpoUpdatesError('ERR_UPDATES_RELOAD', 'No launchable update is available.');
      await this.delegate.launch(update);
    } catch (error) {
      context.cancelRestart();
      throw new ExpoUpdatesError(error instanceof ExpoUpdatesError ? error.code : 'ERR_UPDATES_RELOAD', `Unable to restart the React runtime: ${String(error)}`, error as Error);
    }
    context.reset();
  }
}
