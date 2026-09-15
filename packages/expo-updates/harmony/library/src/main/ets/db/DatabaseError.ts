import { BusinessError } from '@kit.BasicServicesKit';

const corrupted = 14800011;

export function isCorrupt(error: unknown): boolean {
  return Number((error as BusinessError)?.code) === corrupted
    || /sqlite_corrupt|notadb|not a database|database is malformed|database is corrupted|malformed database|integrity check failed/.test(String(error).toLowerCase());
}
