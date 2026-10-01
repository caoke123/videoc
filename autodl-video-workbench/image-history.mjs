import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = jobsRoot => join(dirname(jobsRoot), 'image-history');
const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id);
const fields = ['id', 'createdAt', 'title', 'prompt', 'time', 'model', 'config', 'references', 'durationMs', 'successCount', 'failCount', 'imageCount', 'size', 'quality', 'status', 'images', 'error'];
const configFields = ['model', 'imageModel', 'quality', 'size', 'count', 'background', 'systemPrompt', 'apiFormat', 'baseUrl'];

export async function listImageHistory(jobsRoot) {
  const names = await readdir(root(jobsRoot)).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const logs = await Promise.all(names.filter(name => name.endsWith('.json')).map(async name => JSON.parse(await readFile(join(root(jobsRoot), name), 'utf8'))));
  return logs.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveImageHistory(jobsRoot, id, source) {
  if (!validId(id) || source.id !== id || typeof source.prompt !== 'string' || !Array.isArray(source.references) || !Array.isArray(source.images)) throw new Error('生成记录格式无效');
  // History must be self-contained or point at persistent server files, never browser object URLs.
  for (const image of [...source.references, ...source.images]) {
    if (typeof image.dataUrl !== 'string' || !(image.dataUrl.startsWith('data:image/') || /^\/(api|prompts)\//.test(image.dataUrl))) throw new Error('生成记录图片尚未持久化');
  }
  const log = Object.fromEntries(fields.filter(field => source[field] !== undefined).map(field => [field, source[field]]));
  log.config = Object.fromEntries(configFields.filter(field => source.config?.[field] !== undefined).map(field => [field, source.config[field]]));
  await mkdir(root(jobsRoot), { recursive: true });
  const file = join(root(jobsRoot), `${id}.json`);
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(log));
  await rename(temp, file);
  return log;
}

export async function deleteImageHistory(jobsRoot, ids) {
  if (!Array.isArray(ids) || !ids.every(validId)) throw new Error('生成记录 ID 无效');
  await Promise.all(ids.map(id => unlink(join(root(jobsRoot), `${id}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; })));
}
