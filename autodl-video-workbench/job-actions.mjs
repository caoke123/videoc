// Phase 2 write path: human-in-the-loop prompt edits + manual AutoDL submission
// for a single shot, with every write appended to run-log.jsonl as an
// audit-trail entry. See production/integrations/autodl-video-workbench-canvas-plan.md.
//
// Scope: only jobs that have a request-plan.json (the AutoDL-direct path) support
// manual submit — that file holds the literal prompt string sent to AutoDL, unlike
// shot-plan.json's editorial/narrative fields. Jobs generated via DFCine/other
// workflows don't have request-plan.json and simply don't expose this action.

import { readFile, writeFile, rename, mkdir, readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';

const SINGLE_SHOT_ID = 'MAIN';

async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function listFileNames(dir) {
  try { return (await readdir(dir, { withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name); }
  catch { return []; }
}

async function writeJsonAtomic(path, data) {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await rename(tmp, path);
}

async function appendRunLog(jobDir, entry) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n';
  const path = join(jobDir, 'run-log.jsonl');
  const existing = await readFile(path, 'utf8').catch(() => '');
  await writeFile(path, existing + line);
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
      getShot: shotId => plan.shots.find(shot => shot.shot_id === shotId),
      setShotPrompt: (shotId, prompt) => { const shot = plan.shots.find(s => s.shot_id === shotId); if (shot) shot.prompt = prompt; }
    };
  }
  return {
    shape: 'single',
    workflowId: plan.workflow_id,
    resolution: plan.request?.resolution,
    audioReference: plan.request?.ref_audio_0,
    getShot: shotId => (shotId === SINGLE_SHOT_ID ? { shot_id: SINGLE_SHOT_ID, duration: plan.request?.duration, seed: plan.request?.seed, ref_images: plan.request?.ref_images, prompt: plan.request?.prompt } : null),
    setShotPrompt: (shotId, prompt) => { if (shotId === SINGLE_SHOT_ID && plan.request) plan.request.prompt = prompt; }
  };
}

async function asDataUri(path) {
  const ext = extname(path).toLowerCase();
  const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

const EDITABLE_FIELDS = new Set(['prompt']);

export async function patchShotField(jobsRoot, jobId, shotId, field, value) {
  if (!EDITABLE_FIELDS.has(field)) throw new Error(`Field "${field}" is not editable`);
  const jobDir = join(jobsRoot, jobId);
  const planPath = join(jobDir, 'request-plan.json');
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
}

export async function submitShot(jobsRoot, jobId, shotId, { token, reason }) {
  const jobDir = join(jobsRoot, jobId);
  const planPath = join(jobDir, 'request-plan.json');
  const plan = await readJson(planPath).catch(() => { throw new Error('该任务没有 request-plan.json，不支持人工触发生成'); });
  const normalized = normalizePlan(plan);
  const shot = normalized.getShot(shotId);
  if (!shot) throw new Error(`Shot "${shotId}" not found in request-plan.json`);
  if (!shot.prompt) throw new Error('该镜头没有 prompt，无法提交');
  if (!token) throw new Error('缺少 AUTODL_COMFYUI_TOKEN（必须是 AutoDL 的 ComfyUI 分组 Token）');

  const files = await listFileNames(jobDir);
  const currentState = await currentShotRunState(jobDir, files, shotId, normalized.shape);
  if (currentState && ['QUEUED', 'RUNNING'].includes(currentState.status)) {
    throw new Error(`镜头 ${shotId} 已有进行中的生成任务，禁止重复提交`);
  }
  // Single-shot (smoke-test) jobs keep their original "never resubmit" safety
  // rail (they were built for a one-off paid test). Multi-shot jobs intentionally
  // allow resubmission after success/failure — that's the whole point of manual re-roll.
  if (normalized.shape === 'single' && currentState?.submitted_at) {
    throw new Error('本测试计划已提交过；为避免重复计费，已锁定再次提交');
  }

  const refImages = await Promise.all((shot.ref_images || []).map(relative => asDataUri(join(jobDir, relative))));
  const payload = {
    duration: shot.duration,
    resolution: normalized.resolution,
    seed: shot.seed,
    prompt: shot.prompt,
    ref_audio_0: normalized.audioReference
  };
  refImages.forEach((dataUri, index) => { payload[`ref_image_${index}`] = dataUri; });

  const response = await fetch(`https://autodl.art/api/v1/comfyui/comfyui_workflow/${normalized.workflowId}`, {
    method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data?.task_id) throw new Error(data?.msg || data?.message || `AutoDL 提交失败（HTTP ${response.status}）`);

  const taskId = data.data.task_id;
  const status = data.data.status || 'QUEUED';
  const submittedAt = new Date().toISOString();

  await writeShotRunState(jobDir, files, shotId, normalized.shape, { task_id: taskId, status, submitted_at: submittedAt, seed: shot.seed, duration: shot.duration, resolution: normalized.resolution });
  await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, workflow_id: normalized.workflowId, status: 'submitted', seed: shot.seed, duration: shot.duration, resolution: normalized.resolution, actor: 'user', type: 'manual_submit', reason: reason || null });

  return { taskId, status, shape: normalized.shape };
}

export async function pollShot(jobsRoot, jobId, shotId, taskId, { token }) {
  const jobDir = join(jobsRoot, jobId);
  const plan = await readJson(join(jobDir, 'request-plan.json'));
  const normalized = normalizePlan(plan);
  const files = await listFileNames(jobDir);
  try {
    const response = await fetch(`https://autodl.art/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(taskId)}`, { headers: { Authorization: token } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.data) throw new Error(body?.msg || `状态查询失败（HTTP ${response.status}）`);
    const data = body.data;
    await writeShotRunState(jobDir, files, shotId, normalized.shape, { status: data.status, elapsed_seconds: data.duration ?? null, last_polled_at: new Date().toISOString() });
    if (data.status === 'SUCCESS') {
      const url = resultUrls(data.results)[0];
      if (!url) throw new Error('任务成功但未返回可下载的视频 URL');
      const output = await fetch(url);
      if (!output.ok) throw new Error(`结果下载失败（HTTP ${output.status}）`);
      const outputPath = join(jobDir, 'renders', 'preview', `${shotId}.mp4`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from(await output.arrayBuffer()));
      await writeShotRunState(jobDir, files, shotId, normalized.shape, { status: 'SUCCESS', output_file: outputPath, downloaded_at: new Date().toISOString() });
      await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, workflow_id: normalized.workflowId, status: 'success', results: [outputPath] });
      return { done: true, status: 'SUCCESS' };
    }
    if (data.status === 'FAILED') {
      await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, workflow_id: normalized.workflowId, status: 'failed', error: data.message || body.msg || 'AutoDL task failed' });
      return { done: true, status: 'FAILED' };
    }
    return { done: false, status: data.status };
  } catch (error) {
    await writeShotRunState(jobDir, files, shotId, normalized.shape, { status: 'ERROR', error: error.message });
    await appendRunLog(jobDir, { job_id: jobId, shot_id: shotId, run_id: taskId, status: 'error', error: error.message });
    return { done: true, status: 'ERROR' };
  }
}

function resultUrls(value, urls = []) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) urls.push(value);
  else if (Array.isArray(value)) value.forEach(item => resultUrls(item, urls));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => resultUrls(item, urls));
  return urls;
}

export { SINGLE_SHOT_ID };
