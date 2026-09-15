import { Filters, UpdateRecord } from '../UpdatesProtocol';
import { LauncherSelectionPolicy } from './LauncherSelectionPolicy';
import { LoaderSelectionPolicy } from './LoaderSelectionPolicy';
import { ReaperSelectionPolicy } from './ReaperSelectionPolicy';

export class UpdatesSelectionPolicy {
  constructor(readonly launcher: LauncherSelectionPolicy, readonly loader: LoaderSelectionPolicy, readonly reaper: ReaperSelectionPolicy) {}
  select(updates: UpdateRecord[], filters?: Filters): UpdateRecord | undefined { return this.launcher.select(updates, filters); }
  shouldLoad(update: UpdateRecord | undefined, launched: UpdateRecord | undefined, filters?: Filters): boolean {
    return this.loader.shouldLoadNewUpdate(update, launched, filters);
  }
  shouldLoadRollback(embedded: UpdateRecord, launched: UpdateRecord | undefined, time: number, filters?: Filters): boolean {
    return this.loader.shouldLoadRollback(embedded, launched, time, filters);
  }
  toDelete(updates: UpdateRecord[], launched: UpdateRecord | undefined, filters?: Filters): UpdateRecord[] {
    return this.reaper.toDelete(updates, launched, filters);
  }
}
