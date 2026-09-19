import type { RNInstanceOptions } from '@rnoh/react-native-openharmony/src/main/ets/RNOH/RNInstance';

// Keep opaque RNOH options (including application-supplied extensions) intact.
// Object spread belongs in TS; ArkTS rejects copying interface objects this way.
export function withDeveloperSupport(options: RNInstanceOptions, enabled: boolean): RNInstanceOptions {
  return { ...options, enableDebugger: enabled };
}
