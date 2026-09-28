// Local rough-cut: joins the current render of each shot into one preview MP4 with ffmpeg.
// It never calls AutoDL and never touches shot files or request-plan.json; it only adds
// renders/preview/final-<time>.mp4 and one `cut_composed` run-log entry.

import { spawn } from 'node:child_process';
import { readFile, readdir, stat, mkdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { appendJobEvent } from './job-actions.mjs';

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const SHOT_ID = /^[\p{L}\p{N}_-]+$/u;
const MAX_FADE = 1;
const composing = new Set();

function run(command, args, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${command} 超时`)); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); reject(new Error(error.code === 'ENOENT' ? `找不到 ${command}，请安装 ffmpeg 或设置 FFMPEG_PATH` : error.message)); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(stdout) : reject(new Error(`${command} 失败：${stderr.trim().split('\n').slice(-3).join(' | ')}`)); });
  });
}

async function probe(file) {
  const data = JSON.parse(await run(FFPROBE, ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate,duration', '-show_entries', 'format=duration', '-of', 'json', file], { timeoutMs: 60000 }));
  const video = data.streams?.find(stream => stream.codec_type === 'video');
  if (!video) throw new Error(`${file} 没有视频流`);
  const [num, den] = String(video.r_frame_rate).split('/').map(Number);
  return { width: video.width, height: video.height, fps: den ? num / den : 24, duration: Number(video.duration || data.format?.duration), hasAudio: data.streams.some(stream => stream.codec_type === 'audio') };
}

async function currentRender(jobDir, jobId, shot) {
  const dir = join(jobDir, 'renders', 'runs', shot.shot_id);
  if (shot.run_id) {
    if (!/^[\w-]+$/.test(shot.run_id)) throw new Error(`镜头 ${shot.shot_id} 的 run_id 不合法`);
    const file = join(dir, `${shot.run_id}.mp4`);
    await stat(file).catch(() => { throw new Error(`镜头 ${shot.shot_id} 没有 ${shot.run_id} 这版视频`); });
    return { file, run_id: shot.run_id };
  }
  const state = await readFile(join(jobDir, `${jobId}-run-state.json`), 'utf8').then(JSON.parse).catch(() => null);
  const recorded = state?.shots?.[shot.shot_id]?.output_file;
  if (typeof recorded === 'string' && !recorded.includes('..')) {
    const file = join(jobDir, recorded);
    if (await stat(file).then(info => info.isFile()).catch(() => false)) return { file, run_id: recorded.split(/[\\/]/).pop().replace(/\.mp4$/i, '') };
  }
  const names = (await readdir(dir).catch(() => [])).filter(name => name.toLowerCase().endsWith('.mp4'));
  if (!names.length) throw new Error(`镜头 ${shot.shot_id} 还没有生成视频`);
  const dated = await Promise.all(names.map(async name => ({ name, time: (await stat(join(dir, name))).mtimeMs })));
  const newest = dated.sort((a, b) => b.time - a.time)[0].name;
  return { file: join(dir, newest), run_id: newest.replace(/\.mp4$/i, '') };
}

const num = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const stamp = () => new Date().toISOString().replace(/\D/g, '').slice(0, 14).replace(/^(\d{8})/, '$1-');

export async function composeCut(jobsRoot, jobId, input = {}) {
  const jobDir = join(jobsRoot, jobId);
  const shots = Array.isArray(input.shots) ? input.shots : [];
  if (shots.length < 1) throw new Error('至少需要 1 个镜头');
  if (shots.length > 30) throw new Error('镜头数量过多');
  const defaultTransition = input.transition === 'fade' ? 'fade' : 'cut';
  const fadeSeconds = num(input.fade_seconds, 0.15, 0.05, MAX_FADE);
  const audioPath = typeof input.audio === 'string' && input.audio ? input.audio.replaceAll('\\', '/') : null;
  if (audioPath && (audioPath.startsWith('/') || audioPath.split('/').some(part => !part || part === '..'))) throw new Error('配音路径不合法');
  if (composing.has(jobId)) throw new Error('这个任务正在合成，请稍后再试');

  const clips = [];
  for (const [index, shot] of shots.entries()) {
    const shotId = String(shot.shot_id || '');
    if (!SHOT_ID.test(shotId)) throw new Error(`第 ${index + 1} 个镜头的 shot_id 不合法`);
    const render = await currentRender(jobDir, jobId, { ...shot, shot_id: shotId });
    const info = await probe(render.file);
    const head = num(shot.trim_head, 0, 0, 5);
    const tail = num(shot.trim_tail, 0, 0, 5);
    const duration = info.duration - head - tail;
    if (!(duration > 0.3)) throw new Error(`镜头 ${shotId} 裁剪后不足 0.3 秒`);
    clips.push({ shot_id: shotId, run_id: render.run_id, file: render.file, head, tail, duration, transition: index === 0 ? null : (shot.transition === 'fade' || shot.transition === 'cut' ? shot.transition : defaultTransition), info });
  }
  if (audioPath && !(await stat(join(jobDir, audioPath)).then(info => info.isFile()).catch(() => false))) throw new Error(`找不到配音文件 ${audioPath}`);

  const useClipAudio = !audioPath && clips.every(clip => clip.info.hasAudio);
  const { width, height, fps } = clips[0].info;
  const plan = clips.map(({ shot_id, run_id, head, tail, duration, transition }) => ({ shot_id, run_id, trim_head: head, trim_tail: tail, duration: Number(duration.toFixed(3)), transition_in: transition }));
  if (input.dry_run) return { dry_run: true, clips: plan, audio: audioPath, clip_audio: useClipAudio, width, height };

  const filters = [];
  clips.forEach((clip, i) => {
    const end = (clip.head + clip.duration).toFixed(3);
    filters.push(`[${i}:v]trim=start=${clip.head}:end=${end},setpts=PTS-STARTPTS,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,format=yuv420p,settb=AVTB[v${i}]`);
    if (useClipAudio) filters.push(`[${i}:a]atrim=start=${clip.head}:end=${end},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
  });
  let video = 'v0';
  let audio = 'a0';
  let total = clips[0].duration;
  for (let i = 1; i < clips.length; i += 1) {
    const fade = clips[i].transition === 'fade' ? Math.min(fadeSeconds, total - 0.05, clips[i].duration - 0.05) : 0;
    if (fade > 0.04) {
      filters.push(`[${video}][v${i}]xfade=transition=fade:duration=${fade.toFixed(3)}:offset=${(total - fade).toFixed(3)}[vx${i}]`);
      if (useClipAudio) filters.push(`[${audio}][a${i}]acrossfade=d=${fade.toFixed(3)}[ax${i}]`);
      total += clips[i].duration - fade;
    } else {
      filters.push(`[${video}][v${i}]concat=n=2:v=1:a=0[vx${i}]`);
      if (useClipAudio) filters.push(`[${audio}][a${i}]concat=n=2:v=0:a=1[ax${i}]`);
      total += clips[i].duration;
    }
    video = `vx${i}`;
    audio = `ax${i}`;
  }

  const previewDir = join(jobDir, 'renders', 'preview');
  await mkdir(previewDir, { recursive: true });
  const name = `final-${stamp()}.mp4`;
  const partial = join(previewDir, `${name}.partial.mp4`);
  const args = ['-y', '-v', 'error', ...clips.flatMap(clip => ['-i', clip.file])];
  if (audioPath) args.push('-i', join(jobDir, audioPath));
  args.push('-filter_complex', filters.join(';'), '-map', `[${video}]`);
  if (useClipAudio) args.push('-map', `[${audio}]`);
  else if (audioPath) args.push('-map', `${clips.length}:a:0`);
  args.push('-t', total.toFixed(3), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p');
  if (useClipAudio || audioPath) args.push('-c:a', 'aac', '-b:a', '192k');
  args.push('-movflags', '+faststart', partial);

  composing.add(jobId);
  try {
    await run(FFMPEG, args);
    await rename(partial, join(previewDir, name));
  } catch (error) {
    await unlink(partial).catch(() => {});
    throw error;
  } finally {
    composing.delete(jobId);
  }
  const outputFile = `renders/preview/${name}`;
  await appendJobEvent(jobsRoot, jobId, { actor: 'user', type: 'cut_composed', source: input.source || 'api', output_file: outputFile, duration: Number(total.toFixed(3)), transition: defaultTransition, fade_seconds: fadeSeconds, audio: audioPath, clip_audio: useClipAudio, clips: plan });
  return { output_file: outputFile, duration: Number(total.toFixed(3)), clips: plan, audio: audioPath, clip_audio: useClipAudio };
}
