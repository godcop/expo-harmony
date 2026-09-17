import type { SymbolViewProps as UpstreamSymbolViewProps } from 'expo-symbols';
import type { ViewProps } from 'react-native';

export type * from 'expo-symbols';

export type HarmonySymbolName = Exclude<UpstreamSymbolViewProps['name'], string> & {
  harmony?: string;
};

export type SymbolViewProps = Omit<UpstreamSymbolViewProps, 'name'> & {
  name: Extract<UpstreamSymbolViewProps['name'], string> | HarmonySymbolName;
};

export type NativeSymbolViewProps = ViewProps & {
  name: string;
  size: number;
  type: NonNullable<UpstreamSymbolViewProps['type']>;
  weight: NonNullable<Exclude<UpstreamSymbolViewProps['weight'], object>>;
  tint: number | null;
  colors: number[];
};
