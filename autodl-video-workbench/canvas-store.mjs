// Shared canvas project store (production/canvases/): the single durable copy of every Infinite
// Canvas project (nodes, connections, viewport, chat sessions, ...), so any browser tab or Agent
// connecting to this local runner sees and edits the same canvas instead of a per-browser local copy.

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertPersistentReferences } from './shared-storage.mjs';

export const canvasesRoot = jobsRoot => join(dirname(jobsRoot), 'canvases');

const PROJECT_FIELDS = ['title', 'nodes', 'connections', 'chatSessions', 'activeChatId', 'backgroundMode', 'showImageInfo', 'viewport'];

export const validCanvasId = value => typeof value === 'string' && /^[\p{L}\p{N}._-]+$/u.test(value) && !value.includes('..');

function emptyProject(id, title) {
  const now = new Date().toISOString();
  return { id, title: title || '未命名画布', createdAt: now, updatedAt: now, nodes: [], connections: [], chatSessions: [], activeChatId: null, backgroundMode: 'dot', showImageInfo: true, viewport: { x: 0, y: 0, k: 1 } };
}

async function writeProjectFile(jobsRoot, project) {
  const dir = canvasesRoot(jobsRoot);
  await mkdir(dir, { recursive: true });
  const target = join(dir, `${project.id}.json`);
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(project));
  await rename(tmp, target);
}

export async function listCanvasProjects(jobsRoot) {
  const dir = canvasesRoot(jobsRoot);
  const files = await readdir(dir).catch(() => []);
  const projects = await Promise.all(
    files.filter(name => name.endsWith('.json')).map(name => readFile(join(dir, name), 'utf8').then(raw => JSON.parse(raw)).catch(() => null)),
  );
  return projects.filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCanvasProject(jobsRoot, id) {
  if (!validCanvasId(id)) return null;
  return readFile(join(canvasesRoot(jobsRoot), `${id}.json`), 'utf8').then(raw => JSON.parse(raw)).catch(() => null);
}

export async function createCanvasProject(jobsRoot, { title, id } = {}) {
  const project = emptyProject(id && validCanvasId(id) ? id : randomUUID(), title);
  await writeProjectFile(jobsRoot, project);
  return project;
}

// Task-bound canvases (id = canvasIdForJob(jobId)) are created on first open, not via the normal
// "new canvas" flow; this returns the existing project untouched or creates an empty one.
export async function getOrCreateCanvasProject(jobsRoot, id, { title } = {}) {
  const existing = await getCanvasProject(jobsRoot, id);
  if (existing) return existing;
  return createCanvasProject(jobsRoot, { id, title });
}

const writes = new Map();
function serializeWrite(jobsRoot, id, action) {
  const key = join(canvasesRoot(jobsRoot), id);
  const pending = (writes.get(key) || Promise.resolve()).catch(() => {}).then(action);
  writes.set(key, pending);
  void pending.finally(() => { if (writes.get(key) === pending) writes.delete(key); }).catch(() => {});
  return pending;
}

export function updateCanvasProject(jobsRoot, id, patch = {}) {
  return serializeWrite(jobsRoot, id, () => writeCanvasProject(jobsRoot, id, patch));
}

async function writeCanvasProject(jobsRoot, id, patch = {}) {
  assertPersistentReferences(patch);
  if (!validCanvasId(id)) throw new Error('画布 id 无效');
  const current = await getCanvasProject(jobsRoot, id) || emptyProject(id, patch.title);
  const next = { ...current };
  for (const field of PROJECT_FIELDS) if (patch[field] !== undefined) next[field] = patch[field];
  for (const [field, change] of Object.entries(patch.listChanges || {})) {
    if (!['nodes', 'connections', 'chatSessions'].includes(field) || !Array.isArray(change.upserts) || !Array.isArray(change.removed)) throw new Error('画布增量数据无效');
    const items = new Map((next[field] || []).map(item => [item.id, item]));
    for (const id of change.removed) items.delete(id);
    for (const item of change.upserts) items.set(item.id, item);
    next[field] = [...items.values()];
  }
  next.updatedAt = new Date().toISOString();
  await writeProjectFile(jobsRoot, next);
  return next;
}

// Only touch the target node; stale tasks must never replace a manual upload or a newer task.
export function updateWorkbenchNode(jobsRoot, id, nodeId, body) {
  return serializeWrite(jobsRoot, id, async () => {
    const project = await getCanvasProject(jobsRoot, id);
    const node = project?.nodes.find(node => node.id === nodeId);
    if (!node || node.type !== 'image') throw new Error('目标图片节点不存在');
    const metadata = node.metadata || {};
    if (body.action === 'bind') {
      node.metadata = { ...metadata, workbenchTaskId: body.taskId, workbenchSourceContent: metadata.content || '' };
    } else {
      if (metadata.workbenchTaskId !== body.taskId || (metadata.content || '') !== metadata.workbenchSourceContent) return { applied: false, project };
      if (!Array.isArray(body.images) || !body.images.length) throw new Error('没有可回填的图片');
      const image = body.images[0];
      node.metadata = { ...metadata, content: image.content, storageKey: undefined, status: 'success', errorDetails: undefined, images: body.images, count: body.images.length, primaryImageId: image.id, generatedImageId: image.id, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, bytes: image.bytes, mimeType: image.mimeType, prompt: body.prompt, workbenchSourceContent: image.content };
      if (!metadata.freeResize && image.naturalWidth && image.naturalHeight) {
        const scale = Math.min(node.width / image.naturalWidth, node.height / image.naturalHeight);
        const width = image.naturalWidth * scale, height = image.naturalHeight * scale;
        node.position = { x: node.position.x + (node.width - width) / 2, y: node.position.y + (node.height - height) / 2 };
        node.width = width; node.height = height;
      }
    }
    return { applied: true, project: await writeCanvasProject(jobsRoot, id, { nodes: project.nodes }) };
  });
}

export async function deleteCanvasProjects(jobsRoot, ids) {
  const dir = canvasesRoot(jobsRoot);
  await Promise.all((Array.isArray(ids) ? ids : []).filter(validCanvasId).map(id => serializeWrite(jobsRoot, id, () => unlink(join(dir, `${id}.json`)).catch(() => {}))));
}
