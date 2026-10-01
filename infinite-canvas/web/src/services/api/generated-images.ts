import { getImageBlob } from "@/services/image-storage";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CanvasNodeImage } from "@/types/canvas";

export type GeneratedImageRecord = {
    id: string;
    name: string;
    taskId: string | null;
    canvasId: string | null;
    nodeId: string | null;
    createdAt: string;
    mimeType: string;
    bytes: number;
};
export type WorkbenchTarget = { canvasId: string; nodeId: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `请求失败（HTTP ${response.status}）`);
    return data as T;
}

export const generatedImageUrl = (id: string) => `/api/generated-images/${encodeURIComponent(id)}/file`;
export const listGeneratedImages = () => request<GeneratedImageRecord[]>("/api/generated-images");

async function resolveGeneratedImageBlob(image: { dataUrl: string; storageKey?: string }): Promise<Blob> {
    const blob = image.storageKey ? await getImageBlob(image.storageKey) : null;
    if (blob) return blob;
    const response = await fetch(image.dataUrl);
    if (!response.ok) throw new Error("无法读取生成图片");
    return response.blob();
}

export async function registerGeneratedImage(image: { dataUrl: string; storageKey?: string }, metadata: { name: string; taskId?: string; canvasId?: string; nodeId?: string }) {
    const content = await resolveGeneratedImageBlob(image);
    const query = new URLSearchParams(Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    return request<GeneratedImageRecord>(`/api/generated-images?${query}`, { method: "POST", headers: { "Content-Type": content.type }, body: content });
}

export function updateWorkbenchTarget(target: WorkbenchTarget, taskId: string, action: "bind" | "complete", images?: CanvasNodeImage[], prompt?: string) {
    return request<{ applied: boolean; project: CanvasProject }>(`/api/canvases/${encodeURIComponent(target.canvasId)}/nodes/${encodeURIComponent(target.nodeId)}/workbench`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, taskId, images, prompt }),
    });
}
