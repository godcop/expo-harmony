import { Json } from './UpdatesProtocol';

export type UpdatesStateValue = 'idle' | 'checking' | 'downloading' | 'restarting';

export type UpdatesStateEvent =
  | { type: 'startStartup' | 'endStartup' | 'check' | 'checkCompleteUnavailable' | 'download' | 'downloadComplete' | 'downloadCompleteWithRollback' | 'restart' }
  | { type: 'checkCompleteWithUpdate' | 'downloadCompleteWithUpdate'; manifest: Json }
  | { type: 'checkCompleteWithRollback'; commitTime: number }
  | { type: 'checkError' | 'downloadError'; errorMessage: string }
  | { type: 'downloadProgress'; progress: number };

export function nativeEvent(event: UpdatesStateEvent): Json {
  if (event.type === 'checkCompleteWithRollback') return { type: event.type };
  if (event.type === 'downloadCompleteWithRollback') return { type: 'downloadComplete' };
  return JSON.parse(JSON.stringify(event));
}

export function destination(event: UpdatesStateEvent): UpdatesStateValue {
  if (event.type === 'check') return 'checking';
  if (event.type === 'download' || event.type === 'downloadProgress') return 'downloading';
  if (event.type === 'restart') return 'restarting';

  return 'idle';
}

export function allowed(state: UpdatesStateValue, event: UpdatesStateEvent): boolean {
  if (state === 'idle') return ['startStartup', 'endStartup', 'check', 'download', 'restart'].includes(event.type);
  if (state === 'checking') return ['checkCompleteWithUpdate', 'checkCompleteWithRollback', 'checkCompleteUnavailable', 'checkError'].includes(event.type);
  if (state === 'downloading') return ['downloadProgress', 'downloadComplete', 'downloadCompleteWithUpdate', 'downloadCompleteWithRollback', 'downloadError'].includes(event.type);

  return false;
}
