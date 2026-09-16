export class RnohPackagerClient {
  private readonly client: ESObject = AppStorage.get('jsPackagerClient');

  isCurrent(): boolean {
    return this.client === AppStorage.get('jsPackagerClient');
  }

  restore(): void {
    if (this.client === undefined) AppStorage.delete('jsPackagerClient');
    else AppStorage.setOrCreate('jsPackagerClient', this.client);
  }

  destroy(release: () => void): void {
    const previous = new RnohPackagerClient();
    this.restore();
    try {
      release();
    } finally {
      // RNOH 0.84.1 destroys the global client instead of its coordinator's client.
      if (previous.client === this.client) AppStorage.delete('jsPackagerClient');
      else previous.restore();
    }
  }
}
