import {
  ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoModuleError, ExpoValueTypes,
} from '@expo-harmony/expo-modules-core';
import { EmbeddedManifest, Manifest } from '@expo-harmony/expo-manifests';
import {
  parseDictionary, parseItem, parseList, serializeDictionary, serializeItem, serializeList,
} from '@expo-harmony/expo-structured-headers';
import {
  UpdatesControllerRegistry, UpdatesStateChangeSubscription,
} from '@expo-harmony/expo-updates-interface';
import { checkJSON, readJSON } from './JSONUtilsDemo';
import { checkImages, readImage } from './ImageLoaderDemo';

export class RuntimeDemoModule extends ExpoModule {
  private subscription?: UpdatesStateChangeSubscription;

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('RuntimeDemo')
      .events(['onUpdatesStateChange'])
      .asyncFunction('readImage', ExpoFunction.typed3(
        ExpoValueTypes.string(), ExpoValueTypes.boolean(), ExpoValueTypes.boolean(),
        (uri: string, editing: boolean, callback: boolean): Promise<string> => readImage(this.context, uri, editing, callback)))
      .asyncFunction('checkImages', (): Promise<string> => checkImages(this.context))
      .syncFunction('readJSON', ExpoFunction.typed4(
        ExpoValueTypes.string(), ExpoValueTypes.string(), ExpoValueTypes.string(), ExpoValueTypes.boolean(),
        (input: string, key: string, type: string, nullable: boolean): string => readJSON(input, key, type, nullable)))
      .syncFunction('checkJSON', (): string => checkJSON())
      .syncFunction('readManifest', ExpoFunction.typed1(ExpoValueTypes.string(), (input: string): string => {
        const manifest = Manifest.fromManifestJson(JSON.parse(input));

        return JSON.stringify({
          type: manifest instanceof EmbeddedManifest ? 'embedded' : 'remote',
          id: manifest.getID(),
          scope: manifest.getScopeKey(),
          project: manifest.getEASProjectID(),
          bundle: manifest.getBundleURL(),
          config: manifest.getExpoClientConfigRootObject(),
          commitTime: manifest instanceof EmbeddedManifest ? manifest.getCommitTimeLong() : null,
        });
      }))
      .syncFunction('serializeHeader', ExpoFunction.typed2(
        ExpoValueTypes.string(), ExpoValueTypes.string(), (format: string, input: string): string => {
          if (format === 'dictionary') return serializeDictionary(parseDictionary(input));
          if (format === 'list') return serializeList(parseList(input));
          if (format === 'item') return serializeItem(parseItem(input));

          throw new ExpoModuleError('ERR_DEMO_HEADER_FORMAT', 'Choose dictionary, list, or item.');
        }))
      .syncFunction('readUpdates', (): string => this.readUpdates())
      .onStartObserving((_event: string): void => {
        this.subscription?.remove();
        this.subscription = UpdatesControllerRegistry.controller?.subscribeToUpdatesStateChanges({
          updatesStateDidChange: (event: Record<string, ESObject>): void => {
            this.sendEvent('onUpdatesStateChange', { event: JSON.stringify(event) });
          },
        });
      })
      .onStopObserving((_event: string): void => this.stop())
      .onDestroy((): void => this.stop());
  }

  private readUpdates(): string {
    const controller = UpdatesControllerRegistry.controller;
    if (!controller) throw new ExpoModuleError('ERR_DEMO_UPDATES_UNAVAILABLE', 'No Updates controller is registered.');

    const subscription = controller.subscribeToUpdatesStateChanges({ updatesStateDidChange: (): void => {} });

    try {
      return JSON.stringify({
        isEnabled: controller.isEnabled,
        runtimeVersion: controller.runtimeVersion,
        updateUrl: controller.updateUrl,
        launchedUpdateId: controller.launchedUpdateId,
        embeddedUpdateId: controller.embeddedUpdateId,
        launchAssetPath: controller.launchAssetPath,
        context: subscription.getContext(),
      });
    } finally {
      subscription.remove();
    }
  }

  private stop(): void {
    this.subscription?.remove();
    this.subscription = undefined;
  }
}
