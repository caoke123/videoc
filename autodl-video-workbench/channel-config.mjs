// Shared AI provider channels (name/baseUrl/apiKey/models). Browser changes are upserted by ID;
// explicit deletion metadata prevents stale browsers from restoring deleted channels on startup.
// production/config/ is where autodl.env already keeps a local secret the same way; this file is
// gitignored for the same reason (real API keys).

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const configPath = jobsRoot => join(dirname(jobsRoot), 'config', 'channels.json');

export async function getChannelBackup(jobsRoot) {
  return readFile(configPath(jobsRoot), 'utf8').then(raw => JSON.parse(raw)).catch(() => null);
}

const writes = new Map();
export async function saveChannelBackup(jobsRoot, channels, deletedIds = []) {
  if (!Array.isArray(channels)) throw new Error('channels 必须是数组');
  if (!Array.isArray(deletedIds)) throw new Error('deletedIds 必须是数组');
  const target = configPath(jobsRoot);
  const pending = (writes.get(target) || Promise.resolve()).catch(() => {}).then(async () => {
    const previous = await getChannelBackup(jobsRoot);
    const removed = new Set([...(previous?.deletedIds || []), ...deletedIds]);
    const merged = new Map((previous?.channels || []).map(channel => [channel.id, channel]));
    for (const id of deletedIds) merged.delete(id);
    for (const channel of channels) {
      if (!channel?.id) throw new Error('渠道缺少 ID');
      merged.set(channel.id, channel);
      removed.delete(channel.id);
    }
    const data = { channels: [...merged.values()], deletedIds: [...removed], savedAt: new Date().toISOString() };
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, target);
    return data;
  });
  writes.set(target, pending);
  try { return await pending; }
  finally { if (writes.get(target) === pending) writes.delete(target); }
}
