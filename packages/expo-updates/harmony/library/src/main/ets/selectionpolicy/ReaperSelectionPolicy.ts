import { Filters, UpdateRecord } from '../UpdatesProtocol';
import { matchesFilters } from './Filters';
export interface ReaperSelectionPolicy { toDelete(updates: UpdateRecord[], launched: UpdateRecord | undefined, filters?: Filters): UpdateRecord[]; }
export class FilterAwareReaper implements ReaperSelectionPolicy {
  toDelete(updates: UpdateRecord[], launched: UpdateRecord | undefined, filters?: Filters): UpdateRecord[] {
    if (!launched) return [];

    const older = updates.filter(update => update.scope === launched.scope && update.time < launched.time).sort((a, b) => b.time - a.time);
    const keep = older.find(update => matchesFilters(update, filters)) ?? older[0];

    return older.filter(update => update.id !== keep?.id && update.status !== 'embedded');
  }
}
export class DevelopmentReaper implements ReaperSelectionPolicy {
  constructor(private readonly max: number = 10) {
    if (!Number.isSafeInteger(max) || max <= 0) throw new Error('maxUpdatesToKeep must be positive.');
  }
  toDelete(updates: UpdateRecord[], launched: UpdateRecord | undefined): UpdateRecord[] {
    if (!launched || updates.length <= this.max) return [];

    const ordered = [...updates].sort((a, b) => a.accessed - b.accessed || a.time - b.time);
    const result: UpdateRecord[] = [];
    let skipped = false;
    while (ordered.length > this.max) {
      const oldest = ordered.shift()!;
      if (oldest.id === launched.id) {
        if (skipped) throw new Error('Duplicate launched update ID.');
        skipped = true;
        ordered.push(oldest);
      } else result.push(oldest);
    }

    return result;
  }
}
