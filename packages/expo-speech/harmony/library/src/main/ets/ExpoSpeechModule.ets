import { ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoModuleError, ExpoValueTypes } from '@expo-harmony/expo-modules-core';
import { util } from '@kit.ArkTS';
import { textToSpeech } from '@kit.CoreSpeechKit';
import { i18n } from '@kit.LocalizationKit';
import { SPEECH_OPTIONS, SpeechOptions } from './SpeechOptions';

const SPEAKING_STARTED = 'Exponent.speakingStarted';
const SPEAKING_BOUNDARY = 'Exponent.speakingWillSayNextString';
const SPEAKING_DONE = 'Exponent.speakingDone';
const SPEAKING_STOPPED = 'Exponent.speakingStopped';
const SPEAKING_ERROR = 'Exponent.speakingError';

const MAX_SPEECH_INPUT_LENGTH = 10000;
const OFFLINE_MODE = 1;
const PLAYBACK_COMPLETE = 1;
const INSTALLED_VOICE = 'INSTALLED';
const MIN_RATE_AND_PITCH = 0.5;
const MAX_RATE_AND_PITCH = 2;

interface Voice {
  identifier: string;
  name: string;
  language: string;
  quality: string;
}

class Utterance {
  readonly request: string = createRequestId();
  readonly id: string;
  readonly text: string;
  readonly options: SpeechOptions;
  started: boolean = false;

  constructor(id: string, text: string, options: SpeechOptions) {
    this.id = id;
    this.text = text;
    this.options = options;
  }
}

export class ExpoSpeechModule extends ExpoModule {
  private engine?: textToSpeech.TextToSpeechEngine;
  private voice?: string;
  private queue: Utterance[] = [];
  private current?: Utterance;
  private preparing?: Promise<void>;
  private destroyed: boolean = false;

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoSpeech')
      .constant('maxSpeechInputLength', MAX_SPEECH_INPUT_LENGTH)
      .events([SPEAKING_STARTED, SPEAKING_BOUNDARY, SPEAKING_DONE, SPEAKING_STOPPED, SPEAKING_ERROR])
      .asyncFunction(
        'speak',
        ExpoFunction.typed3(
          ExpoValueTypes.string(),
          ExpoValueTypes.string(),
          SPEECH_OPTIONS,
          async (id: string, text: string, options: SpeechOptions): Promise<void> => {
            this.assertActive();

            this.queue.push(new Utterance(id, text, options));
            this.startNext();
          },
        ),
      )
      .asyncFunction('getVoices', async (): Promise<Voice[]> => {
        const voices = await this.getNativeVoices();

        return voices.map(
          (voice: textToSpeech.VoiceInfo): Voice => ({
            identifier: voiceIdentifier(voice),
            name: voice.description || voiceIdentifier(voice),
            language: normalizeLanguage(voice.language),
            quality: 'Default',
          }),
        );
      })
      .asyncFunction('isSpeaking', async (): Promise<boolean> => {
        this.assertActive();

        return this.engine?.isBusy() ?? false;
      })
      .asyncFunction('stop', async (): Promise<void> => this.stop())
      .onPrepareForReload(async (): Promise<void> => {
        this.destroy();
        await this.preparing;
      })
      .onAbilityDestroy((): void => this.destroy())
      .onDestroy((): void => this.destroy());
  }

  private async getNativeVoices(): Promise<textToSpeech.VoiceInfo[]> {
    this.assertActive();
    if (!canIUse('SystemCapability.AI.TextToSpeech')) {
      throw new ExpoModuleError('ERR_SPEECH_UNAVAILABLE', 'This device does not support Core Speech Kit text-to-speech.');
    }

    const voices = await textToSpeech.listVoices({
      requestId: createRequestId(),
      online: OFFLINE_MODE,
    });

    this.assertActive();

    return voices.filter((voice: textToSpeech.VoiceInfo): boolean => voice.status === undefined || voice.status === INSTALLED_VOICE);
  }

  private startNext(): void {
    if (this.destroyed || this.current !== undefined || this.preparing !== undefined) return;

    const item = this.queue.shift();
    if (item === undefined) return;

    this.current = item;
    this.preparing = Promise.resolve()
      .then((): Promise<void> => this.prepare(item))
      .finally((): void => {
        this.preparing = undefined;
        this.startNext();
      });
  }

  private async prepare(item: Utterance): Promise<void> {
    try {
      if (!this.isCurrent(item.request)) return;
      validateUtterance(item);

      const voices = await this.getNativeVoices();

      if (!this.isCurrent(item.request)) return;

      const voice = selectVoice(voices, item.options);
      if (item.text.length === 0) {
        this.started(item.request);
        this.finish(item.request, SPEAKING_DONE);

        return;
      }

      const identifier = voiceIdentifier(voice);

      if (this.voice !== identifier) {
        this.releaseEngine();

        const engine = await textToSpeech.createEngine({
          language: voice.language,
          person: voice.person,
          online: OFFLINE_MODE,
          extraParams: { style: voice.style },
        });

        this.engine = engine;
        if (!this.isCurrent(item.request)) {
          this.releaseEngine();

          return;
        }

        engine.setListener({
          onStart: (request: string, _response: textToSpeech.StartResponse): void => this.started(request),
          onComplete: (request: string, response: textToSpeech.CompleteResponse): void => {
            if (response.type === PLAYBACK_COMPLETE) this.finish(request, SPEAKING_DONE);
          },
          onStop: (request: string, _response: textToSpeech.StopResponse): void => this.finish(request, SPEAKING_STOPPED),
          onError: (request: string, code: number, message: string): void => {
            this.finish(request, SPEAKING_ERROR, `${message} (${code})`);
          },
        });
        this.voice = identifier;
      }

      const options = item.options;

      this.engine!.speak(item.text, {
        requestId: item.request,
        extraParams: {
          speed: options.rate,
          pitch: options.pitch,
          volume: Math.min(1, Math.max(0, options.volume)),
          // Override the default zh-CN numeric pronunciation to match the selected voice.
          languageContext: normalizeLanguage(voice.language),
        },
      });
    } catch (error) {
      // Upstream JS wraps this event's error string in Error, so retain our code in its message.
      const message = error instanceof ExpoModuleError ? `${error.code}: ${error.message}` : String(error);

      this.finish(item.request, SPEAKING_ERROR, message);
    }
  }

  private started(request: string): void {
    if (!this.isCurrent(request) || this.current!.started) return;

    this.current!.started = true;
    this.publish(SPEAKING_STARTED, this.current!.id);
  }

  private finish(request: string, event: string, error?: string): void {
    if (!this.isCurrent(request)) return;

    const item = this.current!;
    this.current = undefined;
    this.publish(event, item.id, error);
    this.startNext();
  }

  private stop(): void {
    this.assertActive();

    const cancelled = this.queue;
    this.queue = [];
    if (this.current !== undefined) cancelled.unshift(this.current);
    this.current = undefined;

    try {
      try {
        this.engine?.stop();
      } finally {
        // A pending native stop must not cancel speech submitted after this call.
        this.releaseEngine();
      }
    } catch (error) {
      cancelled.forEach((item: Utterance): void => this.publish(SPEAKING_ERROR, item.id, String(error)));

      throw new ExpoModuleError('ERR_SPEECH_STOP', `Unable to stop speech: ${String(error)}`);
    }

    cancelled.forEach((item: Utterance): void => this.publish(SPEAKING_STOPPED, item.id));
  }

  private isCurrent(request: string): boolean {
    return !this.destroyed && this.context.isValid && this.current?.request === request;
  }

  private publish(event: string, id: string, error?: string): void {
    if (this.destroyed || !this.context.isValid) return;

    if (error === undefined) this.sendEvent(event, { id });
    else this.sendEvent(event, { id, error });
  }

  private releaseEngine(): void {
    // Keep the handle if shutdown fails so a later cleanup can retry it.
    this.voice = undefined;
    this.engine?.shutdown();
    this.engine = undefined;
  }

  private destroy(): void {
    this.destroyed = true;
    this.queue = [];
    this.current = undefined;

    try {
      try {
        this.engine?.stop();
      } finally {
        this.releaseEngine();
      }
    } catch (error) {
      console.warn(`ExpoSpeech: failed to stop or shut down the speech engine: ${String(error)}`);
    }
  }

  private assertActive(): void {
    if (this.destroyed || !this.context.isValid) {
      throw new ExpoModuleError('ERR_SPEECH_DESTROYED', 'The Expo Speech runtime has already been destroyed.');
    }
  }
}

function createRequestId(): string {
  // Core Speech Kit accepts letters/digits, but RFC 4122 UUIDs also contain hyphens.
  return util.generateRandomUUID().replace(/-/g, '');
}

function normalizeLanguage(language: string): string {
  return new Intl.Locale(language.replace(/_/g, '-')).baseName;
}

function voiceIdentifier(voice: textToSpeech.VoiceInfo): string {
  return JSON.stringify([normalizeLanguage(voice.language), voice.person, voice.style]);
}

function voiceForLanguage(voices: textToSpeech.VoiceInfo[], language: string): textToSpeech.VoiceInfo | undefined {
  let locale: Intl.Locale;
  try {
    locale = new Intl.Locale(language.replace(/_/g, '-'));
  } catch {
    return undefined;
  }

  return (
    voices.find((voice: textToSpeech.VoiceInfo): boolean => normalizeLanguage(voice.language) === locale.baseName) ??
    voices.find((voice: textToSpeech.VoiceInfo): boolean => new Intl.Locale(normalizeLanguage(voice.language)).language === locale.language)
  );
}

function selectVoice(voices: textToSpeech.VoiceInfo[], options: SpeechOptions): textToSpeech.VoiceInfo {
  if (options.voice !== undefined) {
    const voice = voices.find((candidate: textToSpeech.VoiceInfo): boolean => voiceIdentifier(candidate) === options.voice);
    if (voice !== undefined) return voice;

    throw new ExpoModuleError('ERR_SPEECH_INVALID_VOICE', `Voice '${options.voice}' is not installed on this device.`);
  }

  if (voices.length === 0) throw new ExpoModuleError('ERR_SPEECH_NO_VOICES', 'No installed offline speech voices are available.');

  const requested = options.language === undefined ? undefined : voiceForLanguage(voices, options.language);

  return requested ?? voiceForLanguage(voices, i18n.System.getSystemLanguage()) ?? voices[0];
}

function validateUtterance(item: Utterance): void {
  if (item.text.length > MAX_SPEECH_INPUT_LENGTH) {
    throw new ExpoModuleError('ERR_SPEECH_INPUT_IS_TOO_LONG', `Speech input text is too long! Limit of input length is: ${MAX_SPEECH_INPUT_LENGTH}`);
  }

  const options = item.options;

  if (!Number.isFinite(options.volume)) throw new ExpoModuleError('ERR_SPEECH_INVALID_OPTIONS', 'volume must be finite.');
  if (
    !Number.isFinite(options.rate) ||
    options.rate < MIN_RATE_AND_PITCH ||
    options.rate > MAX_RATE_AND_PITCH ||
    !Number.isFinite(options.pitch) ||
    options.pitch < MIN_RATE_AND_PITCH ||
    options.pitch > MAX_RATE_AND_PITCH
  ) {
    throw new ExpoModuleError(
      'ERR_SPEECH_INVALID_OPTIONS',
      `rate and pitch must be between ${MIN_RATE_AND_PITCH} and ${MAX_RATE_AND_PITCH} on HarmonyOS.`,
    );
  }
}
