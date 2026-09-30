// Shared canvas project store (production/canvases/): the single durable copy of every Infinite
// Canvas project (nodes, connections, viewport, chat sessions, ...), so any browser tab or Agent
// connecting to this local runner sees and edits the same canvas instead of a per-browser local copy.

import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

export async function updateCanvasProject(jobsRoot, id, patch = {}) {
  if (!validCanvasId(id)) throw new Error('画布 id 无效');
  const current = await getCanvasProject(jobsRoot, id) || emptyProject(id, patch.title);
  const next = { ...current };
  for (const field of PROJECT_FIELDS) if (patch[field] !== undefined) next[field] = patch[field];
  next.updatedAt = new Date().toISOString();
  await writeProjectFile(jobsRoot, next);
  return next;
}

export async function deleteCanvasProjects(jobsRoot, ids) {
  const dir = canvasesRoot(jobsRoot);
  await Promise.all((Array.isArray(ids) ? ids : []).filter(validCanvasId).map(id => unlink(join(dir, `${id}.json`)).catch(() => {})));
}
