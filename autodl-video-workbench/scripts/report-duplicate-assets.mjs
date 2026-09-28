// Read-only report: which job asset files are byte-identical to a library asset or to each other,
// and what each would become as a "library:" reference. It NEVER deletes or rewrites anything;
// migration is a separate, human-approved step.
//
//   node scripts/report-duplicate-assets.mjs            # prints the report
//   node scripts/report-duplicate-assets.mjs --json     # machine-readable

import { readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLibraryIndex, sha256OfFile } from '../asset-library.mjs';

const jobsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'production', 'jobs');
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function walk(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full));
    else if (IMAGES.has(extname(entry.name).toLowerCase())) found.push(full);
  }
  return found;
}

const library = await buildLibraryIndex(jobsRoot);
const byHash = new Map();
for (const job of await readdir(jobsRoot, { withFileTypes: true })) {
  if (!job.isDirectory() || job.name.startsWith('_')) continue;
  for (const file of await walk(join(jobsRoot, job.name, 'assets'))) {
    const hash = await sha256OfFile(file);
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(relative(jobsRoot, file).split(sep).join('/'));
  }
}

const groups = [];
let reclaimable = 0;
for (const [hash, files] of byHash) {
  const libraryRef = library.get(hash) || null;
  if (files.length < 2 && !libraryRef) continue;
  const { size } = await import('node:fs/promises').then(fs => fs.stat(join(jobsRoot, files[0])));
  reclaimable += size * (libraryRef ? files.length : files.length - 1);
  groups.push({ sha256: hash.slice(0, 12), bytes: size, copies: files.length, library_ref: libraryRef, files });
}
groups.sort((a, b) => b.bytes * b.copies - a.bytes * a.copies);

if (process.argv.includes('--json')) { console.log(JSON.stringify({ reclaimable_bytes: reclaimable, groups }, null, 2)); process.exit(0); }
console.log(`重复素材组：${groups.length}，可回收约 ${(reclaimable / 1e6).toFixed(1)} MB（只读报告，未做任何改动）\n`);
for (const group of groups) {
  console.log(`● ${group.sha256}  ${(group.bytes / 1e6).toFixed(1)}MB × ${group.copies} 份  →  ${group.library_ref || '（库中没有：建议先入库再引用）'}`);
  group.files.forEach(file => console.log(`    ${file}`));
}
