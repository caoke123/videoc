import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = jobsRoot => join(dirname(jobsRoot), 'generated-images');
const validId = id => /^img-[a-f0-9-]+$/.test(id);
const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

export async function saveGeneratedImage(jobsRoot, bytes, mimeType, metadata) {
  const extension = extensions[mimeType];
  if (!extension) throw new Error('不支持的图片格式');
  const id = `img-${randomUUID()}`;
  const image = { id, name: metadata.name || id, taskId: metadata.taskId || null, canvasId: metadata.canvasId || null, nodeId: metadata.nodeId || null, createdAt: new Date().toISOString(), mimeType, bytes: bytes.length, file: `${id}.${extension}` };
  await mkdir(root(jobsRoot), { recursive: true });
  await writeFile(join(root(jobsRoot), image.file), bytes);
  const manifest = join(root(jobsRoot), `${id}.json`);
  await writeFile(`${manifest}.tmp`, JSON.stringify(image));
  await rename(`${manifest}.tmp`, manifest);
  return image;
}

export async function listGeneratedImages(jobsRoot) {
  const files = await readdir(root(jobsRoot)).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  const images = await Promise.all(files.filter(file => file.endsWith('.json')).map(async file => JSON.parse(await readFile(join(root(jobsRoot), file), 'utf8'))));
  return images.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function generatedImageFile(jobsRoot, id) {
  if (!validId(id)) return null;
  const image = await readFile(join(root(jobsRoot), `${id}.json`), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  return image ? { path: join(root(jobsRoot), `${id}.${extensions[image.mimeType]}`), mimeType: image.mimeType } : null;
}
