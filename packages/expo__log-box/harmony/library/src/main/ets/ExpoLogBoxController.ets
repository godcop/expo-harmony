import { http } from '@kit.NetworkKit';
import { util } from '@kit.ArkTS';
import { pasteboard } from '@kit.BasicServicesKit';
import url from '@ohos.url';
import { RNInstanceError, RNOHError, RNOHErrorStack, type StackFrame } from '@rnoh/react-native-openharmony';
import type { DevToolsController } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/DevToolsController';
import type { ReactRuntimeContext } from '@expo-harmony/expo-modules-core';
import type { webview } from '@kit.ArkWeb';
import { RnohLogBoxAdapter } from './RnohLogBoxAdapter';

const ACTION_RELOAD: string = 'onReload';
const ACTION_FETCH_TEXT: string = 'fetchTextAsync';
const ACTION_COPY_TEXT: string = 'onCopyText';
const ACTION_MINIMIZE: string = 'onMinimize';
const ACTION_DISMISS: string = 'onDismiss';
const DOM_EVENT: string = '$$dom_event';
const NATIVE_ACTION: string = '$$native_action';
const NATIVE_ACTION_RESULT: string = '$$native_action_result';
export const LOG_BOX_READY_MESSAGE: string = '$$expo_log_box_ready';
export const LOG_BOX_ERROR_MESSAGE: string = '$$expo_log_box_error';
export const LOG_BOX_DOM_HOST_OS: string = 'harmony';
const DEFAULT_ERROR_MESSAGE: string = 'Error without message.';
const DEFAULT_WEB_ERROR_MESSAGE: string = 'The Expo LogBox page failed to initialize.';

interface NativeStackFrame {
  file?: string;
  methodName: string;
  arguments: string[];
  lineNumber?: number;
  column?: number;
  collapse?: boolean;
}

interface NativeLog {
  message: string;
  stack: NativeStackFrame[] | string;
}

interface LogBoxProps {
  platform: string;
  nativeLogs: NativeLog[];
}

interface InitialProps {
  names: string[];
  props: LogBoxProps;
}

interface ActionError {
  message: string;
}

interface ActionResultData {
  uid: string;
  actionId: string;
  result?: string;
  error?: ActionError;
}

interface NativeActionResultData {
  type: string;
  data: ActionResultData;
}

interface NativeActionResultEvent {
  detail: NativeActionResultData;
}

interface FetchOptions {
  method?: string;
  body?: string;
}

interface NativeActionData {
  actionId?: string;
  uid?: string;
  args?: Object[];
  message?: string;
}

interface NativeActionMessage {
  type?: string;
  data?: NativeActionData;
}

export interface ExpoLogBoxPresentation {
  readonly id: number;
  readonly initialProps: string;
  readonly devServerOrigin: string;
  readonly runtimeId?: number;
  readonly owner?: Object;
}

type PresentationListener = (presentation: ExpoLogBoxPresentation | undefined) => void;

class ExpoLogBoxController {
  private enabled: boolean = false;
  private manager?: DevToolsController;
  private managerCleanup: (() => void)[] = [];
  private readonly runtimes: Map<number, ReactRuntimeContext> = new Map();
  private readonly adapters: Map<number, RnohLogBoxAdapter> = new Map();
  private latestRuntimeId?: number;
  private readonly listeners: Set<PresentationListener> = new Set();
  private presentation?: ExpoLogBoxPresentation;
  private presentedError?: RNOHError;
  private customDialogReady: boolean = false;
  private nextPresentationId: number = 0;
  private reloading: boolean = false;

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  attachDevTools(manager: DevToolsController): void {
    if (this.manager === manager) return;

    this.detachDevTools();
    this.manager = manager;
    this.managerCleanup.push(
      manager.eventEmitter.subscribe('NEW_ERROR', (error: RNOHError): void => this.present(error)),
      manager.eventEmitter.subscribe('RELOAD', (): void => this.clear()),
    );
  }

  bindRuntime(context: ReactRuntimeContext): () => void {
    if (!this.enabled || context.isHeadless) return (): void => {};

    const id = context.instance.getId();
    const adapter = new RnohLogBoxAdapter(context.instance);
    this.runtimes.set(id, context);
    this.adapters.set(id, adapter);
    this.latestRuntimeId = id;

    return (): void => {
      if (this.runtimes.get(id) !== context) return;
      adapter.dispose();
      this.adapters.delete(id);
      this.runtimes.delete(id);
      if (this.latestRuntimeId === id) this.latestRuntimeId = this.lastRuntimeId();
      if (this.presentation?.runtimeId === id && !this.reloading) this.clear();
    };
  }

  subscribe(listener: PresentationListener): () => void {
    this.listeners.add(listener);
    listener(this.presentation);

    return (): void => {
      this.listeners.delete(listener);
    };
  }

  ready(id: number): void {
    if (this.presentation?.id !== id) return;
    const manager = this.manager;
    if (manager === undefined) return;
    manager.dismissRNOHErrorDialog();
    this.customDialogReady = true;
  }

  fail(id: number, error: Object): void {
    if (this.presentation?.id !== id) return;
    console.error(`Expo LogBox could not display the error: ${errorMessage(error)}`);

    const manager = this.manager;
    const presentedError = this.presentedError;
    if (manager !== undefined && presentedError !== undefined) {
      // Restore RNOH's dialog before removing the failed custom view. The active presentation
      // makes this controller ignore its own replayed NEW_ERROR event.
      this.customDialogReady = false;
      manager.setLastError(presentedError);
      manager.eventEmitter.emit('NEW_ERROR', presentedError);
    }
    this.clear();
  }

  async handleMessage(rawMessage: string, web: webview.WebviewController, presentationId: number): Promise<void> {
    let message: NativeActionMessage;

    try {
      message = JSON.parse(rawMessage) as NativeActionMessage;
    } catch (error) {
      console.error(`Expo LogBox received an invalid native action: ${errorMessage(error as Object)}`);
      return;
    }

    // A disposed WebView can finish an async postMessage after a newer error is presented.
    if (this.presentation?.id !== presentationId) return;

    if (message.type === LOG_BOX_READY_MESSAGE) {
      this.ready(presentationId);
      return;
    }
    if (message.type === LOG_BOX_ERROR_MESSAGE) {
      const error = message.data?.message;
      this.fail(presentationId, new Error(typeof error === 'string' && error.length > 0 ? error : DEFAULT_WEB_ERROR_MESSAGE));
      return;
    }
    if (message.type !== NATIVE_ACTION) return;

    const actionId = message.data?.actionId;
    const uid = message.data?.uid;
    const args = message.data?.args;
    if (typeof actionId !== 'string' || typeof uid !== 'string' || !Array.isArray(args)) return;

    try {
      if (actionId === ACTION_RELOAD) {
        await this.reload(presentationId);
        await sendActionResult(web, uid, actionId, '');
      } else if (actionId === ACTION_MINIMIZE || actionId === ACTION_DISMISS) {
        if (actionId === ACTION_DISMISS && args[0] !== 0) throw new Error('Invalid native LogBox log index.');
        await sendActionResult(web, uid, actionId, '');
        if (this.presentation?.id === presentationId) {
          this.manager?.dismissRNOHErrorDialog();
          this.clear();
        }
      } else if (actionId === ACTION_COPY_TEXT) {
        const input = args[0];
        if (typeof input !== 'string') throw new Error('onCopyText requires text.');
        await pasteboard.getSystemPasteboard().setData(pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, input));
        await sendActionResult(web, uid, actionId, '');
      } else if (actionId === ACTION_FETCH_TEXT) {
        const input = args[0];
        if (typeof input !== 'string') throw new Error('fetchTextAsync requires a URL.');
        const options = fetchOptions(args[1]);
        const result = await this.fetchText(input, options);
        await sendActionResult(web, uid, actionId, result);
      } else {
        throw new Error(`Unsupported LogBox action: ${actionId}`);
      }
    } catch (error) {
      await sendActionError(web, uid, actionId, errorMessage(error as Object));
    }
  }

  private present(error: RNOHError): void {
    if (!this.enabled) return;

    const runtimeId = error instanceof RNInstanceError ? error.getRNInstanceId() : undefined;
    const runtime = runtimeId === undefined ? this.runtime() : this.runtimes.get(runtimeId);
    // Do not present background errors or associate a destroyed instance with another runtime.
    if (runtimeId !== undefined && runtime === undefined) return;
    if (this.presentation !== undefined) {
      if (this.reloading && runtimeId !== this.presentation.runtimeId && runtime?.owner === this.presentation.owner) {
        // A replacement runtime can fail while fetching/evaluating its bundle.
        // That failure must replace the old RedBox rather than being ignored.
        this.clear();
      } else {
        // RNOH also observes NEW_ERROR and may reopen its dialog for later errors. Once the
        // custom page is ready, close that duplicate after the current event dispatch finishes.
        this.dismissDefaultDialogAfterErrorEvent(this.presentation.id);
        return;
      }
    }

    const adapter = runtime === undefined ? undefined : this.adapters.get(runtime.instance.getId());
    const sourceError = adapter?.originalError(error) ?? error;
    const nativeLog: NativeLog = {
      message: normalizedMessage(sourceError),
      stack: normalizedStack(sourceError),
    };
    const props: LogBoxProps = { platform: LOG_BOX_DOM_HOST_OS, nativeLogs: [nativeLog] };
    const payload: InitialProps = {
      names: [ACTION_RELOAD, ACTION_FETCH_TEXT, ACTION_COPY_TEXT, ACTION_MINIMIZE, ACTION_DISMISS],
      props,
    };
    const initialProps = JSON.stringify(payload);

    this.presentedError = error;
    this.customDialogReady = false;
    this.presentation = {
      id: ++this.nextPresentationId,
      initialProps,
      devServerOrigin: devServerOrigin(adapter?.bundleUrl()),
      runtimeId: runtime?.instance.getId(),
      owner: runtime?.owner,
    };
    this.notify();
  }

  private async reload(presentationId: number): Promise<void> {
    if (this.reloading) return;

    const runtime = this.runtimeForPresentation();
    if (runtime === undefined) {
      this.manager?.reload('ExpoLogBox:Reload');
      return;
    }
    this.reloading = true;
    try {
      await runtime.reload('ExpoLogBox:Reload');
      if (this.presentation?.id === presentationId) this.clear();
    } catch (error) {
      // Keep the current LogBox visible so a failed reload never leaves a blank application.
      console.error(`Expo LogBox could not reload the React Native runtime: ${errorMessage(error as Object)}`);
      throw new Error(errorMessage(error as Object));
    } finally {
      this.reloading = false;
    }
  }

  private async fetchText(input: string, options?: FetchOptions): Promise<string> {
    const runtime = this.runtimeForPresentation();
    if (runtime === undefined) throw new Error('No active React Native runtime is available.');

    const requestedMethod = typeof options?.method === 'string' ? options.method.toUpperCase() : 'GET';
    const method = httpMethod(requestedMethod);

    const body = typeof options?.body === 'string' ? options.body : undefined;
    const hasBody = body !== undefined && method !== http.RequestMethod.GET && method !== http.RequestMethod.HEAD;
    const header: Record<string, string> = {};
    if (hasBody) header['Content-Type'] = 'application/json; charset=utf-8';

    const request = runtime.instance.httpClient.sendRequest(input, {
      method,
      header,
      extraData: hasBody ? body : undefined,
    });
    const response = await request.promise;
    if (typeof response.body === 'string') return response.body;
    return util.TextDecoder.create('utf-8').decodeToString(new Uint8Array(response.body));
  }

  private runtimeForPresentation(): ReactRuntimeContext | undefined {
    const runtimeId = this.presentation?.runtimeId;
    const runtime = runtimeId === undefined ? undefined : this.runtimes.get(runtimeId);
    if (runtime !== undefined) return runtime;

    const owner = this.presentation?.owner;
    if (owner !== undefined) {
      for (const candidate of this.runtimes.values()) {
        if (candidate.owner === owner) return candidate;
      }
    }
    return undefined;
  }

  private runtime(id?: number): ReactRuntimeContext | undefined {
    if (id !== undefined) {
      const exact = this.runtimes.get(id);
      if (exact !== undefined) return exact;
    }
    return this.latestRuntimeId === undefined ? undefined : this.runtimes.get(this.latestRuntimeId);
  }

  private lastRuntimeId(): number | undefined {
    let result: number | undefined;
    for (const id of this.runtimes.keys()) result = id;
    return result;
  }

  private dismissDefaultDialogAfterErrorEvent(presentationId: number): void {
    const manager = this.manager;
    if (!this.customDialogReady || manager === undefined) return;

    Promise.resolve().then((): void => {
      if (this.presentation?.id === presentationId && this.customDialogReady && this.manager === manager) {
        manager.dismissRNOHErrorDialog();
      }
    });
  }

  private clear(): void {
    const hadPresentation = this.presentation !== undefined;
    this.presentation = undefined;
    this.presentedError = undefined;
    this.customDialogReady = false;
    if (hadPresentation) this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.presentation);
  }

  private detachDevTools(): void {
    for (const cleanup of this.managerCleanup.splice(0)) cleanup();
    this.manager = undefined;
  }
}

function normalizedMessage(error: RNOHError): string {
  const message = error.getMessage();
  const parts: string[] = [typeof message === 'string' && message.length > 0 ? message : DEFAULT_ERROR_MESSAGE];
  const suggestions = error.getSuggestions();
  if (suggestions.length > 0) parts.push(suggestions.join('\n'));

  const extra: Object | undefined = error.getExtraData() as Object | undefined;
  if (extra instanceof Error) {
    parts.push(extra.stack || `${extra.name}: ${extra.message}`);
  } else if (typeof extra === 'string') {
    if (extra.length > 0) parts.push(extra);
  } else if (extra !== undefined && extra !== null) {
    try {
      parts.push(JSON.stringify(extra, null, 2));
    } catch (_error) {
      parts.push(String(extra));
    }
  }

  return parts.join('\n\n');
}

function normalizedStack(error: RNOHError): NativeStackFrame[] | string {
  const stack = error.getStack();
  if (typeof stack === 'string') return stack;
  if (!(stack instanceof RNOHErrorStack)) return [];

  return stack.getFrames().map(
    (frame: StackFrame): NativeStackFrame => ({
      file: frame.file,
      methodName: frame.methodName,
      arguments: [],
      lineNumber: frame.lineNumber,
      column: frame.column,
      collapse: frame.collapse,
    }),
  );
}

function devServerOrigin(bundleUrl?: string): string {
  if (bundleUrl !== undefined) {
    try {
      const parsed = url.URL.parseURL(bundleUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.origin;
    } catch (_error) {}
  }
  return '';
}

function fetchOptions(value?: Object): FetchOptions | undefined {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as FetchOptions;
}

function httpMethod(value: string): http.RequestMethod {
  switch (value) {
    case 'DELETE':
      return http.RequestMethod.DELETE;
    case 'GET':
      return http.RequestMethod.GET;
    case 'HEAD':
      return http.RequestMethod.HEAD;
    case 'OPTIONS':
      return http.RequestMethod.OPTIONS;
    case 'POST':
      return http.RequestMethod.POST;
    case 'PUT':
      return http.RequestMethod.PUT;
    case 'TRACE':
      return http.RequestMethod.TRACE;
    case 'CONNECT':
      return http.RequestMethod.CONNECT;
    default:
      throw new Error(`Unsupported HTTP method: ${value}`);
  }
}

function errorMessage(error: Object): string {
  return error instanceof Error ? error.message : String(error);
}

async function sendActionResult(web: webview.WebviewController, uid: string, actionId: string, result: string): Promise<void> {
  const data: ActionResultData = { uid, actionId, result };
  await dispatchActionResult(web, data);
}

async function sendActionError(web: webview.WebviewController, uid: string, actionId: string, message: string): Promise<void> {
  const actionError: ActionError = { message };
  const data: ActionResultData = { uid, actionId, error: actionError };
  await dispatchActionResult(web, data);
}

async function dispatchActionResult(web: webview.WebviewController, data: ActionResultData): Promise<void> {
  const detail: NativeActionResultData = { type: NATIVE_ACTION_RESULT, data };
  const envelope: NativeActionResultEvent = { detail };
  const event = JSON.stringify(envelope);
  const name = JSON.stringify(DOM_EVENT);

  try {
    await web.runJavaScript(`
      ;(() => {
        try {
          window.dispatchEvent(new CustomEvent(${name}, ${event}));
        } catch (_error) {}
      })();
      true;
    `);
  } catch (error) {
    console.error(`Expo LogBox could not return a native action result: ${errorMessage(error as Object)}`);
  }
}

export const expoLogBoxController = new ExpoLogBoxController();
