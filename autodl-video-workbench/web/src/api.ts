import type { FormatDefinition, JobDetail, JobSummary } from './types';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function sendJson<T>(path: string, method: 'PATCH' | 'POST', body: unknown): Promise<T> {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { error?: string }).error || `${path} → HTTP ${response.status}`);
  return data as T;
}

export function listJobs(): Promise<JobSummary[]> {
  return getJson<JobSummary[]>('/api/jobs');
}

export function getJobDetail(jobId: string): Promise<JobDetail> {
  return getJson<JobDetail>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function listFormats(): Promise<FormatDefinition[]> {
  return getJson<FormatDefinition[]>('/api/formats');
}

export function patchShotPrompt(jobId: string, shotId: string, value: string): Promise<{ changed: boolean }> {
  return sendJson(`/api/jobs/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(shotId)}`, 'PATCH', { field: 'prompt', value });
}

export function submitShot(jobId: string, shotId: string, reason?: string): Promise<{ taskId: string; status: string }> {
  return sendJson(`/api/jobs/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(shotId)}/submit`, 'POST', { reason });
}
