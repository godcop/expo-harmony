import { requireNativeModule, requireNativeViewManager } from 'expo-modules-core';
import { processColor } from 'react-native';
import type { ColorValue } from 'react-native';

import type { NativeSymbolViewProps, SymbolViewProps } from './SymbolModule.types';

const native = requireNativeModule<{ isSymbolAvailable(name: string): boolean }>('SymbolModule');
const NativeView = requireNativeViewManager<NativeSymbolViewProps>('SymbolModule');

function colorValue(color: ColorValue | undefined): number | null {
  if (color === undefined) return null;

  const value = processColor(color);
  if (typeof value !== 'number') throw new TypeError('expo-symbols requires a valid HarmonyOS color.');

  return value;
}

export function SymbolView({
  name,
  fallback,
  size = 24,
  style,
  type = 'monochrome',
  weight = 'unspecified',
  tintColor,
  colors,
  scale: _scale,
  resizeMode: _resizeMode,
  animationSpec: _animationSpec,
  ...props
}: SymbolViewProps) {
  const symbol = typeof name === 'object' && name !== null ? name.harmony : undefined;
  if (!symbol || !native.isSymbolAvailable(symbol)) return <>{fallback}</>;

  if (!Number.isFinite(size) || size < 0) throw new RangeError('expo-symbols size must be a finite, non-negative number.');

  const palette = (colors === undefined ? [] : Array.isArray(colors) ? colors : [colors])
    .slice(0, 3)
    .map(color => colorValue(color))
    .filter((color): color is number => color !== null);
  const tint = colorValue(tintColor);

  return (
    <NativeView
      {...props}
      name={symbol}
      size={size}
      style={[{ width: size, height: size }, style]}
      type={type}
      weight={typeof weight === 'string' ? weight : 'unspecified'}
      tint={tint}
      colors={palette}
    />
  );
}
