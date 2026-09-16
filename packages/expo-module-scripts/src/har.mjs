import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import JSON5 from 'json5';
import * as tar from 'tar';

const localDependency = /^(?:file:|link:|workspace:|\.{1,2}[\\/])|^(?:\/|[A-Za-z]:[\\/])/u;
const absoluteSourcePath = /(?:\/Users\/[^/]+\/|\/home\/[^/]+\/|[A-Za-z]:\\Users\\)/u;
const publicationDocuments = ['README.md', 'LICENSE', 'CHANGELOG.md'];

async function includePublicationDocuments(root, packageRoot) {
  for (const name of publicationDocuments) {
    // Keep documents already included by Hvigor, especially combined licenses.
    // A package-specific license takes precedence over harmony/LICENSE, which
    // may link to the workspace's shared license.
    const directories = name === 'LICENSE'
      ? ['harmony/library', '.', 'harmony']
      : ['harmony/library', 'harmony', '.'];
    const target = path.join(root, name);
    const candidates = [target, ...directories.map(directory => path.join(packageRoot, directory, name))];

    for (const file of candidates) {
      let content;
      try {
        content = await fs.promises.readFile(file, 'utf8');
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      if (!content.trim()) throw new Error(`HAR publication document is empty: ${file}`);

      // Materialize source symlinks as regular files inside the HAR.
      await fs.promises.rm(target, { force: true });
      await fs.promises.writeFile(target, content);
      break;
    }
    // Local modules may omit publication docs; release validation requires them.
  }
}

// Hvigor retains a relative OHPM dependency for a native library's type package.
// It is portable only when both the declaration package and binary are in this HAR.
function isBundledNativeTypeDependency(packageRoot, manifest, name, specifier) {
  if (path.basename(name) !== name || !name.endsWith('.so') || !manifest.nativeComponents?.some(component => component.name === name)) return false;
  const relative = specifier.replace(/^file:/u, '');
  if (!relative.startsWith('./')) return false;

  try {
    const root = fs.realpathSync(packageRoot);
    const typeRoot = fs.realpathSync(path.resolve(root, relative));
    const relation = path.relative(root, typeRoot);
    if (!relation || relation.startsWith(`..${path.sep}`) || relation === '..' || path.isAbsolute(relation)) return false;
    const types = JSON5.parse(fs.readFileSync(path.join(typeRoot, 'oh-package.json5'), 'utf8'));
    if (types.name !== name || typeof types.types !== 'string' || !types.types.endsWith('.d.ts')) return false;
    const declaration = fs.realpathSync(path.resolve(typeRoot, types.types));
    const declarationRelation = path.relative(typeRoot, declaration);
    if (declarationRelation.startsWith(`..${path.sep}`) || declarationRelation === '..' || path.isAbsolute(declarationRelation)) return false;
    if (!fs.statSync(declaration).isFile()) return false;
    const libs = path.join(root, 'libs');
    return fs.readdirSync(libs, { withFileTypes: true }).some((architecture) => {
      const binary = path.join(libs, architecture.name, name);
      return architecture.isDirectory() && fs.existsSync(binary) && fs.lstatSync(binary).isFile();
    });
  } catch {
    return false;
  }
}

export async function sanitizeHarmonyHar(file, { sourceManifest: source, workspaceVersions: versions = {}, packageRoot } = {}) {
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'expo-har-'));
  const output = path.join(temp, 'library.har');

  try {
    await tar.x({ cwd: temp, file, strict: true });

    const root = path.join(temp, 'package');
    const target = path.join(root, 'oh-package.json5');
    const manifest = JSON5.parse(await fs.promises.readFile(target, 'utf8'));

    for (const section of ['dependencies', 'devDependencies', 'dynamicDependencies']) {
      for (const [name, value] of Object.entries(manifest[section] || {})) {
        if (typeof value !== 'string' || !localDependency.test(value)) continue;
        if (isBundledNativeTypeDependency(root, manifest, name, value)) continue;

        // Hvigor can retain an override's local HAR path. Only rewrite known
        // workspace dependencies, preserving the authored publication range.
        if (Object.hasOwn(versions, name)) {
          const version = source?.[section]?.[name] || versions[name];
          if (typeof version === 'string' && !localDependency.test(version)) {
            manifest[section][name] = version;
            continue;
          }
        }

        throw new Error(`Cannot publish ${file}: ${section}.${name} must use a package version.`);
      }
    }

    await fs.promises.writeFile(target, `${JSON5.stringify(manifest, null, 2)}\n`);
    await fs.promises.rm(path.join(root, 'oh-package-lock.json5'), { force: true });
    if (packageRoot) await includePublicationDocuments(root, packageRoot);

    await tar.c({ cwd: temp, file: output, gzip: true, portable: true }, ['package']);
    await fs.promises.copyFile(output, file);
  } finally {
    await fs.promises.rm(temp, { recursive: true, force: true });
  }
}

export function assertPortableHarmonyHarSync(harPath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-har-check-'));
  try {
    tar.x({ cwd: tempRoot, file: harPath, strict: true, sync: true });

    const packageRoot = path.join(tempRoot, 'package');
    for (const name of ['oh-package.json5', ...publicationDocuments]) {
      const file = path.join(packageRoot, name);
      if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() || !fs.readFileSync(file, 'utf8').trim()) {
        throw new Error(`${harPath} must contain a non-empty regular file at package/${name}.`);
      }
    }
    for (const name of ['oh-package.json5', 'oh-package-lock.json5']) {
      const file = path.join(packageRoot, name);
      if (!fs.existsSync(file)) continue;

      const content = fs.readFileSync(file, 'utf8');
      if (absoluteSourcePath.test(content) || content.includes('file:/')) {
        throw new Error(`${harPath} leaks a local dependency path in package/${name}.`);
      }
      if (name === 'oh-package.json5') {
        const manifest = JSON5.parse(content);

        for (const section of ['dependencies', 'devDependencies', 'dynamicDependencies']) {
          for (const [dependency, version] of Object.entries(manifest[section] || {})) {
            if (typeof version === 'string' && localDependency.test(version)) {
              if (isBundledNativeTypeDependency(packageRoot, manifest, dependency, version)) continue;
              throw new Error(`${harPath} package/${name} ${section}.${dependency} must use a package version.`);
            }
          }
        }
      }
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}
