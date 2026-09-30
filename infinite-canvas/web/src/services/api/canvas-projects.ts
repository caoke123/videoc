import type { CanvasProject } from "@/stores/canvas/use-canvas-store";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    return data as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const listCanvasProjects = () => request<CanvasProject[]>("/api/canvases");

export const fetchCanvasProject = (id: string, options?: { create?: boolean }) => {
    const query = options?.create ? "?create=1" : "";
    return request<CanvasProject>(`/api/canvases/${encodeURIComponent(id)}${query}`);
};

export const createCanvasProject = (title?: string) => request<CanvasProject>("/api/canvases", jsonInit("POST", { title }));

export const updateCanvasProject = (id: string, patch: Record<string, unknown>, clientId: string) =>
    request<CanvasProject>(`/api/canvases/${encodeURIComponent(id)}`, jsonInit("PATCH", { ...patch, clientId }));

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
            if (payload.sourceClientId === clientId) return;
            onUpdate(payload.project);
        } catch {
            // ignore malformed events
        }
    };
    if (onDeleted) source.addEventListener("canvas_deleted", () => onDeleted());
    return () => source.close();
}
