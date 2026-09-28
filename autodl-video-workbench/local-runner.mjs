// Local executor: the single place that holds the AutoDL token, submits, polls and saves results.
// Entry points that may call it: Codex automation (job files / batch submit) and the Infinite
// Canvas (manual edits, canvas generation). Browsers never talk to AutoDL directly.

import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, resolve, relative, sep } from 'node:path';
import { listJobs, getJobDetail, getJobRunLog } from './job-store.mjs';
import {
  createJob, patchShotField, saveCanvasLayout, submitShot, preflightBatchSubmission, uploadJobAsset,
  publishShotAudio, pollShot, canvasGenerate, canvasGenerationStatus, reconcileUnconfirmedSubmissions,
  resolveUnconfirmedSubmit, validateJobFiles, recordShotReview, appendJobEvent, canvasIdForJob, findBoundJob, readBinding, syncRequestPlan
} from './job-actions.mjs';
import { resolveAssetRef } from './asset-library.mjs';
import { composeCut } from './compose.mjs';

const here = resolve(new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const repoRoot = resolve(here, '..');
const allJobsRoot = process.env.WORKBENCH_JOBS_ROOT ? resolve(process.env.WORKBENCH_JOBS_ROOT) : join(repoRoot, 'production', 'jobs');
const formatsConfigPath = join(repoRoot, 'production', 'config', 'formats.json');
const categoriesConfigPath = join(repoRoot, 'production', 'config', 'categories.json');
const port = Number(process.env.WORKBENCH_PORT || 4173);
const validJobId = value => typeof value === 'string' && /^[\p{L}\p{N}._-]+$/u.test(value) && !value.includes('..');

const MAX_JSON_BODY_BYTES = 32 * 1024 * 1024;
const MAX_CANVAS_BODY_BYTES = 160 * 1024 * 1024;
const MAX_POLL_ERRORS = 12;

const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
const safeError = error => error instanceof Error ? error.message.replace(/AUTODL_COMFYUI_TOKEN\S*/g, '[redacted]') : 'Unknown error';

async function readBodyBuffer(req, limit = MAX_JSON_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error(`请求体超过 ${Math.round(limit / 1024 / 1024)}MB 上限`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function readJsonBody(req, limit) {
  const buffer = await readBodyBuffer(req, limit);
  if (!buffer.length) return {};
  try { return JSON.parse(buffer.toString('utf8')); } catch { throw new Error('Invalid JSON body'); }
}

async function tokenFromLocalConfig() {
  if (process.env.AUTODL_COMFYUI_TOKEN?.trim()) return process.env.AUTODL_COMFYUI_TOKEN.trim();
  try {
    const config = await readFile(join(repoRoot, 'production', 'config', 'autodl.env'), 'utf8');
    const match = config.match(/^\s*AUTODL_COMFYUI_TOKEN\s*=\s*(.+?)\s*$/m);
    return match?.[1]?.replace(/^['"]|['"]$/g, '').trim() || '';
  } catch { return ''; }
}

// One poll loop per task id (submit, batch submit and startup resume may all ask for one).
// Transient errors back off 5s → 60s and stop after MAX_POLL_ERRORS so a persistent failure
// cannot spin forever or flood run-log.jsonl.
const activePolls = new Set();
function schedulePollShot(jobId, shotId, taskId, token, delayMs = 5000) {
  if (activePolls.has(taskId)) return;
  activePolls.add(taskId);
  let errors = 0;
  const tick = async () => {
    const result = await pollShot(allJobsRoot, jobId, shotId, taskId, { token }).catch(error => ({ done: false, status: 'POLL_ERROR', error: safeError(error) }));
    if (result.done) { activePolls.delete(taskId); return; }
    errors = result.status === 'POLL_ERROR' ? errors + 1 : 0;
    if (errors >= MAX_POLL_ERRORS) {
      activePolls.delete(taskId);
      await appendJobEvent(allJobsRoot, jobId, { shot_id: shotId, run_id: taskId, type: 'poll_gave_up', error: `连续 ${MAX_POLL_ERRORS} 次轮询失败，已停止；可通过 resume-poll 恢复` }).catch(() => {});
      return;
    }
    setTimeout(tick, Math.min(60000, 5000 * 2 ** Math.min(errors, 4)));
  };
  setTimeout(tick, delayMs);
}

async function serveFile(filePath, contentType, res, { download = false, allowRange = false } = {}, rangeHeader = '') {
  try {
    const file = await stat(filePath);
    if (!file.isFile()) return sendJson(res, 404, { error: 'File not found' });
    const headers = { 'Content-Type': contentType, 'Accept-Ranges': allowRange ? 'bytes' : 'none', 'Cache-Control': 'no-store' };
    if (download) headers['Content-Disposition'] = `attachment; filename="${filePath.split(/[\\/]/).pop()}"`;
    if (allowRange && rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      if (!match) { res.writeHead(416, { 'Content-Range': `bytes */${file.size}` }); return res.end(); }
      const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2] || 0));
      const end = match[2] && match[1] ? Math.min(file.size - 1, Number(match[2])) : file.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size) { res.writeHead(416, { 'Content-Range': `bytes */${file.size}` }); return res.end(); }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${file.size}`, 'Content-Length': end - start + 1 });
      return createReadStream(filePath, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...headers, 'Content-Length': file.size });
    return createReadStream(filePath).pipe(res);
  } catch { return sendJson(res, 404, { error: 'File not found' }); }
}

async function resumePendingShots(onlyJobId) {
  const token = await tokenFromLocalConfig();
  if (!token) return 0;
  let resumed = 0;
  for (const entry of await readdir(allJobsRoot, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || (onlyJobId && entry.name !== onlyJobId)) continue;
    const jobId = entry.name;
    const jobDir = join(allJobsRoot, jobId);
    const [plan, names] = await Promise.all([
      readFile(join(jobDir, 'request-plan.json'), 'utf8').then(JSON.parse).catch(() => null),
      readdir(jobDir).catch(() => [])
    ]);
    const stateFile = names.find(name => name.endsWith('run-state.json'));
    if (!plan || !stateFile) continue;
    const state = await readFile(join(jobDir, stateFile), 'utf8').then(JSON.parse).catch(() => null);
    if (!state) continue;
    const shots = Array.isArray(plan.shots) ? plan.shots : [{ shot_id: 'MAIN' }];
    for (const shot of shots) {
      const run = Array.isArray(plan.shots) ? state.shots?.[shot.shot_id] : state;
      if (run?.task_id && ['QUEUED', 'RUNNING'].includes(run.status)) { schedulePollShot(jobId, shot.shot_id, run.task_id, token, 1000); resumed += 1; }
    }
  }
  return resumed;
}

const decode = value => decodeURIComponent(value);
const route = (req, method, pattern, url) => req.method === method ? pattern.exec(url.pathname) : null;

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ready: true, comfyuiTokenConfigured: Boolean(await tokenFromLocalConfig()) });
    if (req.method === 'GET' && url.pathname === '/api/formats') return sendJson(res, 200, JSON.parse(await readFile(formatsConfigPath, 'utf8')).formats);
    if (req.method === 'GET' && url.pathname === '/api/categories') return sendJson(res, 200, JSON.parse(await readFile(categoriesConfigPath, 'utf8')).categories);

    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const body = await readJsonBody(req);
      const [formats, categories] = await Promise.all([readFile(formatsConfigPath, 'utf8').then(raw => JSON.parse(raw).formats), readFile(categoriesConfigPath, 'utf8').then(raw => JSON.parse(raw).categories)]);
      return sendJson(res, 201, await createJob(allJobsRoot, body, { formats, categories }));
    }

    // Infinite Canvas manual generation: prompt + reference images in, task/shot ids out.
    if (req.method === 'POST' && url.pathname === '/api/canvas/generate') {
      const body = await readJsonBody(req, MAX_CANVAS_BODY_BYTES);
      const token = await tokenFromLocalConfig();
      const result = await canvasGenerate(allJobsRoot, body, { token });
      if (result.task_id && ['QUEUED', 'RUNNING'].includes(result.status)) schedulePollShot(result.job_id, result.shot_id, result.task_id, token, 1500);
      return sendJson(res, result.dry_run ? 200 : 202, result);
    }
    const canvasStatus = route(req, 'GET', /^\/api\/canvas\/generate\/([^/]+)\/([^/]+)$/, url);
    if (canvasStatus) {
      const jobId = decode(canvasStatus[1]);
      const status = await canvasGenerationStatus(allJobsRoot, jobId, decode(canvasStatus[2]));
      const videoUrl = status.status === 'SUCCESS' && status.video_path ? `/api/jobs/${encodeURIComponent(jobId)}/files/${status.video_path.split('/').map(encodeURIComponent).join('/')}` : null;
      return sendJson(res, 200, { ...status, video_url: videoUrl });
    }

    const jobFile = route(req, 'GET', /^\/api\/jobs\/([^/]+)\/files\/(.+)$/, url);
    if (jobFile) {
      const jobId = decode(jobFile[1]);
      const filePath = decode(jobFile[2]);
      if (!validJobId(jobId) || filePath.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) return sendJson(res, 400, { error: 'Invalid asset path' });
      const jobDir = resolve(allJobsRoot, jobId);
      const target = filePath.startsWith('library:') ? resolveAssetRef(allJobsRoot, jobDir, filePath) : resolve(jobDir, filePath);
      const inside = target && (filePath.startsWith('library:') || (relative(jobDir, target) && !relative(jobDir, target).startsWith(`..${sep}`) && relative(jobDir, target) !== '..'));
      if (!inside) return sendJson(res, 403, { error: 'Forbidden' });
      const type = ({ '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8' })[extname(target).toLowerCase()] || 'application/octet-stream';
      return serveFile(target, type, res, { allowRange: type.startsWith('video/') }, req.headers.range || '');
    }
    const jobLog = route(req, 'GET', /^\/api\/jobs\/([^/]+)\/run-log$/, url);
    if (jobLog) {
      const jobId = decode(jobLog[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      const entries = await getJobRunLog(allJobsRoot, jobId);
      return entries === null ? sendJson(res, 404, { error: 'Job not found' }) : sendJson(res, 200, entries);
    }
    // The one canvas bound to a task; the canvas id is derived from the job id (see canvasIdForJob).
    const jobCanvasId = route(req, 'GET', /^\/api\/jobs\/([^/]+)\/canvas-id$/, url);
    if (jobCanvasId) {
      const jobId = decode(jobCanvasId[1]);
      if (!validJobId(jobId) || !(await stat(join(allJobsRoot, jobId)).then(info => info.isDirectory()).catch(() => false))) return sendJson(res, 404, { error: 'Job not found' });
      return sendJson(res, 200, { canvas_id: canvasIdForJob(jobId) });
    }
    const canvasJob = route(req, 'GET', /^\/api\/canvas\/([^/]+)\/job$/, url);
    if (canvasJob) {
      const jobId = await findBoundJob(allJobsRoot, decode(canvasJob[1]));
      return jobId ? sendJson(res, 200, { job_id: jobId, node_shots: (await readBinding(join(allJobsRoot, jobId))).node_shots || {} }) : sendJson(res, 404, { error: 'Job not found' });
    }
    const jobValidate = route(req, 'GET', /^\/api\/jobs\/([^/]+)\/validate$/, url);
    if (jobValidate) {
      const jobId = decode(jobValidate[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      return sendJson(res, 200, await validateJobFiles(allJobsRoot, jobId));
    }
    if (req.method === 'GET' && url.pathname === '/api/jobs') return sendJson(res, 200, await listJobs(allJobsRoot));
    if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
      const jobId = decode(url.pathname.slice('/api/jobs/'.length));
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      const detail = await getJobDetail(allJobsRoot, jobId);
      return detail ? sendJson(res, 200, detail) : sendJson(res, 404, { error: 'Job not found' });
    }

    const shotField = route(req, 'PATCH', /^\/api\/jobs\/([^/]+)\/shots\/([^/]+)$/, url);
    if (shotField) {
      const jobId = decode(shotField[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      const body = await readJsonBody(req);
      if (!body.field || body.value === undefined) return sendJson(res, 400, { error: 'Body must include { field, value }' });
      return sendJson(res, 200, await patchShotField(allJobsRoot, jobId, decode(shotField[2]), body.field, body.value));
    }
    const canvasLayout = route(req, 'PATCH', /^\/api\/jobs\/([^/]+)\/canvas$/, url);
    if (canvasLayout) {
      const jobId = decode(canvasLayout[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      return sendJson(res, 200, await saveCanvasLayout(allJobsRoot, jobId, await readJsonBody(req)));
    }
    const assetUpload = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/assets$/, url);
    if (assetUpload) {
      const jobId = decode(assetUpload[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      return sendJson(res, 201, await uploadJobAsset(allJobsRoot, jobId, url.searchParams.get('name'), req.headers['content-type'], await readBodyBuffer(req, MAX_CANVAS_BODY_BYTES), url.searchParams.get('shotId')));
    }

    const shotSubmit = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/shots\/([^/]+)\/submit$/, url);
    if (shotSubmit) {
      const jobId = decode(shotSubmit[1]);
      const shotId = decode(shotSubmit[2]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      const body = await readJsonBody(req);
      const token = await tokenFromLocalConfig();
      const result = await submitShot(allJobsRoot, jobId, shotId, { token, reason: body.reason });
      schedulePollShot(jobId, shotId, result.taskId, token, 1500);
      return sendJson(res, 202, result);
    }
    const audioPublish = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/shots\/([^/]+)\/publish-audio$/, url);
    if (audioPublish) {
      const jobId = decode(audioPublish[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      return sendJson(res, 201, await publishShotAudio(allJobsRoot, jobId, decode(audioPublish[2])));
    }
    const resolveSubmit = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/shots\/([^/]+)\/resolve-submit$/, url);
    if (resolveSubmit) {
      const jobId = decode(resolveSubmit[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      const body = await readJsonBody(req);
      const shotId = decode(resolveSubmit[2]);
      const result = await resolveUnconfirmedSubmit(allJobsRoot, jobId, shotId, { taskId: body.task_id, discard: body.discard === true });
      if (result.taskId) schedulePollShot(jobId, shotId, result.taskId, await tokenFromLocalConfig(), 1500);
      return sendJson(res, 200, result);
    }
    const syncPlanRoute = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/sync-plan$/, url);
    if (syncPlanRoute) {
      const jobId = decode(syncPlanRoute[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      return sendJson(res, 200, await syncRequestPlan(allJobsRoot, jobId, { reason: 'api' }));
    }
    const composeRoute = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/compose$/, url);
    if (composeRoute) {
      const jobId = decode(composeRoute[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      if (!(await stat(join(allJobsRoot, jobId)).then(info => info.isDirectory()).catch(() => false))) return sendJson(res, 404, { error: 'Job not found' });
      return sendJson(res, 200, await composeCut(allJobsRoot, jobId, await readJsonBody(req)));
    }
    const shotReview = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/shots\/([^/]+)\/review$/, url);
    if (shotReview) {
      const jobId = decode(shotReview[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      return sendJson(res, 200, await recordShotReview(allJobsRoot, jobId, decode(shotReview[2]), await readJsonBody(req)));
    }
    const resumePoll = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/resume-poll$/, url);
    if (resumePoll) {
      const jobId = decode(resumePoll[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      return sendJson(res, 200, { resumed: await resumePendingShots(jobId) });
    }

    // mode "probe": submit only the first pending shot so material/identity problems show up
    // before the rest of the batch is paid for; call again without mode for the remaining shots.
    const batchSubmit = route(req, 'POST', /^\/api\/jobs\/([^/]+)\/submit-batch$/, url);
    if (batchSubmit) {
      const jobId = decode(batchSubmit[1]);
      if (!validJobId(jobId)) return sendJson(res, 400, { error: 'Invalid job id' });
      const body = await readJsonBody(req);
      const token = await tokenFromLocalConfig();
      const plan = await preflightBatchSubmission(allJobsRoot, jobId, { token });
      const shotIds = body.mode === 'probe' ? plan.shotIds.slice(0, 1) : plan.shotIds;
      const deferred = body.mode === 'probe' ? plan.shotIds.slice(1) : [];
      if (body.dry_run === true) return sendJson(res, 200, { ...plan, shotIds, deferred });
      const submitted = [];
      for (const shotId of shotIds) {
        try {
          const result = await submitShot(allJobsRoot, jobId, shotId, { token, reason: body.mode === 'probe' ? 'Infinite Canvas 试探提交（先验 1 镜头）' : 'Infinite Canvas 批量提交' });
          schedulePollShot(jobId, shotId, result.taskId, token, 1500);
          submitted.push({ shotId, taskId: result.taskId, status: result.status });
        } catch (error) {
          return sendJson(res, 207, { submitted, skipped: plan.skipped, failed: { shotId, error: safeError(error) }, remaining: shotIds.slice(submitted.length + 1), deferred });
        }
      }
      return sendJson(res, 202, { submitted, skipped: plan.skipped, deferred });
    }
    return sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    const message = safeError(error);
    return sendJson(res, /不存在|not found|Not found/i.test(message) ? 404 : /已有任务|禁止重复|没有得到 AutoDL 确认|已提交过|正在提交|还在生成或待核对|正在合成/.test(message) ? 409 : 400, { error: message });
  }
});

server.listen(port, '127.0.0.1', async () => {
  const flagged = await reconcileUnconfirmedSubmissions(allJobsRoot);
  if (flagged.length) console.warn(`以下镜头上次提交未得到 AutoDL 确认，已标记为待核对（不会自动重发）：${flagged.map(item => `${item.jobId}/${item.shotId}`).join('、')}`);
  await resumePendingShots();
  console.log(`镜场本机执行器已启动：http://127.0.0.1:${port}`);
});
