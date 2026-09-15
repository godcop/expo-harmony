export interface UpdatesStateChangeSubscription {
  remove(): void;
  getContext(): UpdatesNativeInterfaceStateContext | null;
}

export interface UpdatesStateChangeListener {
  updatesStateDidChange(event: Record<string, ESObject>): void;
}

export interface UpdatesInterface {
  readonly isEnabled: boolean;
  readonly runtimeVersion: string | null;
  readonly updateUrl: string | null;
  readonly launchedUpdateId: string | null;
  readonly embeddedUpdateId: string | null;
  readonly launchAssetPath: string | null;
  subscribeToUpdatesStateChanges(listener: UpdatesStateChangeListener): UpdatesStateChangeSubscription;
}

export interface UpdatesDevLauncherResult {
  manifest: Record<string, ESObject>;
  launchAssetPath: string;
}

export interface UpdatesDevLauncherCallback {
  onFailure(error: Error | null): void;
  onSuccess(update: UpdatesDevLauncherResult | null): void;
  onProgress(successful: number, failed: number, total: number): void;
  onManifestLoaded(manifest: Record<string, ESObject>): boolean;
}

export interface UpdatesInterfaceCallbacks {
  onRequestRelaunch(): void;
}

export interface UpdatesDevLauncherInterface extends UpdatesInterface {
  updatesInterfaceCallbacks?: UpdatesInterfaceCallbacks;
  reset(): void;
  fetchUpdateWithConfiguration(configuration: Record<string, ESObject>, callback: UpdatesDevLauncherCallback): void;
  isValidUpdatesConfiguration(configuration: Record<string, ESObject>): boolean;
}

export interface UpdatesNativeInterfaceStateContext {
  readonly isUpdateAvailable: boolean;
  readonly isUpdatePending: boolean;
  readonly isChecking: boolean;
  readonly isDownloading: boolean;
  readonly isRestarting: boolean;
  readonly restartCount: number;
  readonly latestManifest: Record<string, ESObject> | null;
  readonly downloadedManifest: Record<string, ESObject> | null;
  readonly rollback: UpdatesRollback | null;
  readonly checkError: Record<string, string> | null;
  readonly downloadError: Record<string, string> | null;
  readonly downloadProgress: number;
  readonly lastCheckForUpdateTime: Date | null;
  readonly sequenceNumber: number;
  readonly downloadStartTime: Date | null;
  readonly downloadFinishTime: Date | null;
}

export interface UpdatesRollback {
  readonly commitTime: Date;
}

export class UpdatesControllerRegistry {
  private static controllerRef?: WeakRef<UpdatesInterface>;

  static get controller(): UpdatesInterface | undefined {
    const controller = UpdatesControllerRegistry.controllerRef?.deref();
    if (!controller) UpdatesControllerRegistry.controllerRef = undefined;
    return controller;
  }

  static set controller(value: UpdatesInterface | undefined) {
    UpdatesControllerRegistry.controllerRef = value === undefined ? undefined : new WeakRef(value);
  }
}
