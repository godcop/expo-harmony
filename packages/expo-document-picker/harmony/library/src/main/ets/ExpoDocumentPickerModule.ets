import { ExpoFunction, ExpoModule, ExpoModuleDefinition, ExpoModuleError, fileUriFromPath } from '@expo-harmony/expo-modules-core';
import { util } from '@kit.ArkTS';
import { BusinessError } from '@kit.BasicServicesKit';
import { fileIo, picker } from '@kit.CoreFileKit';
import { DOCUMENT_PICKER_OPTIONS, DocumentPickerOptions } from './DocumentPickerOptions';
import { filenameExtension, mimeTypeForName, suffixFilters } from './DocumentPickerTypes';

const MILLISECONDS_PER_SECOND: number = 1000;

interface DocumentPickerAsset {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  lastModified: number;
}

interface DocumentPickerResult {
  canceled: boolean;
  assets: DocumentPickerAsset[] | null;
}

export class ExpoDocumentPickerModule extends ExpoModule {
  private picking: boolean = false;
  private destroyed: boolean = false;

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('ExpoDocumentPicker')
      .asyncFunction(
        'getDocumentAsync',
        ExpoFunction.typed1(DOCUMENT_PICKER_OPTIONS, (options: DocumentPickerOptions): Promise<DocumentPickerResult> => this.pick(options)),
      )
      .onPrepareForReload(async (): Promise<void> => {
        this.destroyed = true;
      })
      .onDestroy((): void => {
        this.destroyed = true;
      });
  }

  private async pick(options: DocumentPickerOptions): Promise<DocumentPickerResult> {
    this.assertActive();
    if (this.picking) {
      throw new ExpoModuleError('ERR_PICKING_IN_PROGRESS', 'Different document picking in progress. Await other document picking first.');
    }
    if (options.type.length === 0) {
      throw new ExpoModuleError('ERR_DOCUMENT_PICKER_OPTIONS_EMPTY_LIST', "The 'type' argument must be a non-empty array.");
    }
    if (this.context.isHeadless) {
      throw new ExpoModuleError('ERR_DOCUMENT_PICKER_UNAVAILABLE', 'Document picking requires a UIAbility.');
    }

    this.picking = true;
    let directory: string | undefined;

    try {
      const selection = new picker.DocumentSelectOptions();
      if (!options.multiple) selection.maxSelectNumber = 1;
      selection.fileSuffixFilters = suffixFilters(options.type);

      let uris: string[];
      try {
        uris = await new picker.DocumentViewPicker(this.context.uiAbilityContext).select(selection);
      } catch (error) {
        this.assertActive();

        throw new ExpoModuleError('ERR_DOCUMENT_PICKER_FAILED', `HarmonyOS document selection failed: ${(error as BusinessError).message}`, error);
      }

      this.assertActive();
      if (uris.length === 0) return { canceled: true, assets: null };

      try {
        if (options.copyToCacheDirectory) {
          // mkdtemp requires six trailing Xs and reserves the directory atomically.
          directory = await fileIo.mkdtemp(`${this.context.cachePath}/DocumentPicker-XXXXXX`);
          this.assertActive();
        }

        const assets: DocumentPickerAsset[] = [];
        const selected = options.multiple ? uris : uris.slice(0, 1);
        for (const uri of selected) {
          assets.push(await this.readAsset(uri, directory));
          this.assertActive();
        }

        return { canceled: false, assets };
      } catch (error) {
        if (error instanceof ExpoModuleError) throw new ExpoModuleError(error.code, error.message, error.cause);

        throw new ExpoModuleError('ERR_FAILED_TO_READ_DOCUMENT', 'Failed to read the selected document.', error);
      }
    } catch (error) {
      if (directory !== undefined) {
        try {
          await fileIo.rmdir(directory);
        } catch (failure) {
          if (this.context.isValid) this.context.logger.warn(`Unable to remove document picker cache: ${(failure as BusinessError).message}`);
        }
      }

      if (error instanceof ExpoModuleError) throw new ExpoModuleError(error.code, error.message, error.cause);

      throw new ExpoModuleError('ERR_DOCUMENT_PICKER_FAILED', 'Unable to prepare the HarmonyOS document picker.', error);
    } finally {
      this.picking = false;
    }
  }

  private async readAsset(uri: string, directory?: string): Promise<DocumentPickerAsset> {
    this.assertActive();

    const file = await fileIo.open(uri, fileIo.OpenMode.READ_ONLY);

    try {
      this.assertActive();

      const stat = await fileIo.stat(file.fd);
      if (!stat.isFile()) throw new ExpoModuleError('ERR_FAILED_TO_READ_DOCUMENT', 'The selected document is not a regular file.');

      const name = file.name;
      if (name.length === 0 || /[/\0]/.test(name)) {
        throw new ExpoModuleError('ERR_FAILED_TO_READ_DOCUMENT', 'The selected document has an invalid filename.');
      }

      let modified = Date.now();
      try {
        const time = Math.trunc(stat.mtime * MILLISECONDS_PER_SECOND);
        if (Number.isSafeInteger(time)) modified = time;
      } catch (_) {}

      this.assertActive();

      let target = uri;
      if (directory !== undefined) {
        const path = `${directory}/${util.generateRandomUUID()}${filenameExtension(name)}`;

        await fileIo.copyFile(file.fd, path);
        target = fileUriFromPath(path);
      } else {
        this.context.grantFileAccess(file.path, false, false);
      }

      const asset: DocumentPickerAsset = { uri: target, name, lastModified: modified };
      try {
        const size = stat.size;
        if (Number.isSafeInteger(size) && size >= 0) asset.size = size;
      } catch (_) {}

      const mime = mimeTypeForName(name);
      if (mime !== undefined) asset.mimeType = mime;

      return asset;
    } finally {
      try {
        await fileIo.close(file.fd);
      } catch (error) {
        if (this.context.isValid) this.context.logger.warn(`Unable to close a picked document: ${(error as BusinessError).message}`);
      }
    }
  }

  private assertActive(): void {
    if (this.destroyed || !this.context.isValid) {
      throw new ExpoModuleError('ERR_DOCUMENT_PICKER_DESTROYED', 'The document picker runtime has been destroyed.');
    }
  }
}
