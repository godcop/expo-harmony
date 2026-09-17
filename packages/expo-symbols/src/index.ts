import type { AndroidSymbol } from 'expo-symbols';
import type { ImageSourcePropType } from 'react-native';

export { SymbolView } from './SymbolView';
export type * from './SymbolModule.types';

export async function unstable_getMaterialSymbolSourceAsync(
  _symbol: AndroidSymbol | null,
  _size: number,
  _color: string
): Promise<ImageSourcePropType | null> {
  return null;
}
