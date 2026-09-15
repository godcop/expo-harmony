import { installRnohBundleBarrier } from './RnohBundle';
import { observeRnohDestroy } from './RnohDestroyAdapter';
import { RNInstance, RNInstanceOptions, RNOHCoreContext } from '@rnoh/react-native-openharmony/ts';

interface Release {
  native: boolean;
  worker: boolean;
  finished: boolean;
  listeners: Set<() => void>;
}

export class RnohContextLifecycle {
  private static readonly contexts = new WeakMap<RNOHCoreContext, RnohContextLifecycle>();

  static install(core: RNOHCoreContext): RnohContextLifecycle {
    let lifetime = RnohContextLifecycle.contexts.get(core);
    if (lifetime === undefined) {
      lifetime = new RnohContextLifecycle(core);
      RnohContextLifecycle.contexts.set(core, lifetime);
    }
    return lifetime;
  }

  private readonly pending = new Set<Promise<RNInstance>>();
  private readonly workers = new Map<number, Promise<void>>();
  private readonly instances = new Map<number, RNInstance>();
  private readonly releases = new WeakMap<RNInstance, Release>();
  private closing = false;
  private destruction?: Promise<void>;

  private constructor(private readonly core: RNOHCoreContext) {
    const registry = core._rnohCoreContextDeps.rnInstanceRegistry as typeof core._rnohCoreContextDeps.rnInstanceRegistry & {
      destroyRNInstanceWorker(id: number): Promise<void>;
    };
    const destroy = registry.destroyRNInstanceWorker.bind(registry);
    // deleteInstance discards this Promise in RNOH 0.84.1; retain its worker ACK before closing the coordinator.
    registry.destroyRNInstanceWorker = (id: number): Promise<void> => {
      const instance = this.instances.get(id);
      const pending = destroy(id);
      this.workers.set(id, pending);
      pending.then(() => {
        if (this.workers.get(id) === pending) this.workers.delete(id);
        const release = instance === undefined ? undefined : this.releases.get(instance);
        if (release !== undefined && instance !== undefined) {
          release.worker = true;
          this.finish(instance, release);
        }
      }, () => {});

      return pending;
    };

    const create = core.createAndRegisterRNInstance.bind(core);
    const reload = core.reloadRNInstance.bind(core);
    core.createAndRegisterRNInstance = (options: RNInstanceOptions): Promise<RNInstance> => this.track(() => create(options));
    core.reloadRNInstance = (instance: RNInstance): Promise<RNInstance> => this.track(() => reload(instance));
  }

  private track(operation: () => Promise<RNInstance>): Promise<RNInstance> {
    if (this.closing) return Promise.reject(new Error('The RNOH context is being destroyed.'));

    const pending = Promise.resolve().then(operation).then(instance => {
      if (this.closing) throw new Error('The RNOH context was destroyed during instance creation.');

      installRnohBundleBarrier(instance);
      this.release(instance);

      return instance;
    });
    this.pending.add(pending);
    pending.then(() => this.pending.delete(pending), () => this.pending.delete(pending));

    return pending;
  }

  owns(instance: RNInstance): boolean {
    // RNOH 0.84.1 has no public instance ownership query.
    let registered = false;
    this.core._rnohCoreContextDeps.rnInstanceRegistry.forEach(candidate => {
      if (candidate === instance) registered = true;
    });
    return registered;
  }

  observeDestroy(instance: RNInstance, listener: () => void): () => void {
    const release = this.release(instance);
    if (release.finished) {
      listener();
      return (): void => {};
    }
    release.listeners.add(listener);

    return (): void => { release.listeners.delete(listener); };
  }

  private release(instance: RNInstance): Release {
    let release = this.releases.get(instance);
    if (release !== undefined) return release;

    release = { native: false, worker: false, finished: false, listeners: new Set() };
    this.releases.set(instance, release);
    this.instances.set(instance.getId(), instance);
    const current = release;
    observeRnohDestroy(instance, (): void => {
      current.native = true;
      this.finish(instance, current);
    });

    return release;
  }

  private finish(instance: RNInstance, release: Release): void {
    if (release.finished || !release.native || !release.worker) return;

    release.finished = true;
    if (this.instances.get(instance.getId()) === instance) this.instances.delete(instance.getId());
    for (const listener of Array.from(release.listeners)) {
      if (!release.listeners.has(listener)) continue;
      try { listener(); }
      catch (error) { console.error(`RNOH release subscriber failed: ${String(error)}`); }
    }
    release.listeners.clear();
  }

  async destroyInstance(instance: RNInstance): Promise<void> {
    await this.core.destroyAndUnregisterRNInstance(instance);
    await this.workers.get(instance.getId());
  }

  destroy(): Promise<void> {
    if (this.destruction === undefined) {
      this.closing = true;
      this.destruction = this.drain();
    }
    return this.destruction;
  }

  private async drain(): Promise<void> {
    await Promise.allSettled(Array.from(this.pending));

    const instances: RNInstance[] = [];
    // RNOH 0.84.1 exposes no instance enumeration or awaited coordinator destruction.
    this.core._rnohCoreContextDeps.rnInstanceRegistry.forEach(instance => instances.push(instance));
    const results = await Promise.allSettled(instances.map(instance => this.core.destroyAndUnregisterRNInstance(instance)));
    const workers = await Promise.allSettled(Array.from(this.workers.values()));
    for (const result of [...results, ...workers]) {
      if (result.status === 'rejected') throw new Error(`Unable to finish RNOH instance destruction: ${String(result.reason)}`);
    }
  }
}
