// Export the accepted shots of a job as a new Jianying Pro rough-cut draft (video clips + caption track).
// Writes edit/edit-plan.json, then runs the draft writer in tools/jianying-exporter (installed by
// scripts/setup-jianying-exporter.mjs). It never overwrites an existing draft, never calls AutoDL and never
// exports a video: the user fine-cuts and exports in Jianying.

import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendJobEvent } from './job-actions.mjs';
import { readReviewSummary } from './job-store.mjs';
import { probe, readRunState } from './compose.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exporterDir = process.env.JIANYING_EXPORTER_DIR || join(projectRoot, 'tools', 'jianying-exporter');
const adapter = join(projectRoot, '.agents', 'skills', 'ecommerce-video-edit', 'scripts', 'export_jianying_draft.py');
const venvPython = join(exporterDir, 'venv', process.platform === 'win32' ? join('Scripts', 'python.exe') : join('bin', 'python'));
const exporterScripts = join(exporterDir, 'repo', 'scripts');
const SHOT_ID = /^[\p{L}\p{N}_-]+$/u;
const exporting = new Set();

const exists = path => stat(path).then(() => true, () => false);
const readJson = path => readFile(path, 'utf8').then(JSON.parse).catch(() => null);
const round = value => Math.round(value * 1e6) / 1e6;

export async function exporterInstalled() {
  return (await exists(venvPython)) && (await exists(join(exporterScripts, 'jy_wrapper.py'))) && (await exists(adapter));
}

// The spoken line of a shot: the planned dialogue when the shot plan has one, otherwise the last quoted
// line of the submitted prompt ("... says exactly: “...”").
function captionFor(shotId, plan, request) {
  const planned = plan?.shots?.find(shot => shot.shot_id === shotId)?.dialogue;
  if (typeof planned === 'string' && planned.trim()) return planned.trim();
  const prompt = request?.shots?.find(shot => shot.shot_id === shotId)?.prompt || '';
  const quotes = [...prompt.matchAll(/[“"]([^”"]{1,120})[”"]/g)].map(match => match[1].trim()).filter(Boolean);
  return quotes.at(-1) || '';
}

async function eligibleShots(jobDir, runState, review) {
  const shotPlan = await readJson(join(jobDir, 'shot-plan.json'));
  const requestPlan = await readJson(join(jobDir, 'request-plan.json'));
  const entries = Object.entries(runState?.shots || {});
  const shots = [];
  for (const [shotId, run] of entries) {
    if (!SHOT_ID.test(shotId) || String(run?.status || '').toUpperCase() !== 'SUCCESS' || !run.task_id || !run.output_file) continue;
    if (review.shots[shotId]?.state !== 'accepted') continue;
    const file = join(jobDir, run.output_file);
    if (!(await exists(file)) || run.output_file.split(/[\\/]/).includes('..')) continue;
    const info = await probe(file);
    shots.push({ shot_id: shotId, run_id: run.task_id, path: run.output_file.replaceAll('\\', '/'), duration: round(info.duration), width: info.width, height: info.height, caption: captionFor(shotId, shotPlan, requestPlan) });
  }
  return shots;
}

// Default order: the previous export's order when there is one, then the remaining shots in plan order.
function orderShots(shots, previousPlan, shotPlan) {
  const previous = (previousPlan?.shots || []).map(shot => shot.id);
  const planned = (shotPlan?.shots || []).map(shot => shot.shot_id);
  const rank = id => { const index = previous.indexOf(id); return index >= 0 ? index : previous.length + (planned.indexOf(id) >= 0 ? planned.indexOf(id) : 1000) + 0.5; };
  return [...shots].sort((a, b) => rank(a.shot_id) - rank(b.shot_id) || a.shot_id.localeCompare(b.shot_id, 'en', { numeric: true }));
}

const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 12).replace(/^(\d{8})/, '$1-');

export async function jianyingExportPlan(jobsRoot, jobId) {
  const jobDir = join(jobsRoot, jobId);
  const runState = await readRunState(jobDir);
  const review = await readReviewSummary(jobDir, runState);
  const brief = await readJson(join(jobDir, 'brief.json'));
  const previous = await readJson(join(jobDir, 'edit', 'edit-plan.json'));
  const shotPlan = await readJson(join(jobDir, 'shot-plan.json'));
  const shots = orderShots(await eligibleShots(jobDir, runState, review), previous, shotPlan);
  const savedCaptions = new Map((previous?.captions || []).map(item => [item.shot_id, item.text]));
  const reasons = [];
  if (review.pending > 0) reasons.push(`还有 ${review.pending} 个镜头待审片`);
  if (!shots.length) reasons.push('没有已通过审片的镜头');
  const installed = await exporterInstalled();
  return {
    ready: reasons.length === 0 && installed,
    reasons,
    exporter_installed: installed,
    setup_command: 'node autodl-video-workbench/scripts/setup-jianying-exporter.mjs',
    review: { pending: review.pending, accepted: review.accepted, rejected: review.rejected },
    default_name: `${String(brief?.title || (jobId.startsWith('canvas-') ? '画布任务' : jobId)).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40)}_粗剪_${stamp()}`,
    shots: shots.map(shot => ({ ...shot, caption: savedCaptions.get(shot.shot_id) ?? shot.caption })),
  };
}

function runAdapter(args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(venvPython, [adapter, ...args], { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
    child.on('error', error => reject(new Error(`无法运行导出组件：${error.message}`)));
    child.on('close', code => {
      if (code === 0) {
        try { return resolveRun(JSON.parse(stdout.trim().split('\n').at(-1))); } catch { return reject(new Error('导出组件没有返回草稿位置')); }
      }
      const detail = `${stderr}\n${stdout}`.trim().split('\n').filter(Boolean).at(-1) || `退出码 ${code}`;
      reject(new Error(`导出失败：${detail}`));
    });
  });
}

export async function exportJianyingDraft(jobsRoot, jobId, input = {}) {
  if (exporting.has(jobId)) throw new Error('这个任务正在导出，请稍后再试');
  exporting.add(jobId);
  try {
    const plan = await jianyingExportPlan(jobsRoot, jobId);
    if (!plan.exporter_installed) throw new Error(`还没有安装剪映导出组件，请先运行：${plan.setup_command}`);
    if (plan.review.pending > 0) throw new Error(`还有 ${plan.review.pending} 个镜头待审片，审片全部完成后才能导出`);
    const name = String(input.name || '').trim();
    if (!name || name.length > 60 || /[\\/:*?"<>|]/.test(name)) throw new Error('草稿名称不能为空，不能超过 60 个字，也不能含 \\ / : * ? " < > |');
    const requested = Array.isArray(input.shots) ? input.shots : [];
    if (!requested.length) throw new Error('至少选择 1 个镜头');
    if (requested.length > 30) throw new Error('镜头数量过多');
    const byId = new Map(plan.shots.map(shot => [shot.shot_id, shot]));
    const seen = new Set();
    const picked = requested.map((item, index) => {
      const id = String(item?.shot_id || '');
      const shot = byId.get(id);
      if (!shot) throw new Error(`镜头 ${id || index + 1} 不在已通过审片的当前版本里`);
      if (seen.has(id)) throw new Error(`镜头 ${id} 重复`);
      seen.add(id);
      return { ...shot, caption: String(item?.caption ?? shot.caption).trim().slice(0, 120) };
    });

    let cursor = 0;
    const clips = [];
    const captions = [];
    for (const shot of picked) {
      clips.push({ id: shot.shot_id, path: shot.path, source_in: 0, start: round(cursor), duration: shot.duration, task_id: shot.run_id });
      if (shot.caption && shot.duration > 0.6) captions.push({ shot_id: shot.shot_id, text: shot.caption, start: round(cursor + 0.2), duration: round(shot.duration - 0.4) });
      cursor += shot.duration;
    }
    const portrait = picked[0].height >= picked[0].width;
    const editDir = join(jobDir(jobsRoot, jobId), 'edit');
    await mkdir(editDir, { recursive: true });
    const planPath = join(editDir, 'edit-plan.json');
    if (await exists(planPath)) await copyFile(planPath, join(editDir, 'edit-plan.prev.json'));
    await writeFile(planPath, `${JSON.stringify({
      schema_version: 1, job_id: jobId,
      note: '粗剪草稿：保留各镜头完整时长，由用户在剪映里精剪；字幕来自镜头对白，待按配音校对。',
      canvas: portrait ? { width: 1080, height: 1920, fps: 24 } : { width: 1920, height: 1080, fps: 24 },
      duration_seconds: round(cursor), shots: clips, captions,
      captions_status: 'draft_from_shot_dialogue_pending_voiceover_alignment', voiceovers: [], music: [], keep_native_audio: true,
    }, null, 2)}\n`);

    const result = await runAdapter(['--job', jobDir(jobsRoot, jobId), '--name', name, '--exporter', exporterScripts, ...(process.env.JIANYING_DRAFTS_ROOT ? ['--drafts-root', process.env.JIANYING_DRAFTS_ROOT] : [])]);
    await appendJobEvent(jobsRoot, jobId, { actor: 'user', type: 'jianying_draft_exported', draft_name: name, draft_path: result.draft_path, shots: clips.map(clip => clip.id), duration: round(cursor) });
    return { draft_name: name, draft_path: result.draft_path, duration: round(cursor), shots: clips.map(clip => clip.id) };
  } finally {
    exporting.delete(jobId);
  }
}

const jobDir = (jobsRoot, jobId) => join(jobsRoot, jobId);
