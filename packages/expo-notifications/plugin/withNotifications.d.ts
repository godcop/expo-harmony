import type { ConfigPlugin } from '@expo/config-plugins';
declare const withNotifications: ConfigPlugin<{
  defaultSlotType?: 'service' | 'social' | 'content' | 'other';
} | void>;
export = withNotifications;
