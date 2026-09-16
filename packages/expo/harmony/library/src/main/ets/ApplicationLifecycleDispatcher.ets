import { AbilityConstant, ApplicationStateChangeCallback, EnvironmentCallback } from '@kit.AbilityKit';
import type { Configuration, common } from '@kit.AbilityKit';
import { ExpoModuleError, ExpoAppLifecycleSubscriber, ExpoAppLifecycleSubscriberRegistration } from '@expo-harmony/expo-modules-core';

export function reportSubscriberFailure(id: string, callback: string, error: ESObject): void {
  console.error(`Expo lifecycle subscriber '${id}' failed in ${callback}: ${String(error)}`);
}

export function validateRegistrations(ids: string[]): void {
  const seen = new Set<string>();
  ids.forEach((id: string): void => {
    if (id.length === 0 || seen.has(id)) throw new Error(`Invalid or duplicate Expo lifecycle subscriber registration '${id}'.`);
    seen.add(id);
  });
}

class AppSubscriberEntry {
  readonly id: string;
  readonly subscriber: ExpoAppLifecycleSubscriber;

  constructor(id: string, subscriber: ExpoAppLifecycleSubscriber) {
    this.id = id;
    this.subscriber = subscriber;
  }
}

class AppEnvironmentCallback extends EnvironmentCallback {
  override onConfigurationUpdated(configuration: Configuration): void {
    ApplicationLifecycleDispatcher.dispatch('onConfigurationUpdate', (subscriber: ExpoAppLifecycleSubscriber): void =>
      subscriber.onConfigurationUpdate(configuration),
    );
  }

  override onMemoryLevel(level: AbilityConstant.MemoryLevel): void {
    ApplicationLifecycleDispatcher.dispatch('onMemoryLevel', (subscriber: ExpoAppLifecycleSubscriber): void => subscriber.onMemoryLevel(level));
  }
}

class AppStateCallback extends ApplicationStateChangeCallback {
  override onApplicationForeground(): void {
    ApplicationLifecycleDispatcher.dispatch('onForeground', (subscriber: ExpoAppLifecycleSubscriber): void => subscriber.onForeground());
  }

  override onApplicationBackground(): void {
    ApplicationLifecycleDispatcher.dispatch('onBackground', (subscriber: ExpoAppLifecycleSubscriber): void => subscriber.onBackground());
  }
}

export class ApplicationLifecycleDispatcher {
  private static context?: common.ApplicationContext;
  private static readonly registered: Set<string> = new Set<string>();
  private static readonly entries: AppSubscriberEntry[] = [];
  private static readonly environment: AppEnvironmentCallback = new AppEnvironmentCallback();
  private static readonly state: AppStateCallback = new AppStateCallback();

  static initialize(context: common.ApplicationContext, registrations: ExpoAppLifecycleSubscriberRegistration[]): void {
    if (ApplicationLifecycleDispatcher.context === undefined) {
      const id = context.on('environment', ApplicationLifecycleDispatcher.environment);

      try {
        context.on('applicationStateChange', ApplicationLifecycleDispatcher.state);
      } catch (error) {
        context.off('environment', id).catch((failure: Object): void => {
          reportSubscriberFailure('application', 'environment cleanup', failure);
        });
        throw new Error(`Unable to subscribe to native application lifecycle events: ${String(error)}`);
      }

      ApplicationLifecycleDispatcher.context = context;
    }

    for (const registration of registrations) {
      const id = registration.registrationId;
      if (ApplicationLifecycleDispatcher.registered.has(id)) continue;
      ApplicationLifecycleDispatcher.registered.add(id);
      let entry: AppSubscriberEntry | undefined;

      try {
        entry = new AppSubscriberEntry(id, registration.create(ApplicationLifecycleDispatcher.context as common.ApplicationContext));
        ApplicationLifecycleDispatcher.entries.push(entry);
        entry.subscriber.onCreate();
      } catch (error) {
        ApplicationLifecycleDispatcher.registered.delete(id);
        if (entry !== undefined) {
          const index = ApplicationLifecycleDispatcher.entries.indexOf(entry);
          if (index >= 0) ApplicationLifecycleDispatcher.entries.splice(index, 1);
        }
        throw new ExpoModuleError('ERR_APP_LIFECYCLE', `Unable to initialize application subscriber '${id}'.`, error as Object);
      }
    }
  }

  static dispatch(callback: string, body: (subscriber: ExpoAppLifecycleSubscriber) => void): void {
    ApplicationLifecycleDispatcher.entries.slice().forEach((entry: AppSubscriberEntry): void => {
      try {
        body(entry.subscriber);
      } catch (error) {
        reportSubscriberFailure(entry.id, callback, error);
      }
    });
  }
}
