// Shared asset library (production/assets/): SKU originals, approved installed-state images,
// material references. Jobs reference these by "library:<path under production/assets>"
// instead of copying the bytes into every job, so one asset has exactly one identity.

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

export const LIBRARY_PREFIX = 'library:';
const LIBRARY_ROOTS = ['products', 'material-references', 'characters', 'structure-references'];
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

const LIBRARY_CATEGORIES = [
  { id: 'characters', label: '角色定妆照', dir: 'characters' },
  { id: 'products', label: '产品参考图', dir: 'products' },
  { id: 'material-references', label: '材料参考图', dir: 'material-references' },
  { id: 'structure-references', label: '结构参考图', dir: 'structure-references' },
];
export const LIBRARY_CATEGORY_IDS = LIBRARY_CATEGORIES.map(category => category.id);

export function isImageFile(path) {
  return IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
}

// "seatbelt-shoulder-pad/pink-lulu-v1" -> ["seatbelt-shoulder-pad", "pink-lulu-v1"] (up to 2 levels:
// product category, then SKU/material/structure name), sanitizing each segment separately.
export function sanitizeGroupSegments(group) {
  return String(group || '')
    .split('/')
    .map(segment => segment.trim().replace(/[\\/]+/g, '-').slice(0, 60))
    .filter(Boolean)
    .slice(0, 2);
}

// Read-only listing for the "素材库" browser page: groups every image under production/assets/ by category.
export async function listLibraryAssets(jobsRoot) {
  const root = libraryRoot(jobsRoot);
  const categories = [];
  for (const category of LIBRARY_CATEGORIES) {
    const files = await walk(join(root, category.dir));
    const items = await Promise.all(files.map(async file => {
      const relPath = relative(root, file).split(sep).join('/');
      const info = await stat(file);
      const segments = relPath.split('/');
      return {
        ref: `${LIBRARY_PREFIX}${relPath}`,
        path: relPath,
        name: segments[segments.length - 1],
        group: segments.slice(1, -1).join('/') || null,
        bytes: info.size,
        updated_at: info.mtime.toISOString(),
      };
    }));
    items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    categories.push({ id: category.id, label: category.label, items });
  }
  return categories;
}

// Job-independent import for the workbenches (生图/视频工作台, 我的资产): writes straight into
// "<category>/[group/]<name>", same dedup-by-sha256 rule as promoteAssetToLibrary in
// job-actions.mjs, so trying a prompt in the workbench and saving the good result never needs a job.
export async function importLibraryAsset(jobsRoot, { category, group, name, mimeType, bytes }) {
  if (!LIBRARY_CATEGORY_IDS.includes(category)) throw new Error('素材分类无效');
  if (!bytes?.length) throw new Error('不能上传空文件');
  const safeName = basename(String(name || 'asset')).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 120);
  const ext = extname(safeName).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) throw new Error('只能收录图片素材');
  const actualMime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[ext];
  if (mimeType && mimeType !== 'application/octet-stream' && String(mimeType).toLowerCase() !== actualMime) throw new Error('文件类型和扩展名不匹配');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const existingRef = (await buildLibraryIndex(jobsRoot)).get(sha256);
  if (existingRef) return { ref: existingRef, path: existingRef.slice(LIBRARY_PREFIX.length), duplicate: true };
  const segments = [category, ...sanitizeGroupSegments(group), safeName || `asset${ext}`];
  const targetRelPath = segments.join('/');
  const target = join(libraryRoot(jobsRoot), ...segments);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  return { ref: `${LIBRARY_PREFIX}${targetRelPath}`, path: targetRelPath, duplicate: false };
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
