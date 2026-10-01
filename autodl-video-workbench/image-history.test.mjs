import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listImageHistory, saveImageHistory, deleteImageHistory } from './image-history.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'image-history-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'jobs');
}
const log = { id: 'history-1', createdAt: 1, title: '镜头01', prompt: '真实车内场景', config: { model: 'test', size: '1152x2048', count: '1', background: 'opaque', apiKey: 'not-to-save' }, references: [{ id: 'ref-1', name: '主角', dataUrl: 'data:image/png;base64,aGVsbG8=' }], images: [{ id: 'img-1', dataUrl: '/api/generated-images/img-1/file' }], status: 'success' };

test('完整提示词、参数、参考图可从服务器重新读取，凭据不写入记录', async t => {
  const jobs = await fixture(t);
  await saveImageHistory(jobs, log.id, log);
  const [saved] = await listImageHistory(jobs);
  assert.equal(saved.prompt, log.prompt);
  assert.equal(saved.config.size, '1152x2048');
  assert.equal(saved.config.background, 'opaque');
  assert.deepEqual(saved.references, log.references);
  assert.deepEqual(saved.images, log.images);
  assert.equal(saved.config.apiKey, undefined);
});

test('改名和删除持久化，删除历史不影响其他记录', async t => {
  const jobs = await fixture(t);
  await saveImageHistory(jobs, log.id, log);
  await saveImageHistory(jobs, 'history-2', { ...log, id: 'history-2', createdAt: 2 });
  await saveImageHistory(jobs, log.id, { ...log, title: '中文新名称' });
  assert.equal((await listImageHistory(jobs)).find(item => item.id === log.id).title, '中文新名称');
  await deleteImageHistory(jobs, [log.id]);
  assert.deepEqual((await listImageHistory(jobs)).map(item => item.id), ['history-2']);
});

test('拒绝临时图片地址及路径越界，失败写入不覆盖已有记录', async t => {
  const jobs = await fixture(t);
  await saveImageHistory(jobs, log.id, log);
  await assert.rejects(saveImageHistory(jobs, log.id, { ...log, references: [{ dataUrl: 'blob:browser-only' }] }), /尚未持久化/);
  await assert.rejects(saveImageHistory(jobs, '../escape', { ...log, id: '../escape' }), /格式无效/);
  await assert.rejects(deleteImageHistory(jobs, ['../escape']), /无效/);
  assert.equal((await listImageHistory(jobs))[0].title, log.title);
});
