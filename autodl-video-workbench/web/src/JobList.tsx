import { useEffect, useState } from 'react';
import { listJobs } from './api';
import type { JobSummary } from './types';

const STATUS_LABEL: Record<string, string> = {
  success: '完成', running: '进行中', failed: '失败', awaiting_review: '待审核'
};

export default function JobList({ onOpen }: { onOpen: (jobId: string) => void }) {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listJobs().then(setJobs).catch(err => setError(err.message));
  }, []);

  if (error) return <div className="panel-error">任务列表读取失败：{error}</div>;
  if (!jobs) return <div className="panel-loading">加载任务历史…</div>;

  return (
    <div className="job-list">
      <h1>任务历史</h1>
      <p className="job-list-hint">共 {jobs.length} 个批次，来自 production/jobs/</p>
      <ul>
        {jobs.map(job => (
          <li key={job.job_id} className="job-card" onClick={() => onOpen(job.job_id)}>
            <div className="job-card-title">{job.title}</div>
            <div className="job-card-meta">
              <span className={`status-pill status-${(job.status || 'unknown').toLowerCase()}`}>{STATUS_LABEL[job.status || ''] || job.status || '无状态记录'}</span>
              {job.format_id && <span className="format-pill">{job.format_id}</span>}
              {job.shot_count != null && <span>{job.shot_count} 镜头</span>}
              <span className="job-card-date">{job.updated_at?.slice(0, 10) || ''}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
