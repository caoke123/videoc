import type { FormatDefinition, JobDetail, JobSummary } from './types';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json() as Promise<T>;
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
