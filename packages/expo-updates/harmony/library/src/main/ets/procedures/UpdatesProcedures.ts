import { ExpoUpdatesError } from '../UpdatesProtocol';
import { ProcedureContext, StateMachineProcedure } from './StateMachineProcedure';

export class UpdatesProcedures {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly context: ProcedureContext) {}

  enqueue<T>(procedure: StateMachineProcedure<T>): Promise<T> {
    const next = this.tail.then(async () => {
      let active = true;
      const check = (): void => {
        if (!active) throw new ExpoUpdatesError('ERR_UPDATES_PROCEDURE', 'Cannot access state after procedure completion.');
      };
      const state = this.context;
      const context: ProcedureContext = {
        process: event => { check(); state.process(event); },
        get state() { check(); return state.state; },
        reset: () => { check(); state.reset(); },
        cancelRestart: () => { check(); state.cancelRestart(); },
      };

      try { return await procedure.run(context); }
      finally { active = false; }
    });
    this.tail = next.catch(() => undefined);
    return next;
  }
}
