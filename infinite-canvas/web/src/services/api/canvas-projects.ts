import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { persistMediaReferences } from "@/services/persistent-media";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    return data as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const snapshots = new Map<string, CanvasProject>();
const writes = new Map<string, Promise<CanvasProject>>();
function remember(project: CanvasProject) { snapshots.set(project.id, project); return project; }

// Keep this tab's unsaved edits while accepting unrelated changes from another browser.
export function mergeCanvasItems<T extends { id: string }>(before: T[], local: T[], remote: T[]): T[] {
    const baseline = new Map(before.map(item => [item.id, JSON.stringify(item)]));
    const merged = new Map(remote.map(item => [item.id, item]));
    for (const item of local) if (baseline.get(item.id) !== JSON.stringify(item)) merged.set(item.id, item);
    const localIds = new Set(local.map(item => item.id));
    for (const item of before) if (!localIds.has(item.id)) merged.delete(item.id);
    return [...merged.values()];
}

export const listCanvasProjects = async () => (await request<CanvasProject[]>("/api/canvases")).map(remember);

export const fetchCanvasProject = (id: string, options?: { create?: boolean }) => {
    const query = options?.create ? "?create=1" : "";
    return request<CanvasProject>(`/api/canvases/${encodeURIComponent(id)}${query}`).then(remember);
};

export type RunnerGeneration = { shot_id: string; status: string; error: string | null; video_url: string | null };
export const fetchCanvasGenerations = async (canvasId: string, nodeIds: string[]) => {
    const query = new URLSearchParams({ canvas_id: canvasId });
    for (const id of nodeIds) query.append("node_id", id);
    return (await request<{ nodes: Record<string, RunnerGeneration> }>(`/api/canvas/generations?${query}`)).nodes;
};

export const createCanvasProject = (title?: string) => request<CanvasProject>("/api/canvases", jsonInit("POST", { title }));

export const updateCanvasProject = async (id: string, patch: Record<string, unknown>, clientId: string) => {
    const previous = snapshots.get(id);
    const changes = { ...patch };
    const listChanges: Record<string, { upserts: unknown[]; removed: string[] }> = {};
    for (const field of ["nodes", "connections", "chatSessions"] as const) {
        if (!previous || !Array.isArray(patch[field])) continue;
        const before = new Map(previous[field].map(item => [item.id, JSON.stringify(item)]));
        const items = patch[field] as Array<{ id: string }>;
        listChanges[field] = { upserts: items.filter(item => before.get(item.id) !== JSON.stringify(item)), removed: previous[field].filter(item => !items.some(next => next.id === item.id)).map(item => item.id) };
        delete changes[field];
    }
    const pending = (writes.get(id) || Promise.resolve()).catch(() => undefined).then(async () =>
        request<CanvasProject>(`/api/canvases/${encodeURIComponent(id)}`, jsonInit("PATCH", { ...await persistMediaReferences({ ...changes, listChanges }), clientId })).then(remember));
    writes.set(id, pending);
    const cleanup = () => { if (writes.get(id) === pending) writes.delete(id); };
    void pending.then(cleanup, cleanup);
    return pending;
};

export const deleteCanvasProjects = (ids: string[]) => request<{ ok: boolean }>("/api/canvases", jsonInit("DELETE", { ids }));

// Live push: other tabs/Agents editing the same canvas show up without polling. Ignores broadcasts
// that echo this same client's own writes (the local edit is already applied optimistically).
// `onDeleted` fires when someone deletes this canvas elsewhere, so an open tab can leave immediately
// instead of its next autosave re-creating the file (the server upserts a write to a missing id).
export function subscribeCanvasProject(id: string, clientId: string, onUpdate: (project: CanvasProject) => void, onDeleted?: () => void) {
    const source = new EventSource(`/api/canvases/${encodeURIComponent(id)}/events`);
    source.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data) as { project: CanvasProject; sourceClientId: string | null };
            remember(payload.project);
            if (payload.sourceClientId === clientId) return;
            onUpdate(payload.project);
        } catch {
            // ignore malformed events
        }
    };
    if (onDeleted) source.addEventListener("canvas_deleted", () => onDeleted());
    return () => source.close();
}
