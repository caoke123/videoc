// Delivery check for shot-plan-derived AutoDL jobs. Read-only: never submits or edits a task.
import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { validateJobFiles } from '../job-actions.mjs';
import { getJobDetail } from '../job-store.mjs';

const jobDir = resolve(process.argv[2] || '');
const jobId = basename(jobDir);
const jobsRoot = dirname(jobDir);
const errors = [];

const requestPlan = await readFile(resolve(jobDir, 'request-plan.json'), 'utf8').then(JSON.parse).catch(() => null);
if (requestPlan?.derived_from !== 'shot-plan') {
  console.error('ERROR: 该检查只适用于启用 shot-plan 派生的 AutoDL 任务');
  process.exitCode = 1;
} else {
  const check = await validateJobFiles(jobsRoot, jobId);
  errors.push(...check.errors);
  const detail = await getJobDetail(jobsRoot, jobId);
  if (!detail) errors.push('任务不存在或无法读取');
  else {
    const shots = detail.shot_plan?.shots || [];
    if (!shots.length) errors.push('shot-plan 没有镜头');
    for (const shot of shots) {
      const shotId = shot.shot_id;
      const run = detail.run_state?.shots?.[shotId];
      if (String(run?.status || '').toUpperCase() !== 'SUCCESS' || !run?.task_id) errors.push(`${shotId}：当前视频尚未生成成功`);
      else if (detail.review_status?.shots?.[shotId]?.state !== 'accepted') errors.push(`${shotId}：当前视频尚未通过人工审片`);
    }
  }
  for (const warning of check.warnings) console.warn(`WARNING: ${warning}`);
  if (errors.length) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`BATCH_OK job=${jobId} shots=${detail.shot_plan.shots.length}`);
  }
}
