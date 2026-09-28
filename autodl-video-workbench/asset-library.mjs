// Shared asset library (production/assets/): SKU originals, approved installed-state images,
// material references. Jobs reference these by "library:<path under production/assets>"
// instead of copying the bytes into every job, so one asset has exactly one identity.

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

export const LIBRARY_PREFIX = 'library:';
const LIBRARY_ROOTS = ['products', 'material-references', 'characters/approved'];
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const hashCache = new Map();

export const libraryRoot = jobsRoot => join(dirname(jobsRoot), 'assets');

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else if (IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) found.push(full);
  }
  return found;
}

export async function sha256OfFile(path) {
  const info = await stat(path);
  const key = `${path}:${info.size}:${info.mtimeMs}`;
  if (hashCache.has(key)) return hashCache.get(key);
  const hash = createHash('sha256').update(await readFile(path)).digest('hex');
  hashCache.set(key, hash);
  return hash;
}

// sha256 -> "library:products/<sku>/source/product-front.png"
export async function buildLibraryIndex(jobsRoot) {
  const root = libraryRoot(jobsRoot);
  const index = new Map();
  for (const sub of LIBRARY_ROOTS) {
    for (const file of await walk(join(root, sub))) {
      const hash = await sha256OfFile(file);
      const ref = `${LIBRARY_PREFIX}${relative(root, file).split(sep).join('/')}`;
      if (!index.has(hash)) index.set(hash, ref);
    }
  }
  return index;
}

// "library:..." or "assets/..." -> absolute path (null when the reference is malformed or escapes its root).
export function resolveAssetRef(jobsRoot, jobDir, ref) {
  if (typeof ref !== 'string' || ref.split(/[\\/]/).includes('..')) return null;
  if (ref.startsWith(LIBRARY_PREFIX)) {
    const root = libraryRoot(jobsRoot);
    const target = resolve(root, ref.slice(LIBRARY_PREFIX.length));
    return target.startsWith(root + sep) ? target : null;
  }
  if (ref.startsWith('assets/')) return resolve(jobDir, ref);
  return null;
}
