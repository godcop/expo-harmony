import { ExpoModuleContext } from '@expo-harmony/expo-modules-core';
import fs from '@ohos.file.fs';
import { rcp } from '@kit.RemoteCommunicationKit';
import util from '@ohos.util';
import url from '@ohos.url';
import uniformTypeDescriptor from '@ohos.data.uniformTypeDescriptor';
import { ExpoFetchError } from './ExpoFetchError';
import { FetchInit, FetchResult, StreamPacket, EMPTY_BYTES } from './FetchTypes';
import {
  copyBytes,
  chunksToBuffer,
  encodeString,
  errorMessage,
  formatError,
  headerFromPairs,
  headerPairs,
  isFileURL,
  isHttpURL,
  isRedirectStatus,
  makeHeaders,
  mimeType,
  readFileBuffer,
  requestMethodRequiresBody,
  sameOrigin,
  storeResponseCookies,
  withStoredCookies,
  withoutHeaders,
} from './FetchUtils';
import { filePathFromUrl, headersForDecodedResponse, requestMethodPolicy } from './FetchHeaderPolicy';

export class FetchTask {
  session: rcp.Session | null = null;
  url: string;
  queued: ArrayBuffer[] = [];
  readers: Array<(packet: StreamPacket) => void> = [];
  completionWaiters: Array<() => void> = [];
  headers: string[][] = [];
  completed: boolean = false;
  streaming: boolean = false;
  error: ExpoFetchError | null = null;
  localFilePath: string | null = null;
  localFile: fs.File | null = null;
  localFileOffset: number = 0;
  localFileSize: number = 0;
  activeAttempt: FetchAttempt | null = null;

  constructor(urlValue: string) {
    this.url = urlValue;
  }
}

export class FetchAttempt {
  request: rcp.Request;
  status: number = 0;
  statusText: string | null = null;
  headers: string[][] = [];
  chunks: ArrayBuffer[] = [];
  accepted: boolean = false;
  discarded: boolean = false;
  ended: boolean = false;
  metadataReady: Promise<void>;
  private metadataSettled: boolean = false;
  private headersReceived: boolean = false;
  private resolveMetadata: () => void = (): void => {};
  private rejectMetadata: (error: Error) => void = (_error: Error): void => {};

  constructor(request: rcp.Request) {
    this.request = request;
    this.metadataReady = new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
      this.resolveMetadata = resolve;
      this.rejectMetadata = reject;
    });
    this.metadataReady.catch((_error: Error): void => {});
  }

  receiveStatus(status: number, reasonPhrase?: string): void {
    if (reasonPhrase !== undefined) this.statusText = reasonPhrase;
    if (this.metadataSettled) return;

    this.status = status;
    this.settleMetadata();
  }

  setReasonPhrase(reasonPhrase?: string): void {
    if (reasonPhrase !== undefined) this.statusText = reasonPhrase;
  }

  receiveHeaders(headers: string[][]): void {
    if (this.metadataSettled) return;

    this.headers = headers;
    this.headersReceived = true;
    this.settleMetadata();
  }

  private settleMetadata(): void {
    if (!this.headersReceived || this.status === 0) return;
    // Informational responses are followed by another status/header pair.
    if (this.status < 200) {
      this.status = 0;
      this.headers = [];
      this.headersReceived = false;

      return;
    }
    this.metadataSettled = true;
    this.resolveMetadata();
  }

  failMetadata(error: ExpoFetchError): void {
    if (this.metadataSettled) return;
    this.metadataSettled = true;
    this.rejectMetadata(new Error(formatError(error)));
  }
}

export class ExpoFetchRuntime {
  private readonly context: ExpoModuleContext;

  private readonly tasks: Map<string, FetchTask> = new Map<string, FetchTask>();
  private destroyed: boolean = false;
  private nextRequestId: number = 1;

  constructor(context: ExpoModuleContext) {
    this.context = context;
  }

  allocateRequestId(): string {
    this.assertActive();
    const id = `expo-fetch-${this.nextRequestId}`;
    this.nextRequestId += 1;

    return id;
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;

    Array.from(this.tasks.keys()).forEach((id: string): void => {
      this.cancel(id, new ExpoFetchError('ERR_FETCH_RUNTIME_DESTROYED', 'The Harmony fetch runtime has been destroyed'));
    });
    this.tasks.clear();
  }

  async start(id: string, inputUrl: string, init: FetchInit, requestBody: Uint8Array | null): Promise<FetchResult> {
    this.assertActive();
    if (isFileURL(inputUrl)) {
      return await this.startLocalFile(id, inputUrl, init, requestBody);
    }
    if (!isHttpURL(inputUrl)) {
      throw new ExpoFetchError('ERR_FETCH_INVALID_URL', `Invalid fetch URL: ${inputUrl}`);
    }

    const task = new FetchTask(inputUrl);
    this.tasks.set(id, task);

    let target = inputUrl;
    let method = init.method ?? 'GET';
    let body: ArrayBuffer | null = requestBody === null ? null : copyBytes(requestBody);
    let headers = makeHeaders(init);
    let redirects = 0;

    try {
      while (true) {
        const sent = await withStoredCookies(headers, target, init.credentials);
        this.assertTaskActive(task);

        const request = new rcp.Request(target, requestMethodPolicy(method), sent as rcp.RequestHeaders);
        if (body !== null) request.content = body;
        else if (requestMethodRequiresBody(method)) request.content = new ArrayBuffer(0);

        const attempt = new FetchAttempt(request);
        task.activeAttempt = attempt;
        this.startAttempt(task, attempt);
        // RCP reports the status and headers before the body finishes. Await
        // only those events here; the fetch promise owns body completion/errors.
        await attempt.metadataReady;
        const status = attempt.status;

        if (task.error !== null) throw new ExpoFetchError(task.error.code, task.error.message, task.error.cause);
        if (init.credentials === 'include') {
          await storeResponseCookies(target, attempt.headers);
        }
        this.assertTaskActive(task);

        const location = headerFromPairs(attempt.headers, 'location');
        const redirect = isRedirectStatus(status) && location !== null;
        if (redirect && init.redirect === 'follow' && location.trim().length === 0) {
          attempt.discarded = true;
          const error = new ExpoFetchError('ERR_FETCH_REDIRECT', 'Redirect Location must not be empty');
          this.failTask(task, error);
          throw new ExpoFetchError(error.code, error.message, error.cause);
        }
        if (redirect && init.redirect === 'error') {
          attempt.discarded = true;
          const error = new ExpoFetchError('ERR_FETCH_REDIRECT', "Redirect is not allowed when redirect mode is 'error'");
          this.failTask(task, error);
          throw new ExpoFetchError(error.code, error.message, error.cause);
        }
        if (redirect && init.redirect === 'follow') {
          redirects += 1;
          if (redirects > 20) {
            attempt.discarded = true;
            const error = new ExpoFetchError('ERR_FETCH_TOO_MANY_REDIRECTS', 'The fetch request exceeded 20 redirects');
            this.failTask(task, error);
            throw new ExpoFetchError(error.code, error.message, error.cause);
          }

          attempt.discarded = true;
          this.destroySession(task);
          const next = url.URL.parseURL(location ?? '', target).toString();
          if (!isHttpURL(next)) {
            throw new ExpoFetchError('ERR_FETCH_INVALID_URL', `Invalid redirect URL: ${next}`);
          }

          if (!sameOrigin(target, next)) {
            headers = withoutHeaders(headers, ['authorization', 'proxy-authorization', 'cookie', 'cookie2']);
          }
          if (((status === 301 || status === 302) && method === 'POST') || (status === 303 && method !== 'GET' && method !== 'HEAD')) {
            method = 'GET';
            body = null;
            headers = withoutHeaders(headers, [
              'content-encoding',
              'content-language',
              'content-location',
              'content-type',
              'content-length',
              'transfer-encoding',
            ]);
          }

          target = next;
          continue;
        }

        task.url = target;
        task.headers = headersForDecodedResponse(attempt.headers);
        attempt.accepted = true;

        attempt.chunks.forEach((chunk: ArrayBuffer): void => this.receiveChunk(task, chunk));
        attempt.chunks = [];
        if (attempt.ended) this.finishAttempt(task);

        return new FetchResult(status, target, redirects > 0, task.headers, attempt.statusText);
      }
    } catch (error) {
      const failure =
        task.error ??
        new ExpoFetchError(
          error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_UNKNOWN',
          error instanceof ExpoFetchError ? error.message : errorMessage(error as Object),
          error instanceof ExpoFetchError ? error.cause : (error as Object),
        );
      if (!task.completed) this.failTask(task, failure);
      else this.disposeTask(task);
      this.tasks.delete(id);

      throw new ExpoFetchError(failure.code, failure.message, failure.cause);
    }
  }

  async startStreaming(id: string): Promise<StreamPacket> {
    this.assertActive();
    const task = this.requireTask(id);
    task.streaming = true;

    if (task.localFilePath !== null) {
      try {
        const data = await this.readLocalFileChunk(task);
        const completed = task.localFileOffset >= task.localFileSize;
        if (completed) {
          await this.closeLocalFile(task);
          this.tasks.delete(id);
        }

        return new StreamPacket(new Uint8Array(data), completed, completed);
      } catch (error) {
        await this.closeLocalFile(task);
        this.tasks.delete(id);

        throw new ExpoFetchError(
          error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_FILE_READ',
          error instanceof ExpoFetchError ? error.message : `${task.localFilePath}: ${errorMessage(error as Object)}`,
          error instanceof ExpoFetchError ? error.cause : (error as Object),
        );
      }
    }

    const queued = task.queued.shift() ?? new ArrayBuffer(0);
    if (task.completed && task.queued.length === 0) {
      this.tasks.delete(id);
      return new StreamPacket(new Uint8Array(queued), true, true, task.error);
    }

    return new StreamPacket(new Uint8Array(queued), false, false);
  }

  async readChunk(id: string): Promise<StreamPacket> {
    this.assertActive();
    const task = this.requireTask(id);

    if (task.localFilePath !== null) {
      if (task.localFileOffset >= task.localFileSize) {
        await this.closeLocalFile(task);
        this.tasks.delete(id);
        return new StreamPacket(EMPTY_BYTES, true, false, task.error);
      }
      try {
        return new StreamPacket(new Uint8Array(await this.readLocalFileChunk(task)), false, false);
      } catch (error) {
        await this.closeLocalFile(task);
        this.tasks.delete(id);

        throw new ExpoFetchError(
          error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_FILE_READ',
          error instanceof ExpoFetchError ? error.message : `${task.localFilePath}: ${errorMessage(error as Object)}`,
          error instanceof ExpoFetchError ? error.cause : (error as Object),
        );
      }
    }

    if (task.queued.length > 0) {
      const data = task.queued.shift() ?? new ArrayBuffer(0);
      return new StreamPacket(new Uint8Array(data), false, false);
    }
    if (task.completed) {
      this.tasks.delete(id);
      return new StreamPacket(EMPTY_BYTES, true, false, task.error);
    }

    return await new Promise<StreamPacket>((resolve: (packet: StreamPacket) => void): void => {
      task.readers.push(resolve);
    });
  }

  async consumeArrayBuffer(id: string): Promise<ArrayBuffer> {
    this.assertActive();
    const task = this.requireTask(id);

    try {
      await this.awaitCompletion(task);
      this.assertActive();
      if (task.error !== null) throw new ExpoFetchError(task.error.code, task.error.message, task.error.cause);

      return task.localFilePath === null
        ? chunksToBuffer(task.queued)
        : await readFileBuffer(this.context.filePathForRead(task.localFilePath), task.localFileSize);
    } catch (error) {
      if (task.localFilePath !== null) {
        throw new ExpoFetchError(
          error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_FILE_READ',
          error instanceof ExpoFetchError ? error.message : `${task.localFilePath}: ${errorMessage(error as Object)}`,
          error instanceof ExpoFetchError ? error.cause : (error as Object),
        );
      }
      throw new ExpoFetchError(
        error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_UNKNOWN',
        error instanceof ExpoFetchError ? error.message : errorMessage(error as Object),
        error instanceof ExpoFetchError ? error.cause : (error as Object),
      );
    } finally {
      await this.closeLocalFile(task);
      this.tasks.delete(id);
    }
  }

  async consumeText(id: string): Promise<string> {
    this.assertActive();
    const task = this.requireTask(id);

    try {
      await this.awaitCompletion(task);
      this.assertActive();
      if (task.error !== null) throw new ExpoFetchError(task.error.code, task.error.message, task.error.cause);

      const buffer =
        task.localFilePath === null
          ? chunksToBuffer(task.queued)
          : await readFileBuffer(this.context.filePathForRead(task.localFilePath), task.localFileSize);

      return new util.TextDecoder('utf-8').decode(new Uint8Array(buffer));
    } catch (error) {
      if (task.localFilePath !== null) {
        throw new ExpoFetchError(
          error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_FILE_READ',
          error instanceof ExpoFetchError ? error.message : `${task.localFilePath}: ${errorMessage(error as Object)}`,
          error instanceof ExpoFetchError ? error.cause : (error as Object),
        );
      }
      throw new ExpoFetchError(
        error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_UNKNOWN',
        error instanceof ExpoFetchError ? error.message : errorMessage(error as Object),
        error instanceof ExpoFetchError ? error.cause : (error as Object),
      );
    } finally {
      await this.closeLocalFile(task);
      this.tasks.delete(id);
    }
  }

  async waitForCompletion(id: string): Promise<void> {
    const task = this.requireTask(id);
    await this.awaitCompletion(task);
    this.assertActive();
  }

  cancel(id: string, error: ExpoFetchError): void {
    const task = this.tasks.get(id);
    if (task === undefined) return;
    if (!task.completed) this.failTask(task, error);
    else this.disposeTask(task);
  }

  cancelStreaming(id: string): void {
    const task = this.tasks.get(id);
    if (task === undefined) return;

    task.error = null;
    this.completeTask(task);
    this.disposeTask(task);
    this.tasks.delete(id);
  }

  discard(id: string): void {
    const task = this.tasks.get(id);
    if (task === undefined) return;

    this.completeTask(task);
    this.disposeTask(task);
    this.tasks.delete(id);
  }

  private async startLocalFile(id: string, inputUrl: string, init: FetchInit, requestBody: Uint8Array | null): Promise<FetchResult> {
    const path = filePathFromUrl(inputUrl);
    this.context.assertFileAccess(path);

    const task = new FetchTask(inputUrl);
    task.headers = [['content-type', mimeType(path)]];
    const method = init.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new ExpoFetchError('ERR_FETCH_METHOD', `The ${method} method is not supported for file URLs`);
    }
    if (requestBody !== null) {
      throw new ExpoFetchError('ERR_FETCH_BODY', 'A file URL request cannot have a body');
    }

    try {
      if (!(await fs.access(path))) {
        const body = encodeString('File not found');
        task.headers = [
          ['content-type', 'text/plain'],
          ['content-length', String(body.byteLength)],
        ];
        if (method !== 'HEAD') task.queued = [copyBytes(body)];
        task.completed = true;
        this.tasks.set(id, task);

        return new FetchResult(404, inputUrl, false, task.headers, 'File not found');
      }

      const stat = await fs.stat(path);
      if (!stat.isFile()) throw new Error(`Path is not a regular file: ${path}`);

      task.localFilePath = path;
      task.localFileSize = stat.size;
      task.headers.push(['content-length', String(task.localFileSize)]);
      if (method === 'HEAD') task.localFilePath = null;
      task.completed = true;
      this.tasks.set(id, task);

      return new FetchResult(200, inputUrl, false, task.headers);
    } catch (error) {
      throw new ExpoFetchError(
        error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_FILE_READ',
        error instanceof ExpoFetchError ? error.message : `${path}: ${errorMessage(error as Object)}`,
        error instanceof ExpoFetchError ? error.cause : (error as Object),
      );
    }
  }

  private startAttempt(task: FetchTask, attempt: FetchAttempt): void {
    const session = rcp.createSession();
    task.session = session;
    attempt.request.configuration = {
      transfer: {
        autoRedirect: false,
        timeout: { connectMs: 0, transferMs: 0 },
      },
      tracing: {
        httpEventsHandler: {
          onStatusCodeReceive: (status: number): void => {
            if (attempt.discarded || task.completed) return;
            attempt.receiveStatus(status);
          },
          onHeaderReceive: (headers: rcp.ResponseHeaders): void => {
            if (attempt.discarded || task.completed) return;
            attempt.receiveHeaders(headerPairs(headers));
          },
          // Supplying onDataReceive also disables RCP's whole-body buffering.
          onDataReceive: (chunk: ArrayBuffer): void => {
            if (attempt.discarded || task.completed) return;
            if (attempt.accepted) this.receiveChunk(task, chunk);
            else attempt.chunks.push(chunk);
          },
        },
      },
    };
    session
      .fetch(attempt.request)
      .then((response: rcp.Response): void => {
        if (attempt.discarded || task.completed) return;

        // Also handle responses completed before their event callbacks run.
        attempt.setReasonPhrase(response.reasonPhrase);
        attempt.receiveStatus(response.statusCode, response.reasonPhrase);
        attempt.receiveHeaders(headerPairs(response.headers));
        attempt.ended = true;
        if (attempt.accepted) this.finishAttempt(task);
      })
      .catch((error: Object): void => {
        // Closing a redirect's session must not fail the next request.
        if (attempt.discarded || task.completed) return;
        this.failTask(
          task,
          new ExpoFetchError(
            error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_UNKNOWN',
            error instanceof ExpoFetchError ? error.message : errorMessage(error as Object),
            error instanceof ExpoFetchError ? error.cause : (error as Object),
          ),
        );
      });
  }

  private receiveChunk(task: FetchTask, values: ArrayBuffer): void {
    if (task.completed) return;
    if (task.streaming && task.readers.length > 0) {
      const resolve = task.readers.shift();
      if (resolve !== undefined) {
        resolve(new StreamPacket(new Uint8Array(values), false, false));
        return;
      }
    }
    task.queued.push(values);
  }

  private assertActive(): void {
    if (this.destroyed) {
      throw new ExpoFetchError('ERR_FETCH_RUNTIME_DESTROYED', 'The Harmony fetch runtime has been destroyed');
    }
  }

  private assertTaskActive(task: FetchTask): void {
    this.assertActive();
    if (task.error !== null) throw new ExpoFetchError(task.error.code, task.error.message, task.error.cause);
    if (task.completed) throw new ExpoFetchError('ERR_FETCH_REQUEST_CANCELED', 'Fetch request has been canceled');
  }

  private requireTask(id: string): FetchTask {
    const task = this.tasks.get(id);
    if (task === undefined) {
      throw new ExpoFetchError('ERR_FETCH_TASK_NOT_FOUND', id);
    }
    return task;
  }

  private async awaitCompletion(task: FetchTask): Promise<void> {
    if (task.completed) return;
    await new Promise<void>((resolve: () => void): void => {
      task.completionWaiters.push(resolve);
    });
  }

  private async readLocalFileChunk(task: FetchTask): Promise<ArrayBuffer> {
    if (task.localFilePath === null) return new ArrayBuffer(0);

    const remaining = task.localFileSize - task.localFileOffset;
    if (remaining <= 0) return new ArrayBuffer(0);

    const buffer = new ArrayBuffer(Math.min(64 * 1024, remaining));
    if (task.localFile === null) {
      this.context.assertFileAccess(task.localFilePath);
      task.localFile = await fs.open(task.localFilePath, fs.OpenMode.READ_ONLY);
    }
    const count = await fs.read(task.localFile.fd, buffer, { length: buffer.byteLength });
    if (count <= 0) throw new Error(`Unable to read file: ${task.localFilePath}`);

    task.localFileOffset += count;

    return count === buffer.byteLength ? buffer : buffer.slice(0, count);
  }

  private async closeLocalFile(task: FetchTask): Promise<void> {
    if (task.localFile === null) return;

    const file = task.localFile;
    task.localFile = null;

    try {
      await fs.close(file.fd);
    } catch (_error) {}
  }

  private completeTask(task: FetchTask): void {
    if (task.completed) return;

    task.completed = true;
    this.destroySession(task);

    while (task.readers.length > 0) {
      const resolve = task.readers.shift();
      if (resolve !== undefined) {
        resolve(new StreamPacket(EMPTY_BYTES, true, false, task.error));
      }
    }
    while (task.completionWaiters.length > 0) {
      const resolve = task.completionWaiters.shift();
      if (resolve !== undefined) resolve();
    }
  }

  private failTask(task: FetchTask, error: ExpoFetchError): void {
    if (task.completed) return;

    task.error = error;
    task.activeAttempt?.failMetadata(error);
    this.completeTask(task);
  }

  private finishAttempt(task: FetchTask): void {
    this.completeTask(task);
  }

  private destroySession(task: FetchTask): void {
    const attempt = task.activeAttempt;
    if (attempt !== null) {
      attempt.discarded = true;
      attempt.chunks = [];
      attempt.failMetadata(task.error ?? new ExpoFetchError('ERR_FETCH_REQUEST_CANCELED', 'Fetch request has been canceled'));
    }
    const session = task.session;
    task.session = null;
    if (session === null) return;
    if (attempt !== null && !attempt.ended) {
      try {
        session.cancel(attempt.request);
      } catch (_error) {}
    }

    try {
      session.close();
    } catch (_error) {}
  }

  private disposeTask(task: FetchTask): void {
    this.destroySession(task);
    this.closeLocalFile(task).catch((_error: Object): void => {});
  }
}
