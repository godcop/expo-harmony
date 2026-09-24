export function isSafeFilename(filename: string): boolean {
  return filename.length > 0 && filename !== '.' && filename !== '..' && !/[/\\\0]/.test(filename);
}

export function isSafeAssetFilename(key: string | null, extension: string): boolean {
  return !/[/\\\0]/.test(extension) && (key === null || isSafeFilename(key + extension));
}

export function isAssetPath(directory: string, path: string): boolean {
  const prefix = directory + '/';
  return path.startsWith(prefix) && isSafeFilename(path.slice(prefix.length));
}
