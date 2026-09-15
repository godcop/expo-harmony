import type { Want } from '@kit.AbilityKit';
import { copyWant } from './ExpoWant';

export class ExpoRuntimeSession {
  readonly initialWant: Want | undefined;
  private closed: boolean = false;
  private readonly cleanup: Set<() => void> = new Set<() => void>();

  constructor(initialWant: Want | null = null) {
    this.initialWant = initialWant === null ? undefined : copyWant(initialWant);
  }

  assertOpen(): void {
    if (this.closed) throw new Error('The Expo runtime session is closed.');
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  onClose(cleanup: () => void): () => void {
    this.assertOpen();
    this.cleanup.add(cleanup);

    return (): void => {
      this.cleanup.delete(cleanup);
    };
  }

  close(): void {
    if (this.closed) return;

    this.closed = true;
    this.cleanup.forEach((cleanup: () => void): void => {
      try {
        cleanup();
      } catch (error) {
        console.error(`Expo session cleanup failed: ${String(error)}`);
      }
    });

    this.cleanup.clear();
  }
}
