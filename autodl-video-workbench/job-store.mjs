// Phase 1 read-only job store: exposes production/jobs/*/ to the workbench UI.
// Deliberately tolerant of schema drift across jobs — one malformed/legacy job
// must never break the list or crash the detail endpoint for the others.
// See production/integrations/autodl-video-workbench-canvas-plan.md for the plan this implements.

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const STATUS_NORMALIZE = {
  success: 'success', succeeded: 'success', done: 'success',
  failed: 'failed', failure: 'failed', error: 'failed',
  submitted: 'running', queued: 'running', running: 'running',
  accepted: 'success', rejected: 'failed'
};

async function readJsonIfExists(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

async function readJsonlTail(path, limit = 50) {
  let raw;
  try { raw = await readFile(path, 'utf8'); } catch { return []; }
  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
  const tail = lines.slice(-limit);
  const entries = [];
  for (const line of tail) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'canvas_layout_edit' && (entry.before || entry.after)) {
        entry.nodes_before = entry.before?.nodes?.length ?? null;
        entry.nodes_after = entry.after?.nodes?.length ?? null;
        entry.connections_before = entry.before?.connections?.length ?? null;
        entry.connections_after = entry.after?.connections?.length ?? null;
        delete entry.before;
        delete entry.after;
      }
      entries.push(entry);
    } catch { /* skip malformed line, don't fail the whole read */ }
  }
  return entries;
}

export async function getJobRunLog(jobsRoot, jobId) {
  const jobDir = join(jobsRoot, jobId);
  const files = await listFileNames(jobDir);
  if (files.length === 0) return null;
  return readJsonlTail(join(jobDir, 'run-log.jsonl'), Number.MAX_SAFE_INTEGER);
}

async function listDirNames(path) {
  try { return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name); }
  catch { return []; }
}

async function listFileNames(path) {
  try { return (await readdir(path, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name); }
  catch { return []; }
}

async function listFilesRecursive(root, current = root) {
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && ['node_modules', '.git', '.next', '.cache', '.turbo', 'dist'].includes(entry.name)) continue;
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursive(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
  }
  return files;
}

async function findRunStateFile(jobDir, files) {
  // Different jobs name their aggregate run-state file differently
  // (run-state.json, tvc-run-state.json, <job-id>-run-state.json, ...).
  const candidate = files.find(name => name.endsWith('run-state.json'));
  if (!candidate) return null;
  return readJsonIfExists(join(jobDir, candidate));
}

function normalizeStatus(rawStatus) {
  if (!rawStatus || typeof rawStatus !== 'string') return null;
  return STATUS_NORMALIZE[rawStatus.toLowerCase()] || rawStatus.toLowerCase();
}

function statusFromRunState(runState, expectedShotCount) {
  const shotStatuses = Object.values(runState?.shots || {}).map(shot => normalizeStatus(shot?.status)).filter(Boolean);
  if (shotStatuses.length === 0) return normalizeStatus(runState?.status);
  if (shotStatuses.includes('running')) return 'running';
  if (shotStatuses.length < (expectedShotCount || shotStatuses.length)) return shotStatuses.length ? 'partial' : normalizeStatus(runState?.status);
  if (shotStatuses.length && shotStatuses.every(status => status === 'success')) return 'success';
  if (shotStatuses.length && shotStatuses.every(status => status === 'failed')) return 'failed';
  if (shotStatuses.length) return 'partial';
  return normalizeStatus(runState?.status);
}

async function deriveStatus(jobDir, files) {
  const runState = await findRunStateFile(jobDir, files);
  if (runState) {
    const status = statusFromRunState(runState);
    if (status && status !== 'preparing') return status;
  }
  const logCandidate = files.includes('run-log.jsonl') ? 'run-log.jsonl' : null;
  if (logCandidate) {
    const tail = await readJsonlTail(join(jobDir, logCandidate), 1);
    if (tail[0]?.status) return normalizeStatus(tail[0].status);
  }
  return null;
}

function inferFormatId(brief, shotPlan) {
  if (brief?.format_id) return brief.format_id;
  const shotCount = shotPlan?.shots?.length ?? null;
  if (shotCount == null) return null;
  return shotCount > 1 ? 'tvc-multi-shot' : 'ugc-single-shot';
}

async function latestMtime(jobDir, files, dirs) {
  const candidates = [...files, ...dirs];
  let latest = 0;
  for (const name of candidates) {
    try { const info = await stat(join(jobDir, name)); if (info.mtimeMs > latest) latest = info.mtimeMs; } catch { /* ignore */ }
  }
  return latest ? new Date(latest).toISOString() : null;
}

export async function listJobs(jobsRoot) {
  // Directories starting with "_" (e.g. _test) hold smoke/test jobs and stay out of the task history.
  const jobIds = (await listDirNames(jobsRoot)).filter(name => !name.startsWith('_'));
  const jobs = await Promise.all(jobIds.map(async jobId => {
    const jobDir = join(jobsRoot, jobId);
    const [files, dirs] = await Promise.all([listFileNames(jobDir), listDirNames(jobDir)]);
    const brief = files.includes('brief.json') ? await readJsonIfExists(join(jobDir, 'brief.json')) : null;
    const shotPlan = files.includes('shot-plan.json') ? await readJsonIfExists(join(jobDir, 'shot-plan.json')) : null;
    const runState = await findRunStateFile(jobDir, files);
    const status = runState ? statusFromRunState(runState, shotPlan?.shots?.length) : await deriveStatus(jobDir, files);
    return {
      job_id: jobId,
      title: brief?.creative_concept || brief?.goal || jobId,
      category_id: brief?.category_id ?? null,
      format_id: inferFormatId(brief, shotPlan),
      status,
      shot_count: shotPlan?.shots?.length ?? null,
      has_brief: Boolean(brief),
      has_shot_plan: Boolean(shotPlan),
      updated_at: await latestMtime(jobDir, files, dirs)
    };
  }));
  jobs.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  return jobs;
}

async function listAssetTree(jobDir) {
  const assetsRoot = join(jobDir, 'assets');
  const subdirs = await listDirNames(assetsRoot);
  const tree = {};
  for (const sub of subdirs) tree[sub] = await listFileNames(join(assetsRoot, sub));
  return tree;
}

async function listRenderTree(jobDir) {
  const rendersRoot = join(jobDir, 'renders');
  const subdirs = await listDirNames(rendersRoot);
  if (subdirs.length === 0) return { files: await listFileNames(rendersRoot) };
  const tree = {};
  for (const sub of subdirs) tree[sub] = await listFileNames(join(rendersRoot, sub));
  return tree;
}

export async function getJobDetail(jobsRoot, jobId) {
  const jobDir = join(jobsRoot, jobId);
  const [files, dirs] = await Promise.all([listFileNames(jobDir), listDirNames(jobDir)]);
  if (files.length === 0 && dirs.length === 0) return null;

  const brief = files.includes('brief.json') ? await readJsonIfExists(join(jobDir, 'brief.json')) : null;
  const shotPlan = files.includes('shot-plan.json') ? await readJsonIfExists(join(jobDir, 'shot-plan.json')) : null;
  // The literal prompt string sent to AutoDL lives here, not in shot-plan.json
  // (whose fields are editorial/narrative). See job-actions.mjs's same distinction.
  const requestPlan = files.includes('request-plan.json') ? await readJsonIfExists(join(jobDir, 'request-plan.json')) : null;
  const review = files.includes('review.json') ? await readJsonIfExists(join(jobDir, 'review.json')) : null;
  const runState = await findRunStateFile(jobDir, files);
  const runLogTail = files.includes('run-log.jsonl') ? await readJsonlTail(join(jobDir, 'run-log.jsonl'), 200) : [];
  const canvasLayout = files.includes('canvas-layout.json') ? await readJsonIfExists(join(jobDir, 'canvas-layout.json')) : null;
  const status = statusFromRunState(runState, shotPlan?.shots?.length || requestPlan?.shots?.length || (requestPlan?.request ? 1 : undefined)) || (runLogTail.length ? normalizeStatus(runLogTail[runLogTail.length - 1]?.status) : null);

  const projectFiles = await listFilesRecursive(jobDir);
  const systemFiles = new Set(['brief.json', 'shot-plan.json', 'request-plan.json', 'review.json', 'run-log.jsonl', 'canvas-layout.json']);
  // Library assets ("library:<path under production/assets>") live outside the job directory but are
  // still this job's inputs, so list the ones it references alongside its own files.
  const referenced = [
    ...(requestPlan?.shots || (requestPlan?.request ? [requestPlan.request] : [])).flatMap(shot => [...(shot.ref_images || []), ...(shot.ref_audio || [])]),
    ...(shotPlan?.shots || []).flatMap(shot => shot.references || [])
  ].filter(ref => typeof ref === 'string' && ref.startsWith('library:'));
  const assetFiles = [...projectFiles.filter(path => !systemFiles.has(path) && !path.endsWith('run-state.json')), ...new Set(referenced)];
  return {
    job_id: jobId,
    format_id: inferFormatId(brief, shotPlan),
    brief,
    shot_plan: shotPlan,
    request_plan: requestPlan,
    review,
    run_state: runState,
    run_log: runLogTail,
    canvas_layout: canvasLayout,
    status,
    assets: dirs.includes('assets') ? await listAssetTree(jobDir) : {},
    renders: dirs.includes('renders') ? await listRenderTree(jobDir) : {},
    asset_files: assetFiles,
    top_level_files: files,
    top_level_dirs: dirs
  };
}
