import { Manifest } from '@expo-harmony/expo-manifests';
import type { Filters, UpdateRecord } from '../UpdatesProtocol';

export function matchesFilters(value: UpdateRecord, filters?: Filters): boolean {
  if (!filters) return true;

  const metadata = Manifest.fromManifestJson(value.manifest).getMetadata();
  if (metadata === null) return true;

  const keys = Object.fromEntries(Object.entries(metadata as Record<string, ESObject>).map(([key, item]) => [key.toLowerCase(), item]));

  return Object.entries(filters).every(([key, item]) => !Object.prototype.hasOwnProperty.call(keys, key) || keys[key] === item);
}
