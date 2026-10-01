import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = jobsRoot => join(dirname(jobsRoot), 'canvas-storage');
const hash = value => createHash('sha256').update(value).digest('hex');
const collections = new Set(['assets', 'video-history', 'video-task-results', 'prompt-sources']);
const writes = new Map();
const read = path => readFile(path, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
async function atomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value));
  await rename(temp, path);
}
function serial(path, action) {
  const pending = (writes.get(path) || Promise.resolve()).catch(() => {}).then(action);
  writes.set(path, pending);
  void pending.finally(() => { if (writes.get(path) === pending) writes.delete(path); }).catch(() => {});
  return pending;
}
function recordDir(jobsRoot, collection) {
  if (!collections.has(collection)) throw new Error('无效的数据集合');
  return join(root(jobsRoot), collection);
}
export function assertPersistentReferences(value) {
  if (typeof value === 'string' && value.startsWith('blob:')) throw new Error('文件仍是浏览器临时地址，请先将原文件保存到服务端');
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(assertPersistentReferences);
}
export async function saveMediaFile(jobsRoot, key, bytes, mimeType) {
  if (typeof key !== 'string' || !/^[\w:-]+$/.test(key) || !bytes.length) throw new Error('文件标识或内容无效');
  const dir = join(root(jobsRoot), 'files');
  const id = hash(key);
  return serial(join(dir, id), async () => {
    await mkdir(dir, { recursive: true });
    const file = `${id}-${hash(bytes)}.bin`;
    await writeFile(join(dir, file), bytes);
    const metadata = { key, file, mimeType: mimeType || 'application/octet-stream', bytes: bytes.length };
    await atomic(join(dir, `${id}.json`), metadata);
    return { ...metadata, url: `/api/media-files/${encodeURIComponent(key)}` };
  });
}
export async function mediaFile(jobsRoot, key) {
  const dir = join(root(jobsRoot), 'files');
  const metadata = await read(join(dir, `${hash(key)}.json`));
  return metadata ? { path: join(dir, metadata.file), mimeType: metadata.mimeType } : null;
}
export async function listRecords(jobsRoot, collection) {
  const dir = recordDir(jobsRoot, collection);
  const names = await readdir(dir).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const records = await Promise.all(names.filter(name => name.endsWith('.json')).map(name => read(join(dir, name))));
  return { items: records.filter(record => record && !record.deleted).map(record => record.value), deletedIds: records.filter(record => record?.deleted).map(record => record.id) };
}
export async function saveRecord(jobsRoot, collection, id, value, deleted = false) {
  if (!id || typeof id !== 'string') throw new Error('记录 ID 无效');
  assertPersistentReferences(value);
  const path = join(recordDir(jobsRoot, collection), `${hash(id)}.json`);
  return serial(path, async () => {
    const previous = await read(path);
    await atomic(path, { id, deleted, value: deleted ? previous?.value : value, updatedAt: new Date().toISOString() });
    return { ok: true };
  });
}
export async function getRecord(jobsRoot, collection, id) {
  const record = await read(join(recordDir(jobsRoot, collection), `${hash(id)}.json`));
  return record && !record.deleted ? record.value : null;
}
