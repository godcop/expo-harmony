import { ExpoModuleContext, ExpoSharedObject } from '@expo-harmony/expo-modules-core';
import { ExpoFetchError } from './ExpoFetchError';
import { FetchInit } from './FetchTypes';
import { ExpoFetchRuntime } from './FetchRuntime';
import { NativeResponse } from './NativeResponse';
import { errorMessage } from './FetchUtils';

export class NativeRequest extends ExpoSharedObject {
  private readonly runtime: ExpoFetchRuntime;
  private readonly response: NativeResponse;
  private readonly id: string;
  private cancelled: boolean = false;

  constructor(context: ExpoModuleContext, runtime: ExpoFetchRuntime, response: NativeResponse) {
    super(context);
    this.runtime = runtime;
    this.response = response;
    this.id = runtime.allocateRequestId();
    response.attach(this.id);
  }

  async start(inputUrl: string, init: FetchInit, body: Uint8Array | null): Promise<void> {
    try {
      const result = await this.runtime.start(this.id, inputUrl, init, body);
      this.response.complete(result);
      this.response.watchCompletion();
    } catch (error) {
      this.response.watchCompletion();
      throw new ExpoFetchError(
        error instanceof ExpoFetchError ? error.code : 'ERR_FETCH_UNKNOWN',
        error instanceof ExpoFetchError ? error.message : errorMessage(error as Object),
        error instanceof ExpoFetchError ? error.cause : (error as Object),
      );
    }
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.runtime.cancel(this.id, new ExpoFetchError('ERR_FETCH_REQUEST_CANCELED', 'Fetch request has been canceled'));
  }
}
