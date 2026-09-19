import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

export async function checkFetch(base: URL, controller: AbortController): Promise<string> {
  const results: string[] = [];
  const signal = controller.signal;

  for (const [name, size] of [['text', 19], ['empty', 0], ['binary', 256], ['limit', 1048576], ['large', 1048577], ['stream', 19]] as const) {
    const response = await expoFetch(new URL(name, base).href, { signal });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== size) throw new Error(`${name}: expected ${size} bytes, received ${bytes.length}`);
    if (name === 'binary' && bytes.some((value, index) => value !== index)) throw new Error('Binary response changed.');
    if ((name === 'text' || name === 'stream') && new TextDecoder().decode(bytes) !== 'Expo Harmony 网络') throw new Error('UTF-8 response changed.');
    if ((name === 'limit' || name === 'large') && bytes.some(value => value !== 120)) throw new Error(`${name}: response content changed.`);
    results.push(`${name}: ${bytes.length} bytes ✓`);
  }

  const body = JSON.stringify({ message: '中文请求体 ✓' });
  const response = await expoFetch(new URL('echo', base).href, {
    method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body, signal,
  });
  if (!response.ok || await response.text() !== body) throw new Error('POST response does not match the request.');
  results.push('UTF-8 POST: request/response identical ✓');

  const empty = await expoFetch(new URL('empty', base).href, { signal });
  if (!empty.ok || await empty.text() !== '') throw new Error('Empty text response changed.');
  results.push('empty text(): "" ✓');

  return results.join('\n');
}

export async function checkFiles(base: URL): Promise<string> {
  const file = new File(Paths.cache, `devtools-${Date.now()}.bin`);

  try {
    await File.downloadFileAsync(new URL('binary', base).href, file);
    const bytes = await file.bytes();
    if (bytes.length !== 256 || bytes.some((value, index) => value !== index)) throw new Error('Downloaded file bytes changed.');

    file.write('Expo Harmony 文件上传');
    const response = await FileSystem.uploadAsync(new URL('echo', base).href, file.uri, {
      httpMethod: 'POST', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
    if (response.status !== 200 || response.body !== 'Expo Harmony 文件上传') throw new Error('Uploaded file bytes changed.');

    return 'File.downloadFileAsync: 256 bytes ✓\nuploadAsync: UTF-8 file contents identical ✓\n临时文件将在返回前删除';
  } finally {
    if (file.exists) file.delete();
  }
}

export async function checkCancellation(base: URL, controller: AbortController): Promise<string> {
  const timer = setTimeout(() => controller.abort(), 300);

  try {
    const response = await expoFetch(new URL('slow', base).href, { signal: controller.signal });
    await response.text();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (controller.signal.aborted && error instanceof Error && (error.name === 'AbortError' || code === 'ERR_FETCH_REQUEST_CANCELED')) {
      return `请求取消 ✓ (${code ?? error.name})；请在 Network 面板确认取消后不再产生响应体。`;
    }
    throw new Error(`${error instanceof Error ? error.message : String(error)} [${code ?? 'no code'}]`);
  } finally {
    clearTimeout(timer);
  }

  throw new Error('The cancelled request unexpectedly completed.');
}
