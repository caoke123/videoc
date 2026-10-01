import localforage from "localforage";
import { saveMediaBlob, mediaFileUrl } from "@/services/api/shared-storage";

let running: Promise<{ files: number; canvases: number }> | undefined;
export function recoverBrowserFiles() {
    return running ||= recover().catch(error => { running = undefined; throw error; });
}
async function recover() {
    const available = new Set<string>();
    let files = 0;
    for (const storeName of ["image_files", "media_files"]) {
        const store = localforage.createInstance({ name: "infinite-canvas", storeName });
        for (const key of await store.keys()) {
            const response = await fetch(mediaFileUrl(key), { method: "HEAD" });
            if (response.status === 404) {
                const blob = await store.getItem<Blob>(key);
                if (!blob) continue;
                await saveMediaBlob(key, blob);
                files++;
            } else if (!response.ok) throw new Error("读取服务端文件状态失败");
            available.add(key);
        }
    }
    const repair = (value: unknown): unknown => {
        if (!value || typeof value !== "object") return value;
        if (Array.isArray(value)) return value.map(repair);
        const item = value as Record<string, unknown>;
        const next = Object.fromEntries(Object.entries(item).map(([key, child]) => [key, repair(child)]));
        if (typeof item.storageKey === "string" && available.has(item.storageKey)) {
            for (const key of ["content", "dataUrl", "url", "coverUrl", "workbenchSourceContent"]) {
                if (typeof item[key] === "string" && (item[key] as string).startsWith("blob:")) next[key] = mediaFileUrl(item.storageKey);
            }
        }
        return next;
    };
    const api = await import("@/services/api/canvas-projects");
    let canvases = 0;
    for (const project of await api.listCanvasProjects()) {
        const restored = repair(project) as typeof project;
        if (JSON.stringify(restored) === JSON.stringify(project)) continue;
        await api.updateCanvasProject(project.id, { nodes: restored.nodes, chatSessions: restored.chatSessions }, "browser-file-recovery");
        canvases++;
    }
    return { files, canvases };
}
