import type { JSBundleProvider } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/JSBundleProvider';
import type { RNInstance, RNInstanceImpl } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/RNInstance';
import type { RNOHError } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/RNOHError';

/**
 * RNOH 0.84.1 flattens structured stacks in reportRNOHError and does not publish
 * the bundle URL until download succeeds. Observe those public boundaries before
 * information is lost; never parse RNOH's human-readable error context header.
 */
export class RnohLogBoxAdapter {
  private reporting?: RNOHError;
  private provider?: JSBundleProvider;
  private readonly restore: () => void;

  constructor(private readonly instance: RNInstance) {
    const reportable = instance as RNInstanceImpl;
    const report = reportable.reportRNOHError;
    if (typeof report !== 'function') throw new Error('Expo LogBox requires RNOH reportRNOHError support.');
    const run = instance.runJSBundle;
    const reportWrapper = (error: RNOHError): void => {
      const previous = this.reporting;
      this.reporting = error;
      try {
        report.call(instance, error);
      } finally {
        this.reporting = previous;
      }
    };
    const runWrapper = (provider: JSBundleProvider): Promise<void> => {
      this.provider = provider;
      return run.call(instance, provider);
    };
    reportable.reportRNOHError = reportWrapper;
    instance.runJSBundle = runWrapper;
    this.restore = () => {
      if (reportable.reportRNOHError === reportWrapper) reportable.reportRNOHError = report;
      if (instance.runJSBundle === runWrapper) instance.runJSBundle = run;
    };
  }

  originalError(fallback: RNOHError): RNOHError {
    return this.reporting ?? fallback;
  }

  bundleUrl(): string | undefined {
    return this.provider?.getURL() ?? this.instance.getInitialBundleUrl();
  }

  dispose(): void {
    this.restore();
    this.provider = undefined;
    this.reporting = undefined;
  }
}
