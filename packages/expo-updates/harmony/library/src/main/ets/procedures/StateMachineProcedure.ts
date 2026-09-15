import { UpdatesStateEvent, UpdatesStateValue } from '../UpdatesStateEvent';

export interface ProcedureContext {
  process(event: UpdatesStateEvent): void;
  readonly state: UpdatesStateValue;
  reset(): void;
  cancelRestart(): void;
}

export interface StateMachineProcedure<T> {
  run(context: ProcedureContext): Promise<T>;
}
