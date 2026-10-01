import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvasProject, deleteCanvasProjects, getCanvasProject, updateCanvasProject, updateWorkbenchNode } from './canvas-store.mjs';
import { saveGeneratedImage, listGeneratedImages, generatedImageFile } from './generated-images.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'workbench-images-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const jobs = join(dir, 'jobs');
  await mkdir(jobs);
  await createCanvasProject(jobs, { id: 'test-canvas' });
  await updateCanvasProject(jobs, 'test-canvas', { nodes: [{ id: 'scene', type: 'image', title: '场景', position: { x: 20, y: 30 }, width: 300, height: 300, metadata: { prompt: '原提示词' } }], connections: [{ id: 'edge', fromNodeId: 'scene', toNodeId: 'video' }] });
  return jobs;
}
const images = [{ id: 'img-test', content: '/api/generated-images/img-test/file', status: 'success', naturalWidth: 1600, naturalHeight: 900, bytes: 42, mimeType: 'image/png' }];

test('图片有独立持久 ID，按相同名称保存不会覆盖，文件可恢复', async t => {
  const jobs = await fixture(t);
  const bytes = Buffer.from('image');
  const a = await saveGeneratedImage(jobs, bytes, 'image/png', { name: '主角定妆照', taskId: 'task-1' });
  const b = await saveGeneratedImage(jobs, bytes, 'image/png', { name: '主角定妆照', taskId: 'task-1' });
  assert.notEqual(a.id, b.id);
  const stored = await listGeneratedImages(jobs);
  assert.equal(stored.length, 2);
  assert.equal(stored.find(image => image.id === a.id).name, '主角定妆照');
  assert.deepEqual(await readFile((await generatedImageFile(jobs, a.id)).path), bytes);
  assert.equal(await generatedImageFile(jobs, '../outside'), null);
});

test('回填只更新图片节点，保留名称、中心、连线和其他并发字段', async t => {
  const jobs = await fixture(t);
  await updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'bind', taskId: 'task-1' });
  const [result] = await Promise.all([
    updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'complete', taskId: 'task-1', images, prompt: '新提示词' }),
    updateCanvasProject(jobs, 'test-canvas', { viewport: { x: 5, y: 6, k: 0.7 } }),
  ]);
  assert.equal(result.applied, true);
  const project = await getCanvasProject(jobs, 'test-canvas');
  const node = project.nodes[0];
  assert.equal(node.id, 'scene');
  assert.equal(node.title, '场景');
  assert.equal(node.position.x + node.width / 2, 170);
  assert.equal(node.position.y + node.height / 2, 180);
  assert.equal(node.metadata.generatedImageId, 'img-test');
  assert.equal(project.connections[0].id, 'edge');
  assert.equal(project.viewport.k, 0.7);
});

test('手动上传、新任务、删除目标时，旧结果不覆盖或重建节点', async t => {
  const jobs = await fixture(t);
  await updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'bind', taskId: 'old' });
  const project = await getCanvasProject(jobs, 'test-canvas');
  project.nodes[0].metadata.content = '/manual-upload.png';
  await updateCanvasProject(jobs, 'test-canvas', { nodes: project.nodes });
  assert.equal((await updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'complete', taskId: 'old', images })).applied, false);
  await updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'bind', taskId: 'new' });
  assert.equal((await updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'complete', taskId: 'old', images })).applied, false);
  await updateCanvasProject(jobs, 'test-canvas', { nodes: [] });
  await assert.rejects(updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'complete', taskId: 'new', images }), /不存在/);
  assert.deepEqual((await getCanvasProject(jobs, 'test-canvas')).nodes, []);
});

test('画布删除和回填并发时，不会重新创建已删除的画布', async t => {
  const jobs = await fixture(t);
  await updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'bind', taskId: 'task-1' });
  await Promise.all([
    updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'complete', taskId: 'task-1', images }),
    deleteCanvasProjects(jobs, ['test-canvas']),
  ]);
  assert.equal(await getCanvasProject(jobs, 'test-canvas'), null);
  await assert.rejects(updateWorkbenchNode(jobs, 'test-canvas', 'scene', { action: 'complete', taskId: 'task-1', images }), /不存在/);
  assert.equal(await getCanvasProject(jobs, 'test-canvas'), null);
});
