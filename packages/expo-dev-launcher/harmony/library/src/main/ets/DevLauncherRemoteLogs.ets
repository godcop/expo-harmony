import webSocket from '@ohos.net.webSocket';
import uri from '@ohos.uri';

export function sendRuntimeError(bundleURL: string, error: Error): void {
  try {
    const parsed = new uri.URI(bundleURL);
    if ((parsed.scheme !== 'http' && parsed.scheme !== 'https') || parsed.authority.includes('@')) return;

    const socket = webSocket.createWebSocket();
    let done = false;
    let timer: number | undefined;
    const close = (): void => {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      socket.close().catch((): void => {});
    };
    socket.on('error', close);
    socket.on('open', (): void => {
      if (done) return;
      socket
        .send(
          JSON.stringify({
            type: 'log',
            level: 'error',
            mode: 'BRIDGE',
            data: [`Expo Dev Launcher: ${error.message}\n${error.stack ?? ''}`.slice(0, 32768)],
          }),
        )
        .then(close)
        .catch(close);
    });
    timer = setTimeout(close, 2000);
    socket.connect(`${parsed.scheme === 'https' ? 'wss' : 'ws'}://${parsed.authority}/hot`).catch(close);
  } catch (_) {}
}
