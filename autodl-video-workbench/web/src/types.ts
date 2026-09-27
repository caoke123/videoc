// Mirrors the JSON shapes produced by autodl-video-workbench/job-store.mjs.
// Kept deliberately permissive (nullable/optional) because job schema
// drifts across older batches — see job-store.mjs's tolerant-read comments.

export interface FormatDefinition {
  format_id: string;
  name: string;
  status: 'active' | 'draft' | string;
  profile: string;
  layout: 'sequential' | 'grid-3x3' | string;
  node_count?: number;
}

export interface JobSummary {
  job_id: string;
  title: string;
  category_id: string | null;
  format_id: string | null;
  status: string | null;
  shot_count: number | null;
  has_brief: boolean;
  has_shot_plan: boolean;
  updated_at: string | null;
}

export interface ShotPlanEntry {
  shot_id: string;
  start_seconds?: number;
  end_seconds?: number;
  purpose?: string;
  dialogue?: string;
  camera?: string;
  references?: string[];
  status?: string;
  [key: string]: unknown;
}

export interface RunLogEntry {
  time: string;
  shot_id?: string;
  run_id?: string;
  workflow_id?: string;
  status?: string;
  actor?: 'user' | string;
  type?: 'prompt_edit' | 'manual_submit' | string;
  field?: string;
  before?: string;
  after?: string;
  reason?: string | null;
  error?: string;
  [key: string]: unknown;
}

export interface RequestPlanShot {
  shot_id: string;
  prompt: string;
  duration?: number;
  seed?: number;
  ref_images?: string[];
  [key: string]: unknown;
}

export interface RequestPlan {
  workflow_id?: string;
  shots?: RequestPlanShot[];
  request?: RequestPlanShot & { ref_audio_0?: string };
  [key: string]: unknown;
}

export interface JobDetail {
  job_id: string;
  format_id: string | null;
  brief: Record<string, unknown> | null;
  shot_plan: { schema_version?: number; shots: ShotPlanEntry[] } | null;
  request_plan: RequestPlan | null;
  review: Record<string, unknown> | null;
  run_state: Record<string, unknown> | null;
  run_log: RunLogEntry[];
  status: string | null;
  assets: Record<string, string[]>;
  renders: Record<string, string[]>;
  top_level_files: string[];
  top_level_dirs: string[];
}
