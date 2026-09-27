import { readFile, writeFile, appendFile, mkdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const jobRoot = resolve('..', 'production', 'jobs', 'pair-plush-tvc-10s-20260927');
const planPath = join(jobRoot, 'request-plan.json');
const statePath = join(jobRoot, 'tvc-run-state.json');
const logPath = join(jobRoot, 'run-log.jsonl');
const outputRoot = join(jobRoot, 'renders', 'preview');
const apiRoot = 'https://autodl.art/api/v1/comfyui/comfyui_workflow';

async function token() {
  if (process.env.AUTODL_COMFYUI_TOKEN?.trim()) return process.env.AUTODL_COMFYUI_TOKEN.trim();
  const config = await readFile(resolve('..', 'production', 'config', 'autodl.env'), 'utf8');
  const match = config.match(/^\s*AUTODL_COMFYUI_TOKEN\s*=\s*(.+?)\s*$/m);
  if (!match?.[1]) throw new Error('AUTODL_COMFYUI_TOKEN is missing');
  return match[1].replace(/^['"]|['"]$/g, '').trim();
}

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const secret = await token();
let state;
try { state = JSON.parse(await readFile(statePath, 'utf8')); }
catch { state = { job_id: plan.job_id, status: 'PREPARING', shots: {}, created_at: new Date().toISOString() }; }
let writeQueue = Promise.resolve();

async function save() {
  writeQueue = writeQueue.then(async () => {
    state.updated_at = new Date().toISOString();
    const tempPath = `${statePath}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2));
    await rename(tempPath, statePath);
  });
  return writeQueue;
}
async function log(shotId, taskId, status, extra = {}) {
  await appendFile(logPath, `${JSON.stringify({ time: new Date().toISOString(), shot_id: shotId, run_id: taskId, workflow_id: plan.workflow_id, status, ...extra })}\n`);
}
async function imageAsDataUri(relative) {
  const image = await readFile(join(jobRoot, relative));
  return `data:image/png;base64,${image.toString('base64')}`;
}
function findUrls(value, urls = []) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) urls.push(value);
  else if (Array.isArray(value)) value.forEach(item => findUrls(item, urls));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => findUrls(item, urls));
  return urls;
}

async function submit(shot) {
  const prior = state.shots[shot.shot_id];
  if (prior?.task_id) { console.log(`${shot.shot_id} existing ${prior.task_id}; will not submit again`); return; }
  const images = await Promise.all(shot.ref_images.map(imageAsDataUri));
  const body = { duration: shot.duration, resolution: plan.resolution, seed: shot.seed, prompt: shot.prompt, ref_audio_0: plan.audio_reference };
  images.forEach((uri, index) => { body[`ref_image_${index}`] = uri; });
  const response = await fetch(`${apiRoot}/${plan.workflow_id}`, { method: 'POST', headers: { Authorization: secret, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  const taskId = result?.data?.task_id;
  if (!response.ok || !taskId) {
    state.shots[shot.shot_id] = { status: 'SUBMIT_FAILED', error: result?.msg || result?.message || `HTTP ${response.status}` };
    await save();
    console.log(`${shot.shot_id} submission failed: ${state.shots[shot.shot_id].error}`);
    return;
  }
  state.shots[shot.shot_id] = { status: result.data.status || 'QUEUED', task_id: taskId, submitted_at: new Date().toISOString(), seed: shot.seed, duration: shot.duration, resolution: plan.resolution };
  state.status = 'GENERATING';
  await save();
  await log(shot.shot_id, taskId, 'submitted', { seed: shot.seed, duration: shot.duration, resolution: plan.resolution });
  console.log(`${shot.shot_id} submitted ${taskId}`);
}

async function poll(shot) {
  const record = state.shots[shot.shot_id];
  if (!record?.task_id || ['SUCCESS', 'FAILED', 'ERROR'].includes(record.status)) return;
  const taskId = record.task_id;
  while (true) {
    const response = await fetch(`${apiRoot}/result/${encodeURIComponent(taskId)}`, { headers: { Authorization: secret } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.data) throw new Error(`${shot.shot_id} status HTTP ${response.status}: ${result?.msg || ''}`);
    const data = result.data;
    record.status = data.status;
    record.elapsed_seconds = data.duration ?? null;
    record.last_polled_at = new Date().toISOString();
    await save();
    if (data.status === 'SUCCESS') {
      const url = findUrls(data.results)[0];
      if (!url) throw new Error(`${shot.shot_id} succeeded without a downloadable video URL`);
      const media = await fetch(url);
      if (!media.ok) throw new Error(`${shot.shot_id} download HTTP ${media.status}`);
      await mkdir(outputRoot, { recursive: true });
      const output = join(outputRoot, `${shot.shot_id}.mp4`);
      await writeFile(output, Buffer.from(await media.arrayBuffer()));
      record.output_file = output;
      record.downloaded_at = new Date().toISOString();
      await save();
      await log(shot.shot_id, taskId, 'success', { results: [output] });
      console.log(`${shot.shot_id} saved ${output}`);
      return;
    }
    if (data.status === 'FAILED') {
      record.error = data.message || result.msg || 'AutoDL task failed';
      await save();
      await log(shot.shot_id, taskId, 'failed', { error: record.error });
      console.log(`${shot.shot_id} failed: ${record.error}`);
      return;
    }
    console.log(`${shot.shot_id} ${data.status} ${data.duration ?? 0}s`);
    await new Promise(resolve => setTimeout(resolve, 6000));
  }
}

for (const shot of plan.shots) await submit(shot);
await Promise.allSettled(plan.shots.map(async shot => {
  try { await poll(shot); }
  catch (error) {
    const record = state.shots[shot.shot_id];
    if (record) { record.status = 'ERROR'; record.error = error.message; await save(); }
    console.log(`${shot.shot_id} error: ${error.message}`);
  }
}));
state.status = Object.values(state.shots).every(shot => shot.status === 'SUCCESS') ? 'AWAITING_REVIEW' : 'NEEDS_ATTENTION';
await save();
console.log(`TVC generation state: ${state.status}`);
