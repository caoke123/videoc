// Replace job copies of library assets with "library:" references.
//
//   node scripts/migrate-duplicate-assets.mjs              # dry run: prints the plan, changes nothing
//   node scripts/migrate-duplicate-assets.mjs --apply      # do it
//   node scripts/migrate-duplicate-assets.mjs --rollback   # undo everything recorded in the manifest
//   node scripts/migrate-duplicate-assets.mjs --purge --yes  # permanently delete the quarantine
//
// Safety rules:
//  * Only assets/source/ and assets/approved/ copies whose sha256 equals a library asset are considered
//    (assets/generated/ is job-produced provenance and is left alone).
//  * A copy is migrated only if every text reference to it is in a rewritable JSON plan/manifest
//    (request-plan, shot-plan, brief, review, canvas-layout) or is purely historical text
//    (run-log, markdown, prompts). Any other reference (compositions, edit plans, ...) blocks it.
//  * Nothing is deleted: copies move to production/jobs/_migrated-duplicates/<job>/ and the JSON files
//    that were rewritten are backed up there first. --rollback restores both.

import { access, appendFile, copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLibraryIndex, resolveAssetRef, sha256OfFile } from '../asset-library.mjs';

const jobsRoot = process.env.WORKBENCH_JOBS_ROOT ? resolve(process.env.WORKBENCH_JOBS_ROOT) : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'production', 'jobs');
const quarantine = join(jobsRoot, '_migrated-duplicates');
const manifestPath = join(quarantine, 'manifest.json');
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const REWRITABLE = new Set(['request-plan.json', 'shot-plan.json', 'brief.json', 'review.json', 'canvas-layout.json']);
const HISTORICAL = file => /(^|\/)run-log\.jsonl$/.test(file) || /(^|\/)canvas-layout\.backup[^/]*\.json$/.test(file) || /\.md$/i.test(file) || /(^|\/)prompts\//.test(file) || /\.txt$/i.test(file);
const TEXT_EXTENSIONS = new Set(['.json', '.jsonl', '.md', '.txt', '.html', '.js', '.mjs', '.ts', '.py', '.css', '.yml', '.yaml', '.srt']);
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', 'renders']);

const args = new Set(process.argv.slice(2));
const posix = path => path.split(sep).join('/');
const exists = path => access(path).then(() => true).catch(() => false);
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function walk(directory, filter) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walk(full, filter));
    else if (filter(full)) found.push(full);
  }
  return found;
}

async function readManifest() { return JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"entries":[],"json_backups":[]}')); }
async function writeManifest(manifest) { await mkdir(quarantine, { recursive: true }); await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n'); }

// Exact, boundary-aware replacement of a relative path inside text (also covers ids like "asset:<path>").
function replacePath(text, from, to) {
  const pattern = new RegExp(`(?<![A-Za-z0-9_.\\-/])${escapeRegex(from)}(?![A-Za-z0-9_.\\-])`, 'g');
  return { text: text.replace(pattern, to), count: (text.match(pattern) || []).length };
}

async function plan() {
  const library = await buildLibraryIndex(jobsRoot);
  const items = [];
  for (const job of await readdir(jobsRoot, { withFileTypes: true })) {
    if (!job.isDirectory() || job.name.startsWith('_')) continue;
    const jobDir = join(jobsRoot, job.name);
    const runnerStyle = await exists(join(jobDir, 'request-plan.json'));
    const copies = await walk(join(jobDir, 'assets'), file => IMAGES.has(extname(file).toLowerCase()));
    const textFiles = await walk(jobDir, file => TEXT_EXTENSIONS.has(extname(file).toLowerCase()) && !relative(jobDir, file).startsWith(`assets${sep}`));
    const contents = new Map(await Promise.all(textFiles.map(async file => [posix(relative(jobDir, file)), await readFile(file, 'utf8').catch(() => '')])));
    for (const file of copies) {
      const relativePath = posix(relative(jobDir, file));
      if (!/^assets\/(source|approved)\//.test(relativePath)) continue;
      const hash = await sha256OfFile(file);
      const libraryRef = library.get(hash);
      if (!libraryRef) continue;
      const references = [];
      for (const [name, text] of contents) {
        const { count } = replacePath(text, relativePath, libraryRef);
        const backslash = text.includes(relativePath.replaceAll('/', '\\\\')) ? 1 : 0;
        if (count + backslash) references.push({ file: name, count: count + backslash, kind: REWRITABLE.has(name) && !backslash ? 'rewrite' : HISTORICAL(name) ? 'history' : 'blocking' });
      }
      const blockers = references.filter(item => item.kind === 'blocking');
      // Only jobs that run through the runner (request-plan.json) are migrated; finished legacy
      // DFCine jobs are left exactly as they are.
      const why = !runnerStyle ? '旧版（DFCine）任务，保持原样'
        : blockers.length ? `被不可改写的文件引用：${blockers.map(item => item.file).join('、')}`
        : !references.some(item => item.kind === 'rewrite') ? '没有任何计划文件引用它，迁移后任务里会凭空少一份素材'
        : null;
      items.push({ job: job.name, path: relativePath, sha256: hash, library_ref: libraryRef, references, action: why ? 'skip' : 'migrate', why, bytes: (await stat(file)).size });
    }
  }
  return items;
}

function printPlan(items) {
  const migrate = items.filter(item => item.action === 'migrate');
  console.log(`可迁移 ${migrate.length} 份（${(migrate.reduce((sum, item) => sum + item.bytes, 0) / 1e6).toFixed(1)} MB），保留 ${items.length - migrate.length} 份\n`);
  for (const item of items) {
    console.log(`${item.action === 'migrate' ? '✓ 迁移' : '· 保留'}  ${item.job}/${item.path}\n        → ${item.library_ref}${item.why ? `\n        原因：${item.why}` : ''}`);
    for (const reference of item.references) console.log(`        ${reference.kind === 'rewrite' ? '改写' : reference.kind === 'history' ? '历史文字(不改)' : '阻断'}：${reference.file}（${reference.count} 处）`);
  }
}

async function apply(items) {
  const manifest = await readManifest();
  const runId = new Date().toISOString();
  for (const item of items.filter(entry => entry.action === 'migrate')) {
    const jobDir = join(jobsRoot, item.job);
    const source = join(jobDir, item.path);
    if (await sha256OfFile(source) !== item.sha256) { console.log(`跳过（内容已变化）：${item.job}/${item.path}`); continue; }
    const libraryFile = resolveAssetRef(jobsRoot, jobDir, item.library_ref);
    if (!libraryFile || await sha256OfFile(libraryFile) !== item.sha256) { console.log(`跳过（库文件校验不一致）：${item.library_ref}`); continue; }

    const rewritten = [];
    for (const reference of item.references.filter(entry => entry.kind === 'rewrite')) {
      const target = join(jobDir, reference.file);
      const original = await readFile(target, 'utf8');
      const backup = join(quarantine, item.job, '__json-before', reference.file);
      if (!manifest.json_backups.some(entry => entry.job === item.job && entry.file === reference.file)) {
        await mkdir(dirname(backup), { recursive: true });
        await copyFile(target, backup);
        manifest.json_backups.push({ job: item.job, file: reference.file, backup: posix(relative(jobsRoot, backup)) });
      }
      await writeFile(target, replacePath(original, item.path, item.library_ref).text);
      JSON.parse(await readFile(target, 'utf8'));
      rewritten.push(reference.file);
    }

    const moved = join(quarantine, item.job, item.path);
    await mkdir(dirname(moved), { recursive: true });
    await rename(source, moved);
    manifest.entries.push({ run: runId, job: item.job, path: item.path, library_ref: item.library_ref, sha256: item.sha256, quarantined_as: posix(relative(jobsRoot, moved)), rewritten_files: rewritten });
    await appendFile(join(jobDir, 'run-log.jsonl'), JSON.stringify({ time: new Date().toISOString(), actor: 'system', type: 'asset_migrated', from: item.path, to: item.library_ref, sha256: item.sha256, rewritten_files: rewritten }) + '\n');
    console.log(`已迁移：${item.job}/${item.path} → ${item.library_ref}`);
  }
  await writeManifest(manifest);
}

async function rollback() {
  const manifest = await readManifest();
  for (const entry of [...manifest.entries].reverse()) {
    const from = join(jobsRoot, entry.quarantined_as);
    const to = join(jobsRoot, entry.job, entry.path);
    if (await exists(from)) { await mkdir(dirname(to), { recursive: true }); await rename(from, to); }
    else if (!(await exists(to))) console.log(`无法恢复（隔离区缺少文件）：${entry.job}/${entry.path}`);
    await appendFile(join(jobsRoot, entry.job, 'run-log.jsonl'), JSON.stringify({ time: new Date().toISOString(), actor: 'system', type: 'asset_migration_rolled_back', path: entry.path }) + '\n');
  }
  for (const backup of manifest.json_backups) await copyFile(join(jobsRoot, backup.backup), join(jobsRoot, backup.job, backup.file));
  await writeManifest({ entries: [], json_backups: [] });
  console.log(`已回滚 ${manifest.entries.length} 份素材和 ${manifest.json_backups.length} 个 JSON 文件`);
}

if (args.has('--rollback')) await rollback();
else if (args.has('--purge')) {
  if (!args.has('--yes')) { console.log('永久删除隔离区需要 --purge --yes；删除后无法回滚。'); process.exit(1); }
  await rm(quarantine, { recursive: true, force: true });
  console.log('已永久删除隔离区');
} else {
  const items = await plan();
  printPlan(items);
  if (args.has('--apply')) { console.log('\n—— 执行 ——'); await apply(items); }
  else console.log('\n（演练：未做任何改动。确认后加 --apply 执行）');
}
