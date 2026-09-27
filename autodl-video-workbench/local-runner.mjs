import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { listJobs, getJobDetail } from './job-store.mjs';
import { patchShotField, submitShot, pollShot } from './job-actions.mjs';

const here = resolve(new URL('.', import.meta.url).pathname.replace(/^\/(.:)/, '$1'));
const repoRoot = resolve(here, '..');
const staticRoot = join(here, 'dist');
const allJobsRoot = join(repoRoot, 'production', 'jobs');
const formatsConfigPath = join(repoRoot, 'production', 'config', 'formats.json');
const jobRoot = join(repoRoot, 'production', 'jobs', 'autodl-z0903-canvas-smoke-20260927');
const planPath = join(jobRoot, 'request-plan.json');
const statePath = join(jobRoot, 'run-state.json');
const outputRoot = join(jobRoot, 'output');
const tvcRoot = join(repoRoot, 'production', 'jobs', 'pair-plush-tvc-10s-20260927');
const tvcPlanPath = join(tvcRoot, 'request-plan.json');
const tvcStatePath = join(tvcRoot, 'tvc-run-state.json');
const tvcPreviewRoot = join(tvcRoot, 'renders', 'preview');
const port = Number(process.env.WORKBENCH_PORT || 4173);
let activeTask = null;

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8' };
const sendJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Invalid JSON body'); }
}
function schedulePollShot(jobId, shotId, taskId, token, delayMs = 5000) {
  setTimeout(async () => {
    const result = await pollShot(allJobsRoot, jobId, shotId, taskId, { token }).catch(error => ({ done: true, status: 'ERROR', error: safeError(error) }));
    if (!result.done) schedulePollShot(jobId, shotId, taskId, token, 5000);
  }, delayMs);
}
const safeError = error => error instanceof Error ? error.message.replace(/AUTODL_COMFYUI_TOKEN\S*/g, '[redacted]') : 'Unknown error';

async function tokenFromLocalConfig() {
  if (process.env.AUTODL_COMFYUI_TOKEN?.trim()) return process.env.AUTODL_COMFYUI_TOKEN.trim();
  try {
    const config = await readFile(join(repoRoot, 'production', 'config', 'autodl.env'), 'utf8');
    const match = config.match(/^\s*AUTODL_COMFYUI_TOKEN\s*=\s*(.+?)\s*$/m);
    return match?.[1]?.replace(/^['"]|['"]$/g, '').trim() || '';
  } catch { return ''; }
}
async function saveState(extra) {
  const old = await readState();
  await writeFile(statePath, JSON.stringify({ ...old, ...extra, updated_at: new Date().toISOString() }, null, 2));
}
async function readState() { try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return {}; } }
async function projectSnapshot() {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const run = await readState();
  const expectedVideo = run.task_id ? join(outputRoot, `${run.task_id}.mp4`) : '';
  let videoReady = false;
  if (run.status === 'SUCCESS' && expectedVideo) { try { videoReady = (await stat(expectedVideo)).isFile(); } catch {} }
  return {
    workflowId: plan.workflow_id,
    runName: plan.run_name,
    request: { duration: plan.request.duration, resolution: plan.request.resolution, seed: plan.request.seed, prompt: plan.request.prompt },
    sources: [
      { label: '黄橙款 · SKU 01', url: '/api/assets/yellow' },
      { label: '粉色款 · SKU 02', url: '/api/assets/pink' }
    ],
    audio: { label: 'AutoDL 官方静音参考', url: plan.request.ref_audio_0 },
    run: { status: run.status || 'PLANNED', taskId: run.task_id || null, submittedAt: run.submitted_at || null, elapsedSeconds: run.autodl?.duration ?? null, error: run.error || null, videoReady, videoUrl: videoReady ? '/api/output/video' : null, downloadUrl: videoReady ? '/api/output/download' : null, posterUrl: videoReady ? '/api/assets/poster' : null, reviewed: run.reviewed === true }
  };
}
async function tvcSnapshot() {
  const plan = JSON.parse(await readFile(tvcPlanPath, 'utf8'));
  let state = { status: 'PREPARING', shots: {} };
  try { state = JSON.parse(await readFile(tvcStatePath, 'utf8')); } catch {}
  const shots = await Promise.all(plan.shots.map(async shot => {
    const run = state.shots?.[shot.shot_id] || { status: 'PLANNED' };
    let videoReady = false;
    try { videoReady = run.status === 'SUCCESS' && (await stat(join(tvcPreviewRoot, `${shot.shot_id}.mp4`))).isFile(); } catch {}
    return {
      shotId: shot.shot_id, duration: shot.duration, seed: shot.seed, prompt: shot.prompt,
      sourceUrls: shot.ref_images.map(path => path.includes('yellow-orange') ? '/api/tvc/assets/yellow' : '/api/tvc/assets/pink'),
      status: run.status, taskId: run.task_id || null, elapsedSeconds: run.elapsed_seconds ?? null, error: run.error || null,
      videoReady, videoUrl: videoReady ? `/api/tvc/video/${shot.shot_id}` : null,
      downloadUrl: videoReady ? `/api/tvc/download/${shot.shot_id}` : null
    };
  }));
  let assemblyReady = false;
  try { assemblyReady = (await stat(join(tvcPreviewRoot, 'tvc-10s-review.mp4'))).isFile(); } catch {}
  return {
    jobId: plan.job_id, workflowId: plan.workflow_id, sourceResolution: plan.resolution,
    output: plan.output, status: state.status || 'PREPARING', shots,
    assembly: { ready: assemblyReady, videoUrl: assemblyReady ? '/api/tvc/assembly/video' : null, downloadUrl: assemblyReady ? '/api/tvc/assembly/download' : null }
  };
}
async function asDataUri(path) { const ext = extname(path).toLowerCase() || '.png'; const type = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'; return `data:${type};base64,${(await readFile(path)).toString('base64')}`; }
function resultUrls(value, urls = []) {
  if (typeof value === 'string' && /^https?:\/\//.test(value)) urls.push(value);
  else if (Array.isArray(value)) value.forEach(item => resultUrls(item, urls));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => resultUrls(item, urls));
  return urls;
}
async function buildPayload() {
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const [yellow, pink] = await Promise.all(plan.request.ref_images.map(relative => asDataUri(join(jobRoot, relative))));
  return {
    duration: plan.request.duration,
    resolution: plan.request.resolution,
    seed: plan.request.seed,
    prompt: plan.request.prompt,
    ref_audio_0: plan.request.ref_audio_0,
    ref_image_0: yellow,
    ref_image_1: pink
  };
}
async function submitTask() {
  if (activeTask && ['QUEUED', 'RUNNING'].includes(activeTask.status)) throw new Error('已有进行中的测试，禁止重复提交');
  const previous = await readState();
  if (previous.submitted_at) throw new Error('本测试计划已提交过；为避免重复计费，已锁定再次提交');
  const token = await tokenFromLocalConfig();
  if (!token) throw new Error('缺少 AUTODL_COMFYUI_TOKEN（必须是 AutoDL 的 ComfyUI 分组 Token）');
  const payload = await buildPayload();
  const response = await fetch('https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_z0903', {
    method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.data?.task_id) throw new Error(data?.msg || data?.message || `AutoDL 提交失败（HTTP ${response.status}）`);
  activeTask = { taskId: data.data.task_id, status: data.data.status || 'QUEUED', message: '任务已提交，等待 AutoDL 执行。' };
  await saveState({ submitted_at: new Date().toISOString(), task_id: activeTask.taskId, status: activeTask.status, request: { workflow_id: 'minimax_h3_z0903', duration: payload.duration, resolution: payload.resolution, seed: payload.seed, ref_images: 2, ref_audio: 'official-blank.wav' } });
  setTimeout(() => pollTask(activeTask.taskId), 1500);
  return activeTask;
}
async function pollTask(taskId) {
  const token = await tokenFromLocalConfig();
  if (!token) return;
  try {
    const response = await fetch(`https://autodl.art/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(taskId)}`, { headers: { Authorization: token } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.data) throw new Error(body?.msg || `状态查询失败（HTTP ${response.status}）`);
    const data = body.data;
    activeTask = { taskId, status: data.status, message: `任务状态：${data.status}${data.duration ? `，已用时 ${data.duration} 秒` : ''}` };
    await saveState({ status: data.status, autodl: { duration: data.duration, started_at: data.started_at, completed_at: data.completed_at }, last_response_at: new Date().toISOString() });
    if (data.status === 'SUCCESS') {
      const url = resultUrls(data.results)[0];
      if (!url) throw new Error('任务成功但未返回可下载的视频 URL');
      const output = await fetch(url); if (!output.ok) throw new Error(`结果下载失败（HTTP ${output.status}）`);
      const outputPath = join(jobRoot, 'output', `${taskId}.mp4`); await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, Buffer.from(await output.arrayBuffer()));
      activeTask.message = '生成成功，MP4 已保存，等待人工审片。'; await saveState({ status: 'SUCCESS', output_file: outputPath, reviewed: false, result_url_received_at: new Date().toISOString() }); return;
    }
    if (data.status === 'FAILED') { activeTask.message = '生成失败，未自动重试。请查看运行记录。'; await saveState({ status: 'FAILED', error: data.message || body.msg || 'AutoDL task failed' }); return; }
    setTimeout(() => pollTask(taskId), 5000);
  } catch (error) { activeTask = { taskId, status: 'ERROR', message: `轮询或保存失败：${safeError(error)}` }; await saveState({ status: 'ERROR', error: safeError(error) }); }
}
async function serveStatic(requestPath, res) {
  const requested = requestPath === '/' ? '/tvc.html' : requestPath;
  const filePath = normalize(join(staticRoot, requested));
  if (!filePath.startsWith(staticRoot)) return sendJson(res, 403, { error: 'Forbidden' });
  try { await access(filePath); res.writeHead(200, { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); createReadStream(filePath).pipe(res); }
  catch { sendJson(res, 404, { error: 'Not found' }); }
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
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') { const token = await tokenFromLocalConfig(); const state = await readState(); return sendJson(res, 200, { ready: true, comfyuiTokenConfigured: Boolean(token), alreadySubmitted: Boolean(state.submitted_at), activeTask }); }
  if (req.method === 'GET' && url.pathname === '/api/project') { try { return sendJson(res, 200, await projectSnapshot()); } catch (error) { return sendJson(res, 500, { error: safeError(error) }); } }
  if (req.method === 'GET' && url.pathname === '/api/tvc/project') { try { return sendJson(res, 200, await tvcSnapshot()); } catch (error) { return sendJson(res, 500, { error: safeError(error) }); } }
  if (req.method === 'GET' && url.pathname === '/api/formats') {
    try { return sendJson(res, 200, JSON.parse(await readFile(formatsConfigPath, 'utf8')).formats); }
    catch (error) { return sendJson(res, 500, { error: safeError(error) }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/jobs') { try { return sendJson(res, 200, await listJobs(allJobsRoot)); } catch (error) { return sendJson(res, 500, { error: safeError(error) }); } }
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const jobId = decodeURIComponent(url.pathname.slice('/api/jobs/'.length));
    if (!jobId || jobId.includes('/') || jobId.includes('..')) return sendJson(res, 400, { error: 'Invalid job id' });
    try {
      const detail = await getJobDetail(allJobsRoot, jobId);
      if (!detail) return sendJson(res, 404, { error: 'Job not found' });
      return sendJson(res, 200, detail);
    } catch (error) { return sendJson(res, 500, { error: safeError(error) }); }
  }
  const shotFieldMatch = req.method === 'PATCH' && /^\/api\/jobs\/([^/]+)\/shots\/([^/]+)$/.exec(url.pathname);
  if (shotFieldMatch) {
    const [, jobId, shotId] = shotFieldMatch;
    try {
      const body = await readJsonBody(req);
      if (!body.field || body.value === undefined) return sendJson(res, 400, { error: 'Body must include { field, value }' });
      const result = await patchShotField(allJobsRoot, jobId, shotId, body.field, body.value);
      return sendJson(res, 200, result);
    } catch (error) { return sendJson(res, 400, { error: safeError(error) }); }
  }
  const shotSubmitMatch = req.method === 'POST' && /^\/api\/jobs\/([^/]+)\/shots\/([^/]+)\/submit$/.exec(url.pathname);
  if (shotSubmitMatch) {
    const [, jobId, shotId] = shotSubmitMatch;
    try {
      const body = await readJsonBody(req);
      const token = await tokenFromLocalConfig();
      const result = await submitShot(allJobsRoot, jobId, shotId, { token, reason: body.reason });
      schedulePollShot(jobId, shotId, result.taskId, token, 1500);
      return sendJson(res, 202, result);
    } catch (error) { return sendJson(res, 409, { error: safeError(error) }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/tvc/assets/yellow') return serveFile(join(tvcRoot, 'assets', 'source', 'yellow-orange-plush-seatbelt-pad.png'), 'image/png', res);
  if (req.method === 'GET' && url.pathname === '/api/tvc/assets/pink') return serveFile(join(tvcRoot, 'assets', 'source', 'pink-plush-seatbelt-pad.png'), 'image/png', res);
  if (req.method === 'GET' && /^\/api\/tvc\/(video|download)\/S0[1-3]$/.test(url.pathname)) {
    const parts = url.pathname.split('/');
    const shotId = parts[4];
    const tvc = await tvcSnapshot();
    if (!tvc.shots.find(shot => shot.shotId === shotId)?.videoReady) return sendJson(res, 404, { error: 'Shot video not ready' });
    return serveFile(join(tvcPreviewRoot, `${shotId}.mp4`), 'video/mp4', res, { download: parts[3] === 'download', allowRange: true }, req.headers.range || '');
  }
  if (req.method === 'GET' && /^\/api\/tvc\/assembly\/(video|download)$/.test(url.pathname)) {
    const tvc = await tvcSnapshot();
    if (!tvc.assembly.ready) return sendJson(res, 404, { error: 'Assembly not ready' });
    return serveFile(join(tvcPreviewRoot, 'tvc-10s-review.mp4'), 'video/mp4', res, { download: url.pathname.endsWith('download'), allowRange: true }, req.headers.range || '');
  }
  if (req.method === 'GET' && url.pathname === '/api/assets/yellow') return serveFile(join(jobRoot, 'assets', 'source', 'yellow-orange-plush-seatbelt-pad.png'), 'image/png', res);
  if (req.method === 'GET' && url.pathname === '/api/assets/pink') return serveFile(join(jobRoot, 'assets', 'source', 'pink-plush-seatbelt-pad.png'), 'image/png', res);
  if (req.method === 'GET' && url.pathname === '/api/assets/poster') return serveFile(join(outputRoot, 'review-first.png'), 'image/png', res);
  if (req.method === 'GET' && (url.pathname === '/api/output/video' || url.pathname === '/api/output/download')) {
    const state = await readState();
    if (state.status !== 'SUCCESS' || !state.task_id) return sendJson(res, 404, { error: 'Video not ready' });
    return serveFile(join(outputRoot, `${state.task_id}.mp4`), 'video/mp4', res, { download: url.pathname.endsWith('/download'), allowRange: true }, req.headers.range || '');
  }
  if (req.method === 'POST' && url.pathname === '/api/submit-smoke-test') { try { const task = await submitTask(); return sendJson(res, 202, task); } catch (error) { return sendJson(res, 409, { error: safeError(error) }); } }
  if (req.method === 'GET' && url.pathname.startsWith('/api/task/')) { const taskId = decodeURIComponent(url.pathname.split('/').pop() || ''); const state = await readState(); if (state.task_id !== taskId) return sendJson(res, 404, { error: 'Task not found' }); return sendJson(res, 200, activeTask?.taskId === taskId ? activeTask : { taskId, status: state.status, message: `任务状态：${state.status}` }); }
  return serveStatic(url.pathname, res);
});
server.listen(port, '127.0.0.1', async () => {
  const state = await readState();
  if (state.task_id) activeTask = { taskId: state.task_id, status: state.status, message: state.status === 'SUCCESS' ? '生成成功，MP4 已保存，等待人工审片。' : `任务状态：${state.status}` };
  if (state.task_id && ['QUEUED', 'RUNNING'].includes(state.status)) setTimeout(() => pollTask(state.task_id), 1000);
  console.log(`镜场本机执行器已启动：http://127.0.0.1:${port}`);
});
