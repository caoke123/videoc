// Backup/restore for custom prompt-library sources: same pattern as channel-config.mjs, but no
// secrets involved (just name/url/homepage), so no extra care beyond staying out of git is needed.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const backupPath = jobsRoot => join(dirname(jobsRoot), 'config', 'prompt-sources.json');

export async function getPromptSourceBackup(jobsRoot) {
  return readFile(backupPath(jobsRoot), 'utf8').then(raw => JSON.parse(raw)).catch(() => null);
}

export async function savePromptSourceBackup(jobsRoot, sources) {
  if (!Array.isArray(sources)) throw new Error('sources 必须是数组');
  const target = backupPath(jobsRoot);
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await writeFile(tmp, JSON.stringify({ sources, savedAt: new Date().toISOString() }));
  await rename(tmp, target);
  return { ok: true };
}
