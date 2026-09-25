import { ExpoModuleContext, ExpoModuleError } from '@expo-harmony/expo-modules-core';
import { fileIo, fileUri } from '@kit.CoreFileKit';

export async function attachmentUri(value: string, context: ExpoModuleContext): Promise<string> {
  try {
    const path = context.filePathForRead(value);

    const file = await fileIo.open(path, fileIo.OpenMode.READ_ONLY | fileIo.OpenMode.NONBLOCK);

    try {
      context.assertFileAccess(file.path);

      if (!(await fileIo.stat(file.fd)).isFile()) {
        throw new Error('The attachment must be a regular file.');
      }

      // URI grants require the app authority, which file:/// URIs lack.
      return fileUri.getUriFromPath(file.path);
    } finally {
      try {
        await fileIo.close(file);
      } catch (error) {
        context.logger.warn(`Unable to close the mail attachment: ${(error as Error)?.message ?? String(error)}`);
      }
    }
  } catch (error) {
    throw new ExpoModuleError(
      'ERR_MAIL_COMPOSER_ATTACHMENT',
      `Unable to read the attachment: ${(error as Error)?.message ?? String(error)}`,
      error as Object,
    );
  }
}
