import { webview } from '@kit.ArkWeb';
import { FrameCallback } from '@kit.ArkUI';
import { ExpoModuleError, ExpoView, ExpoViewContext, ExpoViewContentContext } from '@expo-harmony/expo-modules-core';
import { INSTALL_GLOBALS_SCRIPT, NATIVE_EVAL_WRAPPER_SCRIPT } from './generated/DomWebViewBrowserScripts';

const EVAL_PROMPT_HEADER: string = '__EXPO_DOM_WEBVIEW_JS_EVAL__';
const REGISTER_PROMPT: string = '__EXPO_DOM_WEBVIEW_REGISTER__';
const EVAL_REQUEST: string = 'ExpoDomWebView.eval';
const EVAL_RESULT: string = 'ExpoDomWebView.evalResult';
const MESSAGE_BRIDGE_NAME: string = 'ReactNativeWebView';
const SCROLL_ANIMATION_DURATION_MS: number = 250;
const EVAL_TIMEOUT_MS: number = 30000;

interface EvalParams {
  deferredId: number;
  source: string;
}

interface EvalResult {
  requestId: string;
  result?: string;
  error?: string;
}

interface PendingEval {
  result: JsResult;
  timer: number;
}

interface MessagePayload {
  url: string;
  title: string;
  data: string;
}

class MessageBridge {
  private readonly view: DomWebView;

  constructor(view: DomWebView) {
    this.view = view;
  }

  postMessage(message: string): void {
    this.view.dispatchMessage(String(message));
  }
}

// IDs never repeat during the ArkTS process lifetime, including RN reloads.
let nextId: number = 0;

@Observed
export class DomWebView extends ExpoView {
  readonly id: number = nextId++;
  readonly controller: webview.WebviewController = new webview.WebviewController();
  readonly bridge: MessageBridge = new MessageBridge(this);
  source: string | null = null;
  script: string = '';
  debugging: boolean = false;
  horizontal: boolean = true;
  vertical: boolean = true;
  nested: boolean = true;
  private attached: boolean = false;
  private readonly ready: Promise<void>;
  private attach?: () => void;
  private destroyed: boolean = false;
  private document?: number;
  private readonly register: (id: number, view: DomWebView) => void;
  private readonly unregister: (id: number) => void;
  private sequence: number = 0;
  private pending: Map<string, PendingEval> = new Map();
  private unsubscribe?: () => void;
  private update?: () => void;

  constructor(context: ExpoViewContext, register: (id: number, view: DomWebView) => void, unregister: (id: number) => void) {
    super(context);
    this.ready = new Promise<void>((resolve: () => void): void => {
      this.attach = resolve;
    });

    this.register = register;
    this.unregister = unregister;
    this.unsubscribe = context.rnComponentContext.rnInstance.cppEventEmitter.subscribe(EVAL_RESULT, (payload: ESObject): void => {
      const response = payload as EvalResult;
      const pending = this.pending.get(response.requestId);
      if (pending === undefined) return;

      this.pending.delete(response.requestId);
      clearTimeout(pending.timer);

      pending.result.handlePromptConfirm(response.error === undefined ? (response.result ?? '') : JSON.stringify({ error: response.error }));
    });
  }

  setContentUpdater(update?: () => void): void {
    this.update = update;
  }

  commitProps(): void {
    this.update?.();
  }

  documentStartScript(): string {
    // The placeholder is inside upstream's native event template literal.
    // Interpolate this document's ID when the browser creates the listener.
    const install = INSTALL_GLOBALS_SCRIPT.split('"%%WEBVIEW_ID%%"').join('${webViewId}');

    // Completing the prompt asynchronously avoids a UI/Hermes sync-call deadlock.
    return `
      (function() {
      if (window !== window.top) return;
      const registration = window.prompt(${JSON.stringify(REGISTER_PROMPT)});
      if (registration === null) throw new Error('Expo DOM WebView registration was cancelled');
      const webViewId = Number(registration);
      if (!Number.isSafeInteger(webViewId) || webViewId < 0) throw new Error('Invalid Expo DOM WebView registration');
      window.ExpoDomWebViewBridge = { webViewId, eval: function(params) {
        var result = window.prompt(${JSON.stringify(EVAL_PROMPT_HEADER)} + params);
        if (result === null) throw new Error('Expo DOM WebView evaluation was cancelled');
        var parsed = JSON.parse(result);
        if (parsed.error !== undefined) throw new Error(parsed.error);
        return result;
      } };
      ${install}
      ${this.script ? `(function() { ${this.script}\n})();` : ''}
      })();
      true;
    `;
  }

  controllerAttached(): void {
    if (this.destroyed) return;

    this.attached = true;
    this.attach?.();
    this.attach = undefined;
    this.controller.onActive();
    this.loadSource();
  }

  loadSource(): void {
    if (!this.attached || this.destroyed) return;

    webview.WebviewController.setWebDebuggingAccess(this.debugging);
    if (this.source !== null && this.source !== this.controller.getUrl()) {
      this.controller.loadUrl(this.source);
    }
  }

  async injectJavaScript(script: string): Promise<void> {
    await this.ready;
    if (this.destroyed) return;
    if (!this.attached) throw new ExpoModuleError('ERR_WEBVIEW_NOT_READY', 'The WebView renderer exited before the controller attached.');

    await this.controller.runJavaScript(script);
  }

  async injectForDocument(id: number, script: string): Promise<void> {
    // runJavaScript may itself be queued across navigation by ArkWeb.
    await this.injectJavaScript(`if (window.ExpoDomWebViewBridge?.webViewId === ${id}) {\n${script}\n}`);
  }

  async scrollTo(params: Record<string, ESObject>): Promise<void> {
    const x = (params['x'] as number | undefined) ?? 0;
    const y = (params['y'] as number | undefined) ?? 0;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new ExpoModuleError('ERR_INVALID_ARGUMENT', 'scrollTo requires finite coordinates.');
    }

    await this.ready;
    if (this.destroyed) return;
    if (!this.attached) throw new ExpoModuleError('ERR_WEBVIEW_NOT_READY', 'The WebView renderer exited before the controller attached.');

    this.controller.scrollTo(x, y, params['animated'] !== false ? SCROLL_ANIMATION_DURATION_MS : 0);
  }

  dispatchMessage(message: string): void {
    if (this.destroyed || !this.attached) return;

    const payload: MessagePayload = { url: this.controller.getUrl(), title: this.controller.getTitle(), data: message };
    this.sendEvent('onMessage', payload);
  }

  handlePrompt(event: OnPromptEvent): boolean {
    if (this.destroyed) return false;

    if (event.message === REGISTER_PROMPT) {
      // onPageBegin can arrive after document-start scripts; replace the route here.
      this.retireDocument();
      this.document = nextId++;
      this.register(this.document, this);
      event.result.handlePromptConfirm(String(this.document));

      return true;
    }
    if (!event.message.startsWith(EVAL_PROMPT_HEADER)) return false;

    let request: string | undefined;
    try {
      if (this.document === undefined) throw new Error('The Expo DOM document is not registered.');

      const args = JSON.parse(event.message.slice(EVAL_PROMPT_HEADER.length)) as EvalParams;
      if (args === null || typeof args.source !== 'string' || !Number.isSafeInteger(args.deferredId) || args.deferredId < 0) {
        throw new Error('Invalid Expo DOM WebView evaluation parameters.');
      }

      const source = NATIVE_EVAL_WRAPPER_SCRIPT.split('"%%DEFERRED_ID%%"')
        .join(String(args.deferredId))
        .split('"%%WEBVIEW_ID%%"')
        .join(String(this.document))
        .split('"%%SOURCE%%"')
        .join(args.source);

      const id = `${this.id}:${this.sequence++}`;
      request = id;
      const timer = setTimeout((): void => {
        const pending = this.pending.get(id);
        if (pending === undefined) return;

        this.pending.delete(id);
        pending.result.handlePromptConfirm(JSON.stringify({ error: 'Expo DOM WebView runtime evaluation timed out.' }));
      }, EVAL_TIMEOUT_MS);
      this.pending.set(id, { result: event.result, timer });

      this.context.rnComponentContext.rnInstance.postMessageToCpp(EVAL_REQUEST, {
        requestId: id,
        source,
        runtimeEpoch: this.context.moduleContext.runtimeEpoch,
        tag: this.context.tag,
        componentName: this.context.componentName,
      });
    } catch (error) {
      if (request !== undefined) {
        const pending = this.pending.get(request);
        if (pending !== undefined) clearTimeout(pending.timer);
        this.pending.delete(request);
      }

      event.result.handlePromptConfirm(JSON.stringify({ error: String(error) }));
    }

    return true;
  }

  cancelPending(): void {
    const requests = this.pending;
    this.pending = new Map();

    requests.forEach((pending: PendingEval): void => {
      clearTimeout(pending.timer);
      // A navigation or ArkUI detach may already have invalidated JsResult.
      try {
        pending.result.handleCancel();
      } catch (_) {}
    });
  }

  retireDocument(): void {
    this.cancelPending();
    if (this.document !== undefined) this.unregister(this.document);
    this.document = undefined;
  }

  renderExited(): void {
    this.attach?.();
    this.attach = undefined;
    this.retireDocument();
  }

  destroy(): void {
    if (this.destroyed) return;

    this.destroyed = true;
    this.attach?.();
    this.attach = undefined;
    this.update = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.retireDocument();

    if (!this.attached) return;
    // The ArkUI node may already have detached before Expo's destroy callback.
    try {
      this.controller.deleteJavaScriptRegister(MESSAGE_BRIDGE_NAME);
    } catch (_) {}
    try {
      this.controller.stop();
    } catch (_) {}
    try {
      this.controller.onInactive();
    } catch (_) {}
    this.attached = false;
  }
}

class AfterRender extends FrameCallback {
  private callback?: () => void;

  constructor(callback: () => void) {
    super();
    this.callback = callback;
  }

  onIdle(): void {
    const callback = this.callback;
    this.callback = undefined;
    callback?.();
  }
}

@Component
struct DomWebViewContent {
  @ObjectLink view: DomWebView;
  @State scripts: ScriptItem[] = [];
  private revision: number = 0;

  aboutToAppear(): void {
    this.scripts = [{ script: this.view.documentStartScript(), scriptRules: ['*'] }];
    this.view.setContentUpdater((): void => {
      this.scripts = [{ script: this.view.documentStartScript(), scriptRules: ['*'] }];

      // Apply ArkUI's document-start scripts before starting a new navigation.
      const revision = ++this.revision;
      this.getUIContext().postFrameCallback(
        new AfterRender((): void => {
          if (this.revision === revision) this.view.loadSource();
        }),
      );
    });
  }

  aboutToDisappear(): void {
    this.revision += 1;
    this.view.setContentUpdater();
    this.view.destroy();
  }

  build(): void {
    Web({ src: '', controller: this.view.controller })
      .width('100%')
      .height('100%')
      .backgroundColor(Color.Transparent)
      .javaScriptAccess(true)
      .domStorageAccess(true)
      .fileAccess(true)
      .javaScriptProxy({
        object: this.view.bridge,
        name: MESSAGE_BRIDGE_NAME,
        methodList: ['postMessage'],
        controller: this.view.controller,
      })
      .javaScriptOnDocumentStart(this.scripts)
      .horizontalScrollBarAccess(this.view.horizontal)
      .verticalScrollBarAccess(this.view.vertical)
      .nestedScroll({
        scrollForward: this.view.nested ? NestedScrollMode.SELF_ONLY : NestedScrollMode.PARENT_FIRST,
        scrollBackward: this.view.nested ? NestedScrollMode.SELF_ONLY : NestedScrollMode.PARENT_FIRST,
      })
      .onControllerAttached((): void => this.view.controllerAttached())
      .onPrompt((event: OnPromptEvent): boolean => this.view.handlePrompt(event))
      .onRenderExited((): void => this.view.renderExited());
  }
}
@Builder
export function buildDomWebView(context: ExpoViewContentContext): void {
  DomWebViewContent({ view: context.nativeView as DomWebView });
}
