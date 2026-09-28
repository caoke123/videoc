export type ProductionFormat = { format_id: string; pipeline_id?: string; name: string; status: string; layout?: string; node_count?: number; media_type?: "image" | "video"; workflow_id?: string | null };
export type ProductionCategory = { category_id: string; name: string; status: string };
export type ProductionReview = { shots: Record<string, { state: "pending" | "accepted" | "rejected"; category?: string | null; note?: string | null }>; pending: number; accepted: number; rejected: number };
export type ProductionJob = { job_id: string; title: string; category_id: string | null; format_id: string | null; status: string | null; shot_count: number | null; updated_at: string | null; review?: ProductionReview };
export type ProductionNode = { id: string; kind: "asset" | "shot" | "render"; title: string; x: number; y: number; shotId?: string; path?: string; status?: string };
export type ProductionConnection = { id: string; from: string; to: string };
export type ProductionLayout = { nodes: ProductionNode[]; connections: ProductionConnection[] };
export type ProductionBatchPlan = { shotIds: string[]; skipped: string[]; warnings?: string[] };
export type ProductionBatchResult = { submitted: Array<{ shotId: string; taskId: string; status: string }>; skipped: string[]; failed?: { shotId: string; error: string }; remaining?: string[] };
export type ProductionJobDetail = {
    job_id: string;
    format_id: string | null;
    brief: Record<string, unknown> | null;
    shot_plan: { shots?: Array<Record<string, unknown>> } | null;
    request_plan: { media_type?: "image" | "video"; workflow_id?: string | null; resolution?: string; preparation_status?: string; shots?: Array<Record<string, unknown>>; request?: Record<string, unknown> } | null;
    run_state: { status?: string; shots?: Record<string, Record<string, unknown>>; [key: string]: unknown } | null;
    run_log: Array<Record<string, unknown>>;
    canvas_layout: ProductionLayout | null;
    status: string | null;
    review_status?: ProductionReview;
    asset_files: string[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    return data as T;
}

export const listProductionJobs = () => request<ProductionJob[]>("/api/jobs");
export const listProductionFormats = () => request<ProductionFormat[]>("/api/formats");
export const listProductionCategories = () => request<ProductionCategory[]>("/api/categories");
export const getProductionJob = (jobId: string) => request<ProductionJobDetail>(`/api/jobs/${encodeURIComponent(jobId)}`);
export const getProductionRunLog = (jobId: string) => request<Array<Record<string, unknown>>>(`/api/jobs/${encodeURIComponent(jobId)}/run-log`);
export const createProductionJob = (body: { title: string; categoryId: string; formatId: string }) => request<{ job_id: string }>("/api/jobs", { method: "POST", body: JSON.stringify(body) });
export const saveProductionLayout = (jobId: string, layout: ProductionLayout) => request<{ changed: boolean }>(`/api/jobs/${encodeURIComponent(jobId)}/canvas`, { method: "PATCH", body: JSON.stringify(layout) });
export const saveProductionPrompt = (jobId: string, shotId: string, prompt: string) => request(`/api/jobs/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(shotId)}`, { method: "PATCH", body: JSON.stringify({ field: "prompt", value: prompt }) });
export const submitProductionShot = (jobId: string, shotId: string) => request<{ taskId: string; status: string }>(`/api/jobs/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(shotId)}/submit`, { method: "POST", body: JSON.stringify({ reason: "Infinite Canvas 手动重新生成" }) });
export const publishProductionAudio = (jobId: string, shotId: string) => request<{ urls: string[] }>(`/api/jobs/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(shotId)}/publish-audio`, { method: "POST", body: JSON.stringify({}) });
export const preflightProductionBatch = (jobId: string) => request<ProductionBatchPlan>(`/api/jobs/${encodeURIComponent(jobId)}/submit-batch`, { method: "POST", body: JSON.stringify({ dry_run: true }) });
export const submitProductionBatch = (jobId: string) => request<ProductionBatchResult>(`/api/jobs/${encodeURIComponent(jobId)}/submit-batch`, { method: "POST", body: JSON.stringify({}) });
export const uploadProductionAsset = async (jobId: string, file: File, shotId?: string) => {
    const query = new URLSearchParams({ name: file.name });
    if (shotId) query.set("shotId", shotId);
    return request<{ asset_path: string; shot_id: string | null }>(`/api/jobs/${encodeURIComponent(jobId)}/assets?${query}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
};
export const reviewProductionShot = (jobId: string, shotId: string, body: { decision: "accepted" | "rejected"; category?: string; note?: string }) => request<{ recorded: string }>(`/api/jobs/${encodeURIComponent(jobId)}/shots/${encodeURIComponent(shotId)}/review`, { method: "POST", body: JSON.stringify(body) });
export const productionFileUrl = (jobId: string, path: string) => `/api/jobs/${encodeURIComponent(jobId)}/files/${encodeURIComponent(path)}`;
