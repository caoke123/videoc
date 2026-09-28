// Adds the "AutoDL (local runner)" video channel to an infinite-canvas config you exported yourself
// (配置 → 导出配置). Importing a config replaces everything, so this keeps your other channels,
// keys and settings and only adds/updates this one channel.
//
//   node merge-channel.mjs infinite-canvas-config.json [output.json]
//
// Then import the output via 配置 → 导入配置. The channel carries no secret: the AutoDL token
// stays in production/config/autodl.env on this machine.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHANNEL_ID = 'autodl-local-runner';
const MODEL_NAME = 'AutoDL-H3';
const [input, output = 'infinite-canvas-config.autodl.json'] = process.argv.slice(2);
if (!input) { console.error('用法：node merge-channel.mjs <导出的配置.json> [输出.json]'); process.exit(1); }

const script = (await readFile(join(dirname(fileURLToPath(import.meta.url)), 'video-script.js'), 'utf8')).trim();
const file = JSON.parse(await readFile(input, 'utf8'));
if (file.app !== 'infinite-canvas' || file.version !== 1 || !file.config || !Array.isArray(file.config.channels)) throw new Error('不是无限画布导出的配置文件');

const removed = file.config.channels.filter(channel => /autodl\.art/i.test(channel.baseUrl || ''));
file.config.channels = file.config.channels.filter(channel => channel.id !== CHANNEL_ID && !removed.includes(channel));
file.config.channels.push({
  id: CHANNEL_ID,
  name: 'AutoDL（本机执行器）',
  baseUrl: 'http://127.0.0.1:4173',
  apiKey: 'local-runner', // placeholder: the app requires a non-empty key; the script never sends it anywhere
  apiFormat: 'openai',
  models: [{ name: MODEL_NAME, capability: 'video', script }],
});
file.config.videoModel = MODEL_NAME;
file.exportedAt = new Date().toISOString();

await writeFile(output, JSON.stringify(file, null, 2));
console.log(`已写入 ${output}：新增渠道 “AutoDL（本机执行器）”，默认视频模型 ${MODEL_NAME}。`);
if (removed.length) console.log(`已移除旧的浏览器直连渠道：${removed.map(channel => channel.name).join('、')}（它把 Token 存在浏览器里）。`);
