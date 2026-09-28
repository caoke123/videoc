// Phase 2 write path: human-in-the-loop prompt edits + manual AutoDL submission
// for a single shot, with every write appended to run-log.jsonl as an
// audit-trail entry. See production/integrations/autodl-video-workbench-canvas-plan.md.
//
// Scope: only jobs that have a request-plan.json (the AutoDL-direct path) support
// manual submit — that file holds the literal prompt string sent to AutoDL, unlike
// shot-plan.json's editorial/narrative fields. Jobs generated via DFCine/other
// workflows don't have request-plan.json and simply don't expose this action.

import { readFile, writeFile, rename, unlink, mkdir, readdir, appendFile, copyFile, stat, access } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { AwsClient } from 'aws4fetch';
import { buildLibraryIndex, resolveAssetRef } from './asset-library.mjs';

const SINGLE_SHOT_ID = 'MAIN';
const planLockTails = new Map();

// request-plan.json is edited from two entry points (manual canvas edits and Codex
// automation); serialize every read-modify-write on it so neither loses updates.
async function withPlanLock(jobDir, fn) {
  const key = join(jobDir, 'request-plan.json');
  const previous = planLockTails.get(key) || Promise.resolve();
  let release;
  const mine = new Promise(resolve => { release = resolve; });
  const chained = previous.then(() => mine);
  planLockTails.set(key, chained);
  await previous;
  try { return await fn(); }
  finally { release(); if (planLockTails.get(key) === chained) planLockTails.delete(key); }
}

// Windows briefly refuses rename/read (EPERM/EBUSY/EACCES) while another request has the same file open.
// Retrying keeps a transient error from being treated as "file missing" (which would bypass guards).
const TRANSIENT_FILE_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);
async function retryTransient(operation) {
  for (let attempt = 0; ; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (!TRANSIENT_FILE_ERRORS.has(error.code) || attempt >= 8) throw error;
      await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}
async function readJson(path) { return retryTransient(async () => JSON.parse(await readFile(path, 'utf8'))); }
async function readEnv(path) {
  const raw = await readFile(path, 'utf8').catch(() => '');
  return Object.fromEntries(raw.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    const index = line.indexOf('=');
    return index < 0 ? [line, ''] : [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
}
async function listFileNames(dir) {
  try { return (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name); }
  catch { return []; }
}

async function writeJsonAtomic(path, data) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
    await retryTransient(() => rename(tmp, path));
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

// Every event carries a timestamp, an actor and a type/status so run-log.jsonl stays machine-readable.
async function appendRunLog(jobDir, entry) {
  if (!entry || typeof entry !== 'object' || !(entry.type || entry.status)) throw new Error('run-log 事件必须包含 type 或 status');
  const line = JSON.stringify({ time: new Date().toISOString(), actor: 'system', ...entry }) + '\n';
  await appendFile(join(jobDir, 'run-log.jsonl'), line);
}

const autodlApiRoot = () => (process.env.AUTODL_API_BASE || 'https://autodl.art').replace(/\/+$/, '');

export async function createJob(jobsRoot, { title, categoryId, formatId }, { formats, categories }) {
  const format = formats.find(item => item.format_id === formatId);
  const category = categories.find(item => item.category_id === categoryId);
  if (!format) throw new Error('创意形式不存在');
  if (!category) throw new Error('产品类目不存在');
  const jobId = `${String(title || '创意任务').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48) || 'creative'}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8)}`;
  const jobDir = join(jobsRoot, jobId);
  const count = Number(format.node_count) || (format.format_id === 'ugc-single-shot' ? 1 : 3);
  const isStoryboard = format.media_type === 'image';
  const shotDuration = Number(format.shot_duration_seconds) || 3;
  const shots = Array.from({ length: count }, (_, index) => ({
    shot_id: isStoryboard ? `G${index + 1}` : `S${String(index + 1).padStart(2, '0')}`,
    ...(isStoryboard ? {} : { duration: shotDuration }),
    seed: Math.floor(Date.now() / 1000) + index,
    ref_images: [],
    prompt: ''
  }));
  await mkdir(join(jobDir, 'assets', 'source'), { recursive: true });
  await Promise.all([
    mkdir(join(jobDir, 'assets', 'approved'), { recursive: true }),
    mkdir(join(jobDir, 'assets', 'generated'), { recursive: true }),
    mkdir(join(jobDir, 'renders', 'preview'), { recursive: true }),
    mkdir(join(jobDir, 'renders', 'runs'), { recursive: true })
  ]);
  await Promise.all([
    writeJsonAtomic(join(jobDir, 'brief.json'), { schema_version: 2, job_id: jobId, creative_concept: String(title || '').trim() || '新创意任务', category_id: categoryId, format_id: formatId, pipeline_id: format.pipeline_id || 'standard-video-v1', created_at: new Date().toISOString(), review_policy: 'human_first' }),
    writeJsonAtomic(join(jobDir, 'shot-plan.json'), { job_id: jobId, format_id: formatId, shots: shots.map((shot, index) => ({ ...shot, ...(isStoryboard ? {} : { start_seconds: index * shotDuration, end_seconds: (index + 1) * shotDuration }), references: [], status: 'planned' })) }),
    writeJsonAtomic(join(jobDir, 'request-plan.json'), { job_id: jobId, media_type: format.media_type || 'video', workflow_id: format.workflow_id || null, ...(!isStoryboard ? { resolution: '768p竖(768*1376)', audio_reference: 'https://codewithgpu.ks3-cn-beijing.ksyuncs.com/comfyui_api/blank/blank.wav', ...(format.output || format.total_duration_seconds ? { output: { ...(format.output || {}), ...(format.total_duration_seconds ? { duration_seconds: Number(format.total_duration_seconds) } : {}) } } : {}) } : {}), shots }),
    writeJsonAtomic(join(jobDir, `${jobId}-run-state.json`), { status: 'PREPARING', shots: {}, updated_at: new Date().toISOString() }),
    writeJsonAtomic(join(jobDir, 'canvas-layout.json'), { nodes: [], connections: [] })
  ]);
  await appendRunLog(jobDir, { job_id: jobId, actor: 'user', type: 'job_created', category_id: categoryId, format_id: formatId, shot_count: count });
  return { job_id: jobId };
}

export async function saveCanvasLayout(jobsRoot, jobId, layout) {
  if (!Array.isArray(layout?.nodes) || !Array.isArray(layout?.connections)) throw new Error('画布结构无效');
  const jobDir = join(jobsRoot, jobId);
  if (!(await stat(jobDir).catch(() => null))?.isDirectory()) throw new Error('任务不存在');
  const path = join(jobDir, 'canvas-layout.json');
  const before = await readJson(path).catch(() => ({ nodes: [], connections: [] }));
  if (JSON.stringify(before) === JSON.stringify(layout)) return { changed: false };
  // Layout is presentation state, not an audit event: it lives only in canvas-layout.json.
  // (It used to be appended to run-log.jsonl on every drag and made up ~96% of some logs.)
  await writeJsonAtomic(path, layout);
  return { changed: true };
}

export async function uploadJobAsset(jobsRoot, jobId, fileName, mimeType, bytes, shotId) {
  const safeName = basename(String(fileName || 'asset')).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 120);
  const ext = extname(safeName).toLowerCase();
  const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov', '.wav', '.mp3', '.m4a', '.aac']);
  if (!allowed.has(ext)) throw new Error('仅支持图片、视频和音频资产');
  const actualMime = ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac' })[ext];
  if (!bytes?.length) throw new Error('不能上传空文件');
  if (mimeType && mimeType !== 'application/octet-stream' && String(mimeType).toLowerCase() !== actualMime && !(ext === '.mov' && mimeType === 'video/x-quicktime')) throw new Error('文件类型和扩展名不匹配');
  const jobDir = join(jobsRoot, jobId);
  if (!(await stat(jobDir).catch(() => null))?.isDirectory()) throw new Error('任务不存在');
  const requestPath = join(jobDir, 'request-plan.json');
  return withPlanLock(jobDir, async () => {
    let plan = null;
    let shot = null;
    if (shotId) {
      plan = await readJson(requestPath);
      shot = normalizePlan(plan).getShot(shotId);
      if (!shot) throw new Error(`Shot "${shotId}" not found in request-plan.json`);
    }
    // Identity is the content hash: an asset already in the library is referenced, and the same
    // bytes uploaded twice to one job land on the same file (no timestamp-named duplicates).
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const libraryRef = (await buildLibraryIndex(jobsRoot)).get(sha256);
    const assetPath = libraryRef || `assets/source/${sha256.slice(0, 12)}-${safeName || `asset${ext}`}`;
    if (!libraryRef) {
      await mkdir(join(jobDir, 'assets', 'source'), { recursive: true });
      await writeFile(join(jobDir, assetPath), bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    }
    if (shot) {
      if (!(shot.ref_images || []).includes(assetPath)) shot.ref_images = [...(shot.ref_images || []), assetPath];
      await writeJsonAtomic(requestPath, plan);
      const shotPlanPath = join(jobDir, 'shot-plan.json');
      const shotPlan = await readJson(shotPlanPath).catch(() => null);
      const plannedShot = shotPlan?.shots?.find(item => item.shot_id === shotId);
      if (plannedShot) {
        if (!(plannedShot.references || []).includes(assetPath)) plannedShot.references = [...(plannedShot.references || []), assetPath];
        await writeJsonAtomic(shotPlanPath, shotPlan);
      }
    }
    await appendRunLog(jobDir, { job_id: jobId, actor: 'user', type: 'asset_import', asset_path: assetPath, shot_id: shotId || null, mime_type: actualMime, bytes: bytes.length });
    return { asset_path: assetPath, shot_id: shotId || null };
  });
}

// Normalizes both request-plan.json shapes (single flat `request`, or `shots[]`)
// into one view so the rest of this module doesn't care which shape a job uses.
function normalizePlan(plan) {
  if (Array.isArray(plan.shots)) {
    return {
      shape: 'multi',
      workflowId: plan.workflow_id,
      resolution: plan.resolution,
      audioReference: plan.audio_reference,
      audioReferences: shot => Array.isArray(shot.ref_audio_urls) ? shot.ref_audio_urls : [],
      getShot: shotId => plan.shots.find(shot => shot.shot_id === shotId),
      setShotPrompt: (shotId, prompt) => { const shot = plan.shots.find(s => s.shot_id === shotId); if (shot) shot.prompt = prompt; }
    };
  }
  return {
    shape: 'single',
    workflowId: plan.workflow_id,
    resolution: plan.request?.resolution,
    audioReference: plan.request?.ref_audio_0,
    audioReferences: () => [],
    getShot: shotId => (shotId === SINGLE_SHOT_ID ? { shot_id: SINGLE_SHOT_ID, duration: plan.request?.duration, seed: plan.request?.seed, ref_images: plan.request?.ref_images, prompt: plan.request?.prompt } : null),
    setShotPrompt: (shotId, prompt) => { if (shotId === SINGLE_SHOT_ID && plan.request) plan.request.prompt = prompt; }
  };
}

async function asDataUri(path) {
  const ext = extname(path).toLowerCase();
  const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

function audioContentType(path) {
  return ({ '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac' })[extname(path).toLowerCase()] || 'application/octet-stream';
}

async function mediaStoreConfig(jobsRoot) {
  const repoRoot = dirname(dirname(jobsRoot));
  const config = await readEnv(join(repoRoot, 'production', 'config', 'media-store.env'));
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_R2_BUCKET', 'MEDIA_PUBLIC_BASE_URL', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  const missing = required.filter(key => !config[key]);
  if (missing.length) throw new Error(`媒体存储未配置：${missing.join('、')}`);
  if (config.MEDIA_STORE_PROVIDER !== 'cloudflare-r2') throw new Error('当前仅支持 Cloudflare R2 媒体存储');
  if (!/^https:\/\//.test(config.MEDIA_PUBLIC_BASE_URL)) throw new Error('MEDIA_PUBLIC_BASE_URL 必须为 HTTPS 地址');
  return config;
}

export async function publishShotAudio(jobsRoot, jobId, shotId) {
  const jobDir = join(jobsRoot, jobId);
  const planPath = join(jobDir, 'request-plan.json');
  const plan = await readJson(planPath).catch(() => { throw new Error('该任务没有 request-plan.json，无法发布配音'); });
  const normalized = normalizePlan(plan);
  const shot = normalized.getShot(shotId);
  if (!shot) throw new Error(`Shot "${shotId}" not found in request-plan.json`);
  if (!Array.isArray(shot.ref_audio) || !shot.ref_audio.length) throw new Error('该镜头没有本地配音文件');
  const config = await mediaStoreConfig(jobsRoot);
  const urls = [];
  for (const relativePath of shot.ref_audio.slice(0, 3)) {
    if (typeof relativePath !== 'string' || !relativePath.startsWith('audio/') || relativePath.split(/[\\/]/).includes('..')) throw new Error(`配音路径无效：${String(relativePath)}`);
    const sourcePath = join(jobDir, relativePath);
    const audio = await readFile(sourcePath).catch(() => { throw new Error(`找不到配音文件：${relativePath}`); });
    if (!audio.length) throw new Error(`配音文件为空：${relativePath}`);
    const objectKey = `audio/${jobId}/${Date.now()}-${basename(relativePath).normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-')}`;
    const endpoint = config.R2_ENDPOINT || `https://${config.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const client = new AwsClient({ accessKeyId: config.R2_ACCESS_KEY_ID, secretAccessKey: config.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' });
    const response = await client.fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(config.CLOUDFLARE_R2_BUCKET)}/${objectKey.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { 'Content-Type': audioContentType(relativePath) },
      body: audio
    });
    const body = await response.text().catch(() => '');
    if (!response.ok) throw new Error(body || `R2 上传失败（HTTP ${response.status}）`);
    urls.push(`${config.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/${objectKey.split('/').map(encodeURIComponent).join('/')}`);
  }
  // Re-read under the lock: the R2 uploads above can take seconds, and other edits may have landed meanwhile.
  await withPlanLock(jobDir, async () => {
    const fresh = await readJson(planPath);
    const freshShot = normalizePlan(fresh).getShot(shotId);
    if (!freshShot) throw new Error(`Shot "${shotId}" not found in request-plan.json`);
    freshShot.ref_audio_urls = urls;
    const shotsNeedingAudio = Array.isArray(fresh.shots) ? fresh.shots.filter(item => Array.isArray(item.ref_audio) && item.ref_audio.length) : [freshShot];
    fresh.preparation_status = shotsNeedingAudio.every(item => Array.isArray(item.ref_audio_urls) && item.ref_audio_urls.length) ? 'ready_for_submission' : 'audio_url_pending';
    await writeJsonAtomic(planPath, fresh);
  });
  await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, actor: 'user', type: 'audio_published', ref_audio: shot.ref_audio, ref_audio_urls: urls });
  return { urls };
}

const EDITABLE_FIELDS = new Set(['prompt']);
const submittingShots = new Set();
const stateWriteTails = new Map();

export async function patchShotField(jobsRoot, jobId, shotId, field, value) {
  if (!EDITABLE_FIELDS.has(field)) throw new Error(`Field "${field}" is not editable`);
  if (typeof value !== 'string') throw new Error('提示词必须是文本');
  const jobDir = join(jobsRoot, jobId);
  const planPath = join(jobDir, 'request-plan.json');
  return withPlanLock(jobDir, async () => {
    const plan = await readJson(planPath).catch(() => { throw new Error('该任务没有 request-plan.json，不支持人工编辑提示词'); });
    const normalized = normalizePlan(plan);
    const shot = normalized.getShot(shotId);
    if (!shot) throw new Error(`Shot "${shotId}" not found in request-plan.json`);
    const before = shot[field];
    if (before === value) return { changed: false, shot };
    normalized.setShotPrompt(shotId, value);
    await writeJsonAtomic(planPath, plan);
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, actor: 'user', type: 'prompt_edit', field, before, after: value });
    return { changed: true, shot: normalized.getShot(shotId) };
  });
}

async function currentShotRunState(jobDir, files, shotId, shape) {
  const stateFileName = files.find(name => name.endsWith('run-state.json'));
  if (!stateFileName) return null;
  const state = await readJson(join(jobDir, stateFileName)).catch(() => null);
  if (!state) return null;
  return shape === 'multi' ? state.shots?.[shotId] || null : state;
}

async function writeShotRunState(jobDir, files, shotId, shape, patch) {
  const stateFileName = files.find(name => name.endsWith('run-state.json')) || 'autodl-run-state.json';
  const statePath = join(jobDir, stateFileName);
  const previous = stateWriteTails.get(statePath) || Promise.resolve();
  let release;
  const tail = new Promise(resolve => { release = resolve; });
  stateWriteTails.set(statePath, tail);
  await previous;
  try {
    const existing = await readJson(statePath).catch(() => (shape === 'multi' ? { shots: {} } : {}));
    const now = new Date().toISOString();
    if (shape === 'multi') {
      existing.shots = existing.shots || {};
      existing.shots[shotId] = { ...existing.shots[shotId], ...patch };
      existing.updated_at = now;
    } else {
      Object.assign(existing, patch, { updated_at: now });
    }
    await writeJsonAtomic(statePath, existing);
  } finally {
    release();
    if (stateWriteTails.get(statePath) === tail) stateWriteTails.delete(statePath);
  }
}

export async function preflightBatchSubmission(jobsRoot, jobId, { token }) {
  if (!token) throw new Error('缺少 AUTODL_COMFYUI_TOKEN');
  const jobDir = join(jobsRoot, jobId);
  const plan = await readJson(join(jobDir, 'request-plan.json'));
  if (plan.media_type && plan.media_type !== 'video') throw new Error('当前任务不是视频生成任务');
  if (!Array.isArray(plan.shots) || !plan.shots.length) throw new Error('批量提交需要多镜头 request-plan.json');
  const normalized = normalizePlan(plan);
  if (!normalized.workflowId || !normalized.resolution) throw new Error('工作流或分辨率未配置');
  const files = await listFileNames(jobDir);
  const stateFileName = files.find(name => name.endsWith('run-state.json'));
  const state = stateFileName ? await readJson(join(jobDir, stateFileName)).catch(() => ({})) : {};
  const isFreshShot = shot => {
    const run = state.shots?.[shot.shot_id];
    return !run || (!run.task_id && !run.submitted_at && !run.output_file && ['PLANNED', 'PREPARING'].includes(run.status || 'PLANNED'));
  };
  const pending = plan.shots.filter(isFreshShot);
  if (!pending.length) throw new Error('所有镜头已有任务编号；批量提交不会重复生成');
  const errors = [];
  for (const shot of pending) {
    if (!shot.shot_id || !String(shot.prompt || '').trim()) errors.push(`${shot.shot_id || '未知镜头'}：缺少提示词`);
    if (!Number.isFinite(Number(shot.duration)) || Number(shot.duration) <= 0) errors.push(`${shot.shot_id || '未知镜头'}：时长无效`);
    if (!Array.isArray(shot.ref_images) || !shot.ref_images.length) errors.push(`${shot.shot_id || '未知镜头'}：缺少参考图`);
    for (const relative of shot.ref_images || []) {
      const target = resolveAssetRef(jobsRoot, jobDir, relative);
      if (!target || !(await access(target).then(() => true).catch(() => false))) {
        errors.push(`${shot.shot_id || '未知镜头'}：参考图不可用 ${String(relative)}`);
      }
    }
    const localAudio = Array.isArray(shot.ref_audio) && shot.ref_audio.length > 0;
    const audioUrls = normalized.audioReferences(shot);
    if (localAudio && !audioUrls.length) errors.push(`${shot.shot_id || '未知镜头'}：配音未发布为 AutoDL 可访问 URL`);
    if (audioUrls.some(url => typeof url !== 'string' || !/^https:\/\//.test(url))) errors.push(`${shot.shot_id || '未知镜头'}：配音 URL 无效`);
  }
  if (errors.length) throw new Error(errors.join('；'));
  return { shotIds: pending.map(shot => shot.shot_id), skipped: plan.shots.filter(shot => !isFreshShot(shot)).map(shot => shot.shot_id) };
}

export async function submitShot(jobsRoot, jobId, shotId, { token, reason }) {
  const lockKey = `${jobId}:${shotId}`;
  if (submittingShots.has(lockKey)) throw new Error(`镜头 ${shotId} 正在提交，禁止重复提交`);
  submittingShots.add(lockKey);
  try {
  const jobDir = join(jobsRoot, jobId);
  const planPath = join(jobDir, 'request-plan.json');
  const plan = await readJson(planPath).catch(() => { throw new Error('该任务没有 request-plan.json，不支持人工触发生成'); });
  if (plan.media_type && plan.media_type !== 'video') throw new Error('当前创意形式尚未配置 AutoDL 视频工作流');
  const normalized = normalizePlan(plan);
  const shot = normalized.getShot(shotId);
  if (!shot) throw new Error(`Shot "${shotId}" not found in request-plan.json`);
  if (!shot.prompt) throw new Error('该镜头没有 prompt，无法提交');
  if (!token) throw new Error('缺少 AUTODL_COMFYUI_TOKEN（必须是 AutoDL 的 ComfyUI 分组 Token）');
  const localAudio = Array.isArray(shot.ref_audio) && shot.ref_audio.length > 0;
  const audioUrls = normalized.audioReferences(shot);
  if (localAudio && !audioUrls.length) throw new Error('配音未发布为 AutoDL 可访问 URL，暂不能提交');
  if (audioUrls.some(url => typeof url !== 'string' || !/^https:\/\//.test(url))) throw new Error('配音 URL 无效，暂不能提交');

  const files = await listFileNames(jobDir);
  const currentState = await currentShotRunState(jobDir, files, shotId, normalized.shape);
  if (['SUBMITTING', 'NEEDS_ATTENTION'].includes(currentState?.status)) {
    throw new Error(`镜头 ${shotId} 上次提交没有得到 AutoDL 确认，任务可能已在远端创建；请先在 AutoDL 核对后再处理，禁止自动重发以免重复计费`);
  }
  if (currentState?.task_id && !['SUCCESS', 'FAILED', 'SUBMIT_FAILED'].includes(currentState.status)) {
    throw new Error(`镜头 ${shotId} 已有任务编号 ${currentState.task_id}；请先恢复状态查询，禁止重复提交`);
  }
  // Single-shot (smoke-test) jobs keep their original "never resubmit" safety
  // rail (they were built for a one-off paid test). Multi-shot jobs intentionally
  // allow resubmission after success/failure — that's the whole point of manual re-roll.
  if (normalized.shape === 'single' && currentState?.submitted_at) {
    throw new Error('本测试计划已提交过；为避免重复计费，已锁定再次提交');
  }

  const refImages = await Promise.all((shot.ref_images || []).map(ref => {
    const target = resolveAssetRef(jobsRoot, jobDir, ref);
    if (!target) throw new Error(`参考图路径无效：${String(ref)}`);
    return asDataUri(target);
  }));
  const payload = {
    duration: shot.duration,
    resolution: normalized.resolution,
    seed: shot.seed,
    prompt: shot.prompt,
    ...(audioUrls.length ? {} : { ref_audio_0: normalized.audioReference })
  };
  refImages.forEach((dataUri, index) => { payload[`ref_image_${index}`] = dataUri; });
  audioUrls.slice(0, 3).forEach((url, index) => { payload[`ref_audio_${index}`] = url; });

  // Persist the intent BEFORE the paid call. If the process dies or the connection drops
  // after AutoDL created the task but before we saved its id, the shot stays SUBMITTING
  // and is never resent automatically (see the guard above and reconcileUnconfirmedSubmissions).
  await writeShotRunState(jobDir, files, shotId, normalized.shape, { status: 'SUBMITTING', submit_intent_at: new Date().toISOString(), submit_error: null });
  let response;
  try {
    response = await fetch(`${autodlApiRoot()}/api/v1/comfyui/comfyui_workflow/${normalized.workflowId}`, {
      method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
  } catch (error) {
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, actor: 'system', type: 'submit_unconfirmed', error: error.message });
    throw new Error(`提交请求中断（${error.message}），AutoDL 可能已收到；镜头保持“待核对”，不会自动重发`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data?.task_id) {
    const message = data?.msg || data?.message || `AutoDL 提交失败（HTTP ${response.status}）`;
    await writeShotRunState(jobDir, files, shotId, normalized.shape, { status: 'SUBMIT_FAILED', submit_error: message });
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, actor: 'system', type: 'submit_failed', error: message });
    throw new Error(message);
  }

  const taskId = data.data.task_id;
  const status = data.data.status || 'QUEUED';
  const submittedAt = new Date().toISOString();

  await writeShotRunState(jobDir, files, shotId, normalized.shape, { task_id: taskId, status, submitted_at: submittedAt, submit_intent_at: null, submit_error: null, seed: shot.seed, duration: shot.duration, resolution: normalized.resolution });
  await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, workflow_id: normalized.workflowId, status: 'submitted', prompt: shot.prompt, ref_images: shot.ref_images || [], seed: shot.seed, duration: shot.duration, resolution: normalized.resolution, actor: 'user', type: 'manual_submit', reason: reason || null });

  return { taskId, status, shape: normalized.shape };
  } finally {
    submittingShots.delete(lockKey);
  }
}

export async function pollShot(jobsRoot, jobId, shotId, taskId, { token }) {
  const jobDir = join(jobsRoot, jobId);
  const plan = await readJson(join(jobDir, 'request-plan.json'));
  const normalized = normalizePlan(plan);
  const files = await listFileNames(jobDir);
  try {
    const response = await fetch(`${autodlApiRoot()}/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(taskId)}`, { headers: { Authorization: token } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.data) throw new Error(body?.msg || `状态查询失败（HTTP ${response.status}）`);
    const data = body.data;
    await writeShotRunState(jobDir, files, shotId, normalized.shape, { ...(data.status === 'SUCCESS' ? {} : { status: data.status }), elapsed_seconds: data.duration ?? null, last_polled_at: new Date().toISOString(), last_poll_error: null });
    if (data.status === 'SUCCESS') {
      const url = resultUrls(data.results)[0];
      if (!url) throw new Error('任务成功但未返回可下载的视频 URL');
      const output = await fetch(url);
      if (!output.ok) throw new Error(`结果下载失败（HTTP ${output.status}）`);
      const outputPath = join(jobDir, 'renders', 'runs', shotId, `${taskId}.mp4`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from(await output.arrayBuffer()));
      const previewPath = join(jobDir, 'renders', 'preview', `${shotId}.mp4`);
      await mkdir(dirname(previewPath), { recursive: true });
      await copyFile(outputPath, previewPath);
      const relativeOutput = `renders/runs/${shotId}/${taskId}.mp4`;
      await writeShotRunState(jobDir, files, shotId, normalized.shape, { status: 'SUCCESS', output_file: relativeOutput, downloaded_at: new Date().toISOString() });
      await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, workflow_id: normalized.workflowId, status: 'success', results: [relativeOutput] });
      return { done: true, status: 'SUCCESS' };
    }
    if (data.status === 'FAILED') {
      await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, workflow_id: normalized.workflowId, status: 'failed', error: data.message || body.msg || 'AutoDL task failed' });
      return { done: true, status: 'FAILED' };
    }
    return { done: false, status: data.status };
  } catch (error) {
    await writeShotRunState(jobDir, files, shotId, normalized.shape, { last_poll_error: error.message }).catch(() => {});
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, status: 'poll_error', error: error.message }).catch(() => {});
    return { done: false, status: 'POLL_ERROR' };
  }
}

function resultUrls(value, urls = []) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) urls.push(value);
  else if (Array.isArray(value)) value.forEach(item => resultUrls(item, urls));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => resultUrls(item, urls));
  return urls;
}

// ---- Infinite Canvas manual generation -------------------------------------
// The canvas never talks to AutoDL or holds a token. It hands prompt + reference
// images to the local runner, which records them as a shot of task `canvas-<canvas id>`
// and submits through the same submitShot() path Codex automation uses.

const CANVAS_FORMAT_ID = 'ugc-multi-shot';
const CANVAS_MAX_IMAGES = 9;
const CANVAS_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const CANVAS_MAX_PROMPT_CHARS = 4000;
const BLANK_AUDIO_URL = 'https://codewithgpu.ks3-cn-beijing.ksyuncs.com/comfyui_api/blank/blank.wav';

function decodeCanvasImage(dataUrl) {
  const text = String(dataUrl || '');
  const comma = text.indexOf(',');
  const match = comma > 0 ? /^data:(image\/(png|jpeg|webp));base64$/.exec(text.slice(0, comma)) : null;
  if (!match) throw new Error('参考图必须是 png/jpeg/webp 的 data URL');
  const bytes = Buffer.from(text.slice(comma + 1), 'base64');
  if (!bytes.length) throw new Error('参考图为空');
  if (bytes.length > CANVAS_MAX_IMAGE_BYTES) throw new Error('单张参考图不能超过 15MB');
  return { bytes, ext: match[2] === 'jpeg' ? '.jpg' : `.${match[2]}`, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function parseCanvasRequest(input) {
  const canvasId = String(input?.canvas_id || '');
  if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(canvasId)) throw new Error('画布 id 无效');
  const prompt = String(input?.prompt || '').trim();
  if (!prompt) throw new Error('提示词不能为空');
  if (prompt.length > CANVAS_MAX_PROMPT_CHARS) throw new Error(`提示词不能超过 ${CANVAS_MAX_PROMPT_CHARS} 字`);
  const rawImages = Array.isArray(input?.images) ? input.images : [];
  if (!rawImages.length) throw new Error('至少需要 1 张参考图（与批量提交预检规则一致）');
  if (rawImages.length > CANVAS_MAX_IMAGES) throw new Error(`参考图最多 ${CANVAS_MAX_IMAGES} 张`);
  const duration = Math.min(15, Math.max(1, Math.round(Number(input?.seconds) || 6)));
  const clientRequestId = /^[\w-]{8,64}$/.test(String(input?.client_request_id || '')) ? String(input.client_request_id) : randomUUID();
  const nodeId = /^[\w:.-]{1,80}$/.test(String(input?.node_id || '')) ? String(input.node_id) : null;
  return { canvasId, nodeId, prompt, duration, clientRequestId, images: rawImages.map(decodeCanvasImage) };
}

// One task <-> one canvas: the canvas id is derived from the job id, so the frontend and the runner
// agree on it without a lookup table, and it stays inside the 64-char canvas id limit.
export const canvasIdForJob = jobId => `task-${createHash('sha256').update(jobId).digest('hex').slice(0, 20)}`;

export async function findBoundJob(jobsRoot, canvasId) {
  if (!canvasId.startsWith('task-')) return null;
  for (const entry of await readdir(jobsRoot, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory() && !entry.name.startsWith('_') && canvasIdForJob(entry.name) === canvasId) return entry.name;
  }
  return null;
}

// canvas-binding.json remembers which shot each canvas node generates, so generating the same
// node again re-rolls the same shot instead of creating a new one.
export const readBinding = async jobDir => (await readJson(join(jobDir, 'canvas-binding.json')).catch(() => null)) || { node_shots: {} };

async function ensureCanvasJob(jobsRoot, jobId, canvasId) {
  const jobDir = join(jobsRoot, jobId);
  if (await access(join(jobDir, 'brief.json')).then(() => true).catch(() => false)) return;
  const formats = await readJson(join(dirname(jobsRoot), 'config', 'formats.json')).then(data => data.formats).catch(() => []);
  const format = formats.find(item => item.format_id === CANVAS_FORMAT_ID);
  await Promise.all([
    mkdir(join(jobDir, 'assets', 'source'), { recursive: true }),
    mkdir(join(jobDir, 'renders', 'runs'), { recursive: true }),
    mkdir(join(jobDir, 'renders', 'preview'), { recursive: true })
  ]);
  await Promise.all([
    writeJsonAtomic(join(jobDir, 'brief.json'), { schema_version: 2, job_id: jobId, creative_concept: `无限画布手动任务（画布 ${canvasId}）`, category_id: null, format_id: CANVAS_FORMAT_ID, pipeline_id: format?.pipeline_id || 'standard-video-v2', created_at: new Date().toISOString(), review_policy: 'human_first', source: 'infinite-canvas', canvas_id: canvasId }),
    writeJsonAtomic(join(jobDir, 'shot-plan.json'), { job_id: jobId, format_id: CANVAS_FORMAT_ID, shots: [] }),
    writeJsonAtomic(join(jobDir, 'request-plan.json'), { job_id: jobId, media_type: 'video', workflow_id: format?.workflow_id || 'minimax_h3_z0903', resolution: '768p竖(768*1376)', audio_reference: BLANK_AUDIO_URL, shots: [] }),
    writeJsonAtomic(join(jobDir, `${jobId}-run-state.json`), { status: 'PREPARING', shots: {}, updated_at: new Date().toISOString() }),
    writeJsonAtomic(join(jobDir, 'canvas-layout.json'), { nodes: [], connections: [] })
  ]);
  await appendRunLog(jobDir, { job_id: jobId, actor: 'user', type: 'job_created', source: 'infinite-canvas', canvas_id: canvasId, format_id: CANVAS_FORMAT_ID });
}

const IN_FLIGHT = new Set(['SUBMITTING', 'NEEDS_ATTENTION', 'QUEUED', 'RUNNING']);

async function upsertCanvasShot(jobsRoot, jobDir, jobId, request) {
  const planPath = join(jobDir, 'request-plan.json');
  const shotPlanPath = join(jobDir, 'shot-plan.json');
  const plan = await readJson(planPath);
  if (!Array.isArray(plan.shots)) throw new Error('该任务不是多镜头 request-plan.json，画布无法追加镜头');
  const existing = plan.shots.find(shot => shot.client_request_id === request.clientRequestId);
  if (existing) return { shotId: existing.shot_id, reused: true };

  // Which shot does this node generate? Remembered mapping first, then the "shot-<id>" node ids the
  // task-to-canvas import creates; anything else is a new node and becomes a new shot.
  const binding = await readBinding(jobDir);
  const conventional = /^shot-((?:S|G)\d+)$/.exec(request.nodeId || '')?.[1];
  const targetId = request.nodeId ? (binding.node_shots[request.nodeId] || conventional) : null;
  const target = targetId ? plan.shots.find(shot => shot.shot_id === targetId) : null;
  if (target) {
    // Re-rolling a shot that is still running would rewrite the plan under a live task.
    const run = await currentShotRunState(jobDir, await listFileNames(jobDir), target.shot_id, 'multi');
    if (IN_FLIGHT.has(run?.status)) throw new Error(`镜头 ${target.shot_id} 还在生成或待核对，请等它结束后再重新生成`);
  }

  await mkdir(join(jobDir, 'assets', 'source'), { recursive: true });
  const library = await buildLibraryIndex(jobsRoot);
  const refs = [];
  for (const image of request.images) {
    // Same bytes as a library asset (SKU original, material reference…): reference it, never copy it.
    const libraryRef = library.get(image.sha256);
    if (libraryRef) { refs.push(libraryRef); continue; }
    const relative = `assets/source/${image.sha256.slice(0, 12)}${image.ext}`;
    await writeFile(join(jobDir, relative), image.bytes, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
    refs.push(relative);
  }
  const seed = randomInt(1, 2 ** 31 - 1);
  const shotPlan = await readJson(shotPlanPath).catch(() => ({ job_id: jobId, shots: [] }));
  const refSha256 = request.images.map(image => image.sha256);
  let shotId;
  if (target) {
    // Re-roll: the canvas now holds the latest prompt/references for this shot, so the task records them
    // (before/after in the log) and a fresh seed; earlier renders stay versioned under renders/runs/.
    shotId = target.shot_id;
    const before = { prompt: target.prompt, ref_images: target.ref_images, duration: target.duration, seed: target.seed };
    Object.assign(target, { prompt: request.prompt, ref_images: refs, duration: request.duration, seed, client_request_id: request.clientRequestId });
    const planned = (shotPlan.shots || []).find(shot => shot.shot_id === shotId);
    if (planned) Object.assign(planned, { references: refs, duration: request.duration });
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, actor: 'user', type: 'canvas_shot_updated', source: 'infinite-canvas', node_id: request.nodeId, before, after: { prompt: request.prompt, ref_images: refs, duration: request.duration, seed }, ref_sha256: refSha256, client_request_id: request.clientRequestId });
  } else {
    const numbers = plan.shots.map(shot => /^S(\d+)$/.exec(String(shot.shot_id))?.[1]).filter(Boolean).map(Number);
    shotId = `S${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, '0')}`;
    plan.shots.push({ shot_id: shotId, duration: request.duration, seed, ref_images: refs, prompt: request.prompt, client_request_id: request.clientRequestId, source: 'infinite-canvas' });
    shotPlan.shots = [...(shotPlan.shots || []), { shot_id: shotId, purpose: '画布手动生成', duration: request.duration, references: refs, status: 'planned' }];
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, actor: 'user', type: 'canvas_shot_created', source: 'infinite-canvas', node_id: request.nodeId, ref_images: refs, ref_sha256: refSha256, duration: request.duration, seed, client_request_id: request.clientRequestId });
  }
  await writeJsonAtomic(planPath, plan);
  await writeJsonAtomic(shotPlanPath, shotPlan);
  if (request.nodeId && binding.node_shots[request.nodeId] !== shotId) {
    binding.node_shots[request.nodeId] = shotId;
    await writeJsonAtomic(join(jobDir, 'canvas-binding.json'), binding);
  }
  return { shotId, reused: false };
}

export async function canvasGenerate(jobsRoot, input, { token }) {
  const request = parseCanvasRequest(input);
  // A canvas opened from a task ("task-…") writes into that task; any other canvas gets its own task.
  const bound = await findBoundJob(jobsRoot, request.canvasId);
  if (request.canvasId.startsWith('task-') && !bound) throw new Error('这个画布绑定的任务已不存在（可能已被删除），请删除该画布');
  const jobId = bound || `canvas-${request.canvasId}`;
  const jobDir = join(jobsRoot, jobId);
  if (input.dry_run === true) return { dry_run: true, job_id: jobId, bound: Boolean(bound), images: request.images.length, duration: request.duration, submitted: false };
  if (!token) throw new Error('缺少 AUTODL_COMFYUI_TOKEN（必须是 AutoDL 的 ComfyUI 分组 Token）');

  const { shotId, reused } = await withPlanLock(jobDir, async () => {
    if (!bound) await ensureCanvasJob(jobsRoot, jobId, request.canvasId);
    return upsertCanvasShot(jobsRoot, jobDir, jobId, request);
  });
  if (reused) {
    const run = await currentShotRunState(jobDir, await listFileNames(jobDir), shotId, 'multi');
    if (run?.task_id) return { job_id: jobId, shot_id: shotId, task_id: run.task_id, status: run.status, reused: true };
  }
  const submitted = await submitShot(jobsRoot, jobId, shotId, { token, reason: '无限画布手动生成' });
  return { job_id: jobId, shot_id: shotId, task_id: submitted.taskId, status: submitted.status, reused: false };
}

export async function canvasGenerationStatus(jobsRoot, jobId, shotId) {
  if (!/^[\p{L}\p{N}._-]+$/u.test(jobId) || jobId.includes('..') || !/^(S|G)\d+$/.test(shotId)) throw new Error('无效的画布任务');
  const jobDir = join(jobsRoot, jobId);
  const run = await currentShotRunState(jobDir, await listFileNames(jobDir), shotId, 'multi');
  if (!run) return { status: 'PLANNED', task_id: null, video_path: null, error: null };
  return { status: run.status || 'PLANNED', task_id: run.task_id || null, video_path: run.output_file || null, error: run.last_poll_error || null };
}

// ---- Submission recovery, validation, review --------------------------------

// Run once at runner startup: a shot still SUBMITTING has no confirmed task id (the process
// died mid-call). Flag it for a human instead of resending, so no duplicate billing.
export async function reconcileUnconfirmedSubmissions(jobsRoot) {
  const flagged = [];
  for (const entry of await readdir(jobsRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const jobDir = join(jobsRoot, entry.name);
    const files = await listFileNames(jobDir);
    const stateName = files.find(name => name.endsWith('run-state.json'));
    const state = stateName ? await readJson(join(jobDir, stateName)).catch(() => null) : null;
    for (const [shotId, run] of Object.entries(state?.shots || {})) {
      if (run?.status !== 'SUBMITTING') continue;
      await writeShotRunState(jobDir, files, shotId, 'multi', { status: 'NEEDS_ATTENTION' });
      await appendRunLog(jobDir, { job_id: entry.name, shot_id: shotId, type: 'submit_unconfirmed', error: '进程重启时该镜头仍在提交中，未拿到 task_id' });
      flagged.push({ jobId: entry.name, shotId });
    }
  }
  return flagged;
}

export async function resolveUnconfirmedSubmit(jobsRoot, jobId, shotId, { taskId, discard }) {
  const jobDir = join(jobsRoot, jobId);
  if (submittingShots.has(`${jobId}:${shotId}`)) throw new Error(`镜头 ${shotId} 正在提交，请稍后再处理`);
  const files = await listFileNames(jobDir);
  const run = await currentShotRunState(jobDir, files, shotId, 'multi');
  if (!['SUBMITTING', 'NEEDS_ATTENTION'].includes(run?.status)) throw new Error('该镜头没有待核对的提交');
  if (discard === true) {
    await writeShotRunState(jobDir, files, shotId, 'multi', { status: 'SUBMIT_FAILED', submit_intent_at: null, submit_error: '人工确认 AutoDL 未创建任务' });
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, actor: 'user', type: 'submit_discarded' });
    return { resolved: 'discarded' };
  }
  if (!/^[\w-]{8,64}$/.test(String(taskId || ''))) throw new Error('需要提供 AutoDL 上核对到的 task_id，或明确 discard');
  await writeShotRunState(jobDir, files, shotId, 'multi', { task_id: taskId, status: 'QUEUED', submitted_at: run.submit_intent_at || new Date().toISOString(), submit_intent_at: null, submit_error: null });
  await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, actor: 'user', type: 'submit_adopted' });
  return { resolved: 'adopted', taskId };
}

// Mechanical pre-flight over a job's files. `errors` block submission, `warnings` do not.
export async function validateJobFiles(jobsRoot, jobId) {
  const jobDir = join(jobsRoot, jobId);
  const errors = [];
  const warnings = [];
  const plan = await readJson(join(jobDir, 'request-plan.json')).catch(() => null);
  if (!plan) return { ok: false, errors: ['缺少或无法解析 request-plan.json'], warnings };
  const shotPlan = await readJson(join(jobDir, 'shot-plan.json')).catch(() => null);
  const shots = Array.isArray(plan.shots) ? plan.shots : [];
  if (!plan.workflow_id) errors.push('request-plan 未配置 workflow_id');
  const ids = shots.map(shot => shot.shot_id);
  if (ids.some(id => typeof id !== 'string' || !/^(S\d+|G\d+)$/.test(id))) errors.push(`镜头 id 必须是 S01…或 G1…，当前：${JSON.stringify(ids)}`);
  if (new Set(ids).size !== ids.length) errors.push('镜头 id 重复');
  if (shotPlan?.shots) {
    const planned = shotPlan.shots.map(shot => shot.shot_id);
    if (JSON.stringify([...planned].sort()) !== JSON.stringify([...ids].sort())) errors.push(`shot-plan 与 request-plan 的镜头 id 不一致：${JSON.stringify(planned)} ≠ ${JSON.stringify(ids)}`);
  }
  for (const shot of shots) {
    const tag = String(shot.shot_id);
    if (plan.media_type !== 'image') {
      const seconds = Number(shot.duration);
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 15) errors.push(`${tag}：时长必须在 1–15 秒`);
    }
    if (!String(shot.prompt || '').trim()) errors.push(`${tag}：提示词为空`);
    const refs = Array.isArray(shot.ref_images) ? shot.ref_images : [];
    if (new Set(refs).size !== refs.length) warnings.push(`${tag}：参考图重复引用`);
    for (const relative of refs) {
      const target = resolveAssetRef(jobsRoot, jobDir, relative);
      if (!target) errors.push(`${tag}：参考图路径无效 ${String(relative)}`);
      else if (!(await access(target).then(() => true).catch(() => false))) errors.push(`${tag}：参考图不存在 ${relative}`);
    }
    if ((shot.ref_audio_urls || []).some(url => !/^https:\/\//.test(String(url)))) errors.push(`${tag}：配音 URL 必须是 https`);
  }
  const log = await readFile(join(jobDir, 'run-log.jsonl'), 'utf8').catch(() => '');
  let badLines = 0;
  log.split('\n').forEach(line => {
    if (!line.trim()) return;
    try { const event = JSON.parse(line); if (!event.time || !(event.type || event.status || event.event)) badLines += 1; } catch { badLines += 1; }
  });
  if (badLines) warnings.push(`run-log.jsonl 有 ${badLines} 行缺少时间/类型或无法解析（历史遗留，不影响提交）`);
  return { ok: errors.length === 0, errors, warnings };
}

// For runner-level events (e.g. polling given up) that have no dedicated action function.
export async function appendJobEvent(jobsRoot, jobId, entry) {
  await appendRunLog(join(jobsRoot, jobId), { job_id: jobId, ...entry });
}

const REVIEW_CATEGORIES = new Set(['material', 'consistency', 'lipsync', 'composition', 'audio', 'other']);

// Human review decisions are appended as new events; earlier success/failed records are never rewritten.
export async function recordShotReview(jobsRoot, jobId, shotId, { decision, category, note }) {
  if (!['accepted', 'rejected'].includes(decision)) throw new Error('decision 必须是 accepted 或 rejected');
  if (decision === 'rejected' && !REVIEW_CATEGORIES.has(category)) throw new Error(`驳回原因必须是：${[...REVIEW_CATEGORIES].join('、')}`);
  const jobDir = join(jobsRoot, jobId);
  const run = await currentShotRunState(jobDir, await listFileNames(jobDir), shotId, 'multi');
  if (!run?.task_id) throw new Error('该镜头还没有生成结果，无法审核');
  await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: run.task_id, actor: 'user', type: `review_${decision}`, ...(decision === 'rejected' ? { category } : {}), note: String(note || '').slice(0, 500) || null });
  return { recorded: `review_${decision}`, runId: run.task_id };
}

export { SINGLE_SHOT_ID };
