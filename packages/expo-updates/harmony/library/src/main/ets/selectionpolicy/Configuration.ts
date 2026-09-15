import { Headers } from '../UpdatesProtocol';

export function equalHeaders(first: Headers | null | undefined, second: Headers | null | undefined): boolean {
  if (first == null || second == null) return first == null && second == null;
  return Object.keys(first).length === Object.keys(second).length && Object.entries(first).every(([key, value]) => second[key] === value);
}
