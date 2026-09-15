import { Filters, Headers, UpdateRecord } from '../UpdatesProtocol';
import { matchesFilters } from './Filters';
import { equalHeaders } from './Configuration';

export interface LauncherSelectionPolicy {
  select(updates: UpdateRecord[], filters?: Filters): UpdateRecord | undefined;
}

export class FilterAwareLauncher implements LauncherSelectionPolicy {
  constructor(private readonly runtime: string, private readonly url?: string, private readonly headers?: Headers) {}

  select(updates: UpdateRecord[], filters?: Filters): UpdateRecord | undefined {
    return updates.filter(update => update.runtime === this.runtime && matchesFilters(update, filters)
      && ((update.url === null && update.headers === null) || (update.url === this.url && equalHeaders(update.headers, this.headers))))
      .sort((a, b) => b.time - a.time)[0];
  }
}

export class SingleUpdateLauncher implements LauncherSelectionPolicy {
  constructor(private readonly id: string) {}

  select(updates: UpdateRecord[]): UpdateRecord | undefined { return updates.find(update => update.id === this.id); }
}
