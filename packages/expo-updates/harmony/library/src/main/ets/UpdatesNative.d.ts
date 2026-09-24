declare module 'libexpo_updates.so' {
  export function applyPatch(base: string, output: string, patch: string): Promise<number>;
  export function crash(message: string): never;
}
