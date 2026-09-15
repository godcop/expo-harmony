import type common from '@ohos.app.ability.common';

interface ContextMetadata {
  extensionAbilityInfo?: unknown;
  abilityInfo?: unknown;
}

export function adaptRnohExtensionContext(context: common.Context): () => void {
  const native = context as common.Context & ContextMetadata;
  if (native.abilityInfo !== undefined) return () => {};

  const descriptor = Object.getOwnPropertyDescriptor(native, 'abilityInfo');
  const metadata = native.extensionAbilityInfo;
  // RNOH 0.84.1 requires UIAbility metadata; retain the SDK's real ExtensionContext.
  native.abilityInfo = metadata;

  return () => {
    if (native.abilityInfo !== metadata) return;
    if (descriptor === undefined) delete native.abilityInfo;
    else Object.defineProperty(native, 'abilityInfo', descriptor);
  };
}
