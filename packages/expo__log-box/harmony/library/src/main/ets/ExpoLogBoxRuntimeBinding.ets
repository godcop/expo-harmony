import type { common } from '@kit.AbilityKit';
import type { ReactRuntimeBinding, ReactRuntimeContext } from '@expo-harmony/expo-modules-core';

import { expoLogBoxController } from './ExpoLogBoxController';

export class ExpoLogBoxRuntimeBinding implements ReactRuntimeBinding {
  constructor(_context: common.Context) {}

  bind(context: ReactRuntimeContext): () => void {
    return expoLogBoxController.bindRuntime(context);
  }
}
