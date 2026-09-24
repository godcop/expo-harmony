export type NavigationBarButtonStyle = 'light' | 'dark';

export type NavigationBarVisibility = 'visible' | 'hidden';

/** @deprecated This will be removed in a future Expo release. */
export type NavigationBarBehavior = 'overlay-swipe' | 'inset-swipe' | 'inset-touch';

/** @deprecated This will be removed in a future Expo release. */
export type NavigationBarPosition = 'relative' | 'absolute';

export type NavigationBarVisibilityEvent = {
  visibility: NavigationBarVisibility;
  /** Harmony uses 2 for hidden and 0 for visible, not Android's full system UI bitmask. */
  rawVisibility: number;
};

export type NavigationBarStyle = 'auto' | 'inverted' | 'light' | 'dark';
