import { Filters, Headers, UpdateRecord } from '../UpdatesProtocol';
import { matchesFilters } from './Filters';
import { equalHeaders } from './Configuration';

export interface LoaderSelectionPolicy {
  shouldLoadNewUpdate(update: UpdateRecord | undefined, launched: UpdateRecord | undefined, filters?: Filters): boolean;
  shouldLoadRollback(embedded: UpdateRecord, launched: UpdateRecord | undefined, time: number, filters?: Filters): boolean;
}

export class FilterAwareLoader implements LoaderSelectionPolicy {
  constructor(private readonly url?: string, private readonly headers?: Headers) {}

  shouldLoadNewUpdate(update: UpdateRecord | undefined, launched: UpdateRecord | undefined, filters?: Filters): boolean {
    if (!update || !matchesFilters(update, filters)) return false;
    if (!launched || !matchesFilters(launched, filters)) return true;
    if (update.url !== null && update.url !== this.url) return false;
    if (update.headers !== null && !equalHeaders(update.headers, this.headers)) return false;
    if (launched.url !== null && launched.url !== this.url) return true;
    if (launched.headers !== null && !equalHeaders(launched.headers, this.headers)) return true;

    return update.time > launched.time;
  }

  shouldLoadRollback(embedded: UpdateRecord, launched: UpdateRecord | undefined, time: number, filters?: Filters): boolean {
    return matchesFilters(embedded, filters) && (!launched || !matchesFilters(launched, filters) || time > launched.time);
  }
}
