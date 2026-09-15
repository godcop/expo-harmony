import http from '@ohos.net.http';
import fs from '@ohos.file.fs';
import util from '@ohos.util';
import type common from '@ohos.app.ability.common';
import { applyPatch } from 'libexpo_updates.so';
import { ExpoUpdatesError, Headers, UpdateAsset, UpdateRecord, normalizeHeaders } from './UpdatesProtocol';
import { UpdatesStorage, decode, digest, encode, exists, hashFile, write } from './UpdatesStorage';

interface DownloadOptions {
  timeout?: number;
  base?: UpdateRecord;
  requested?: string;
  patch?: boolean;
  headers?: Headers;
}

export class UpdatesDownloader {
  constructor(private readonly storage: UpdatesStorage, private readonly context: common.ApplicationContext) {}

  async manifest(url: string, headers: Headers, timeout: number): Promise<{ status: number; headers: Headers; body: string }> {
    const request = http.createHttp();
    try {
      const result = await request.request(url, {
        method: http.RequestMethod.GET, header: headers, expectDataType: http.HttpDataType.ARRAY_BUFFER,
        usingCache: false, connectTimeout: timeout, readTimeout: timeout,
      });
      return { status: result.responseCode, headers: normalizeHeaders(result.header as Record<string, ESObject>),
        body: decode(new Uint8Array(result.result as ArrayBuffer)) };
    } finally {
      request.destroy();
    }
  }

  private async stream(url: string, headers: Headers, path: string, timeout: number, progress: (received: number, total: number) => void): Promise<{ status: number; headers: Headers }> {
    const request = http.createHttp();
    let file: fs.File | undefined;
    let response: Headers = {};

    try {
      file = fs.openSync(path, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      request.on('headersReceive', value => { response = normalizeHeaders(value as Record<string, ESObject>); });
      const completed = new Promise<void>((resolve, reject) => {
        request.on('dataReceive', bytes => {
          try { write(file!, bytes); }
          catch (error) {
            reject(new ExpoUpdatesError('ERR_UPDATES_ASSET', `Unable to write update asset: ${String(error)}`));
            request.destroy();
          }
        });
        request.on('dataEnd', resolve);
        request.on('dataReceiveProgress', value => progress(value.receiveSize, value.totalSize));
      });
      const requested = request.requestInStream(url, { method: http.RequestMethod.GET,
        header: headers, usingCache: false, connectTimeout: timeout, readTimeout: timeout });
      const [status] = await Promise.all([requested, completed]);
      if (status < 200 || status >= 300) throw new ExpoUpdatesError('ERR_UPDATES_ASSET', `Asset request returned HTTP ${status}.`);

      fs.fsyncSync(file.fd);

      return { status, headers: response };
    } finally {
      request.destroy();
      if (file) fs.closeSync(file);
    }
  }

  async asset(asset: UpdateAsset, headers: Headers, progress: (received: number, total: number) => void, options: DownloadOptions = {}): Promise<UpdateAsset> {
    const cached = await this.storage.asset(asset);
    if (cached?.path && exists(cached.path)) {
      const actual = hashFile(cached.path);
      if (actual === cached.digest && (!asset.hash || actual === asset.hash.replace(/=+$/, ''))) {
        return { ...asset, id: cached.id, path: cached.path, digest: actual };
      }
    }

    const name = asset.key === null ? util.generateRandomUUID() : digest(encode(asset.key));
    const path = this.storage.directory + '/' + name + asset.extension;
    const temporary = this.storage.directory + '/' + util.generateRandomUUID() + '.tmp';
    const patched = this.storage.directory + '/' + util.generateRandomUUID() + '.tmp';

    try {
      if (asset.embedded) {
        if (asset.embedded.startsWith('/') || asset.embedded.split('/').some(part => part === '..')) {
          throw new ExpoUpdatesError('ERR_UPDATES_ASSET', 'Invalid embedded asset path.');
        }

        const bytes = await this.context.resourceManager.getRawFileContent(asset.embedded);
        const file = fs.openSync(temporary, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);

        try { write(file, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); fs.fsyncSync(file.fd); }
        finally { fs.closeSync(file); }
        progress(bytes.byteLength, bytes.byteLength);
      } else {
        const extra = { ...asset.headers, ...headers, accept: '*/*', ...options.headers };
        const patch = asset.launch && options.patch === true && options.base !== undefined && options.requested !== undefined && options.base.id !== options.requested;
        if (patch) extra['a-im'] = 'bsdiff';
        else delete extra['a-im'];
        const response = await this.stream(asset.url, extra, temporary, options.timeout ?? 10000, progress);
        if (response.status === 226 || response.headers.im?.split(',').some(value => value.trim().toLowerCase() === 'bsdiff')) {
          try {
            const base = options.base?.assets.find(asset => asset.launch);
            if (!patch || !base?.path || !options.requested || options.requested === options.base?.id
              || response.headers['expo-base-update-id']?.toLowerCase() !== options.base?.id
              || !exists(base.path) || hashFile(base.path) !== base.digest) {
              throw new ExpoUpdatesError('ERR_UPDATES_PATCH', 'The patch response has no matching verified base update.');
            }
            if (await applyPatch(base.path, patched, temporary) !== 0) throw new ExpoUpdatesError('ERR_UPDATES_PATCH', 'Unable to apply BSDIFF update.');
            if (asset.hash && hashFile(patched) !== asset.hash.replace(/=+$/, '')) throw new ExpoUpdatesError('ERR_UPDATES_PATCH', 'Patched bundle failed SHA-256 verification.');

            fs.renameSync(patched, temporary);
            this.storage.logger.log(`Applied BSDIFF for asset ${asset.key}.`, 'None', 'info', options.requested, asset.key ?? undefined);
          } catch (error) {
            this.storage.logger.log(`Patch failed; downloading the complete asset: ${String(error)}`, 'AssetsFailedToLoad', 'warn', options.requested, asset.key ?? undefined);
            delete extra['a-im'];
            const fallback = await this.stream(asset.url, extra, temporary, options.timeout ?? 10000, progress);
            if (fallback.status === 226 || fallback.headers.im?.split(',').some(value => value.trim().toLowerCase() === 'bsdiff')) {
              throw new ExpoUpdatesError('ERR_UPDATES_PATCH', 'The full asset retry returned another patch.');
            }
          }
        }
      }

      const actual = hashFile(temporary);
      if (asset.hash && actual !== asset.hash.replace(/=+$/, '')) throw new ExpoUpdatesError('ERR_UPDATES_ASSET_HASH', `SHA-256 mismatch for asset ${asset.key}.`);

      fs.renameSync(temporary, path);
      const result: UpdateAsset = { ...asset, path, digest: actual };
      await this.storage.save(result);

      return result;
    } finally {
      for (const path of [temporary, patched]) if (exists(path)) fs.unlinkSync(path);
    }
  }
}
