import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { getProductionJob, productionFileUrl, type ProductionJobDetail } from "@/services/api/production";

const IMAGE_MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const isImage = (path: string) => /\.(png|jpe?g|webp|gif)$/i.test(path);
const isVideo = (path: string) => /\.(mp4|webm|mov)$/i.test(path);
const norm = (value: unknown) => {
    const path = typeof value === "string" ? value : value && typeof value === "object" && "path" in value ? String((value as { path: unknown }).path) : "";
    return path ? path.replaceAll("\\", "/").replace(/^\.\//, "") : "";
};

function assetTitle(path: string) {
    const library = /^library:products\/([^/]+)\/(source|approved)\//.exec(path);
    if (library) return `产品库｜${library[1]}｜${library[2] === "approved" ? "批准安装态" : "原图"}`;
    return path.split("/").pop() || path;
}

function probeImage(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => resolve({ width: 1024, height: 1024 }), 4000);
        img.onload = () => { clearTimeout(timer); resolve({ width: img.naturalWidth || 1024, height: img.naturalHeight || 1024 }); };
        img.onerror = () => { clearTimeout(timer); resolve({ width: 1024, height: 1024 }); };
        img.src = url;
    });
}

async function fetchCanvasId(jobId: string): Promise<string> {
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/canvas-id`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.canvas_id) throw new Error(data.error || `本机执行器返回 HTTP ${response.status}`);
    return data.canvas_id as string;
}

function waitForHydration() {
    return new Promise<void>((resolve) => {
        if (useCanvasStore.getState().hydrated) return resolve();
        const unsubscribe = useCanvasStore.subscribe((state) => {
            if (!state.hydrated) return;
            unsubscribe();
            resolve();
        });
    });
}

function latestRender(detail: ProductionJobDetail, shotId: string) {
    const run = detail.run_state?.shots?.[shotId] || (shotId === "MAIN" ? detail.run_state : null);
    return typeof run?.output_file === "string" && detail.asset_files.includes(run.output_file)
        ? run.output_file
        : detail.asset_files.filter((file) => file.startsWith(`renders/runs/${shotId}/`) && isVideo(file)).sort().pop();
}

async function buildProject(canvasId: string, detail: ProductionJobDetail): Promise<CanvasProject> {
    const jobId = detail.job_id;
    const shots = detail.request_plan?.shots || (detail.request_plan?.request ? [{ shot_id: "MAIN", ...detail.request_plan.request }] : []);
    if (!shots.length) throw new Error("这个任务还没有镜头，无法生成画布");

    const assetPaths: string[] = [];
    for (const shot of shots) {
        for (const ref of Array.isArray(shot.ref_images) ? shot.ref_images : []) {
            const path = norm(ref);
            if (path && isImage(path) && !assetPaths.includes(path)) assetPaths.push(path);
        }
    }

    const sizes = await Promise.all(assetPaths.map((path) => probeImage(productionFileUrl(jobId, path))));
    const nodes: CanvasNodeData[] = [];
    let y = 0;
    assetPaths.forEach((path, index) => {
        const { width: nw, height: nh } = sizes[index];
        const width = 300;
        const height = Math.max(150, Math.min(420, Math.round((width * nh) / nw)));
        nodes.push({
            id: `asset:${path}`,
            type: CanvasNodeType.Image,
            title: assetTitle(path),
            position: { x: 0, y },
            width,
            height,
            metadata: { content: productionFileUrl(jobId, path), status: "success", naturalWidth: nw, naturalHeight: nh, bytes: 0, mimeType: IMAGE_MIME[path.split(".").pop()!.toLowerCase()] || "image/png" },
        });
        y += height + 40;
    });

    const connections: CanvasConnection[] = [];
    shots.forEach((shot, index) => {
        const shotId = String(shot.shot_id || "MAIN");
        const rendered = latestRender(detail, shotId);
        const planned = detail.shot_plan?.shots?.find((item) => String(item.shot_id || "MAIN") === shotId);
        const purpose = typeof planned?.purpose === "string" ? planned.purpose : "";
        const id = `shot-${shotId}`;
        nodes.push({
            id,
            type: CanvasNodeType.Video,
            title: purpose ? `${shotId}｜${purpose}` : shotId,
            position: { x: 420, y: index * 300 },
            width: 420,
            height: 236,
            metadata: {
                prompt: typeof shot.prompt === "string" ? shot.prompt : "",
                seconds: String(Number(shot.duration) || 6),
                videoMode: "reference",
                ...(rendered ? { content: productionFileUrl(jobId, rendered), status: "success" as const, mimeType: "video/mp4" } : {}),
            },
        });
        for (const ref of Array.isArray(shot.ref_images) ? shot.ref_images : []) {
            const path = norm(ref);
            if (path && assetPaths.includes(path)) connections.push({ id: `edge:${index}:${connections.length}`, fromNodeId: `asset:${path}`, toNodeId: id });
        }
    });

    const now = new Date().toISOString();
    const brief = detail.brief as Record<string, unknown> | null | undefined;
    const name = typeof brief?.title === "string" && brief.title ? brief.title : jobId;
    return {
        id: canvasId,
        title: `任务｜${name}`,
        createdAt: now,
        updatedAt: now,
        nodes,
        connections,
        chatSessions: [],
        activeChatId: null,
        backgroundMode: "lines" as CanvasProject["backgroundMode"],
        showImageInfo: false,
        viewport: { x: 60, y: 60, k: 0.7 },
    };
}

type CutClip = { shot_id?: string };

type BoundTask = ProductionJobDetail & { node_shots?: Record<string, string> };

/** What a task has that its canvas lacks: shots added later (with the references they need) and composed finals. Additive only. */
export function taskAdditions(existing: CanvasNodeData[], existingConnections: CanvasConnection[], detail: ProductionJobDetail): { nodes: CanvasNodeData[]; connections: CanvasConnection[] } {
    const known = new Set(existing.map((node) => node.id));
    const nodeShots = (detail as BoundTask).node_shots || {};
    const nodeOfShot = new Map(Object.entries(nodeShots).map(([nodeId, shotId]) => [shotId, nodeId]));
    const haveEdge = new Set(existingConnections.map((edge) => `${edge.fromNodeId}>${edge.toNodeId}`));
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const maxX = Math.max(0, ...existing.filter((node) => node.id.startsWith("shot-") || node.id in nodeShots).map((node) => node.position.x + node.width));
    const shotNodes = existing.filter((node) => node.id.startsWith("shot-") || node.id in nodeShots);
    let nextShotY = Math.max(-300, ...shotNodes.map((node) => node.position.y)) + 300;
    let nextAssetY = Math.max(-340, ...existing.filter((node) => node.id.startsWith("asset:")).map((node) => node.position.y + node.height)) + 40;
    for (const shot of detail.request_plan?.shots || []) {
        const shotId = String(shot.shot_id || "");
        const mapped = nodeOfShot.get(shotId);
        if (!shotId || (mapped && known.has(mapped)) || known.has(`shot-${shotId}`)) continue;
        const id = `shot-${shotId}`;
        const rendered = latestRender(detail, shotId);
        nodes.push({ id, type: CanvasNodeType.Video, title: shotId, position: { x: 420, y: nextShotY }, width: 420, height: 236, metadata: { prompt: typeof shot.prompt === "string" ? shot.prompt : "", seconds: String(Number(shot.duration) || 6), videoMode: "reference", ...(rendered ? { content: productionFileUrl(detail.job_id, rendered), status: "success" as const, mimeType: "video/mp4" } : {}) } });
        known.add(id);
        nextShotY += 300;
        for (const ref of Array.isArray(shot.ref_images) ? shot.ref_images : []) {
            const path = typeof ref === "string" ? ref : "";
            if (!path || !isImage(path)) continue;
            const assetId = `asset:${path}`;
            if (!known.has(assetId)) {
                nodes.push({ id: assetId, type: CanvasNodeType.Image, title: assetTitle(path), position: { x: 0, y: nextAssetY }, width: 300, height: 300, metadata: { content: productionFileUrl(detail.job_id, path), status: "success", naturalWidth: 1024, naturalHeight: 1024, bytes: 0, mimeType: IMAGE_MIME[path.split(".").pop()!.toLowerCase()] || "image/png" } });
                known.add(assetId);
                nextAssetY += 340;
            }
            if (!haveEdge.has(`${assetId}>${id}`)) { connections.push({ id: `edge:${assetId}:${id}`, fromNodeId: assetId, toNodeId: id }); haveEdge.add(`${assetId}>${id}`); }
        }
    }
    detail.asset_files.filter((path) => /^renders\/preview\/final-[^/]+\.mp4$/i.test(path) && !path.includes(".partial")).sort().forEach((path, index) => {
        const id = `final:${path}`;
        if (!known.has(id)) {
            const stamp = /final-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(path);
            const when = stamp ? new Date(Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6])).toLocaleString("zh-CN", { hour12: false }) : path;
            nodes.push({ id, type: CanvasNodeType.Video, title: `剪辑预览｜${when}`, position: { x: maxX + 80, y: index * 300 }, width: 420, height: 236, metadata: { content: productionFileUrl(detail.job_id, path), status: "success", mimeType: "video/mp4", seconds: "6" } });
        }
        const event = [...detail.run_log].reverse().find((entry) => entry.type === "cut_composed" && entry.output_file === path);
        for (const clip of Array.isArray(event?.clips) ? (event.clips as Array<{ shot_id?: string }>) : []) {
            const from = [nodeOfShot.get(String(clip.shot_id)), `shot-${clip.shot_id}`].find((candidate) => candidate && known.has(candidate));
            if (from && !haveEdge.has(`${from}>${id}`)) connections.push({ id: `edge:${id}:${from}`, fromNodeId: from, toNodeId: id });
        }
    });
    return { nodes, connections };
}

/** Same, applied straight to a stored canvas that is not currently open. */
export function syncTaskCanvasFinals(canvasId: string, detail: ProductionJobDetail) {
    useCanvasStore.setState((state) => {
        const project = state.projects.find((item) => item.id === canvasId);
        if (!project) return state;
        const added = taskAdditions(project.nodes, project.connections, detail);
        if (!added.nodes.length && !added.connections.length) return state;
        return { projects: state.projects.map((item) => (item.id === canvasId ? { ...item, nodes: [...item.nodes, ...added.nodes], connections: [...item.connections, ...added.connections], updatedAt: new Date().toISOString() } : item)) };
    });
}

export type ComposeOptions = { shots: Array<{ shot_id: string; trim_head: number; trim_tail: number }>; transition: "cut" | "fade"; fade_seconds: number };

/** Rough-cut the task's current shot renders with ffmpeg on the runner; the result is a new final-*.mp4 in the task. */
export async function composeTaskCut(detail: ProductionJobDetail, options: ComposeOptions) {
    const response = await fetch(`/api/jobs/${encodeURIComponent(detail.job_id)}/compose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...options, source: "task-page" }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `本机执行器返回 HTTP ${response.status}`);
    return data as { output_file: string; duration: number };
}

/** One task <-> exactly one canvas: opens the bound canvas, creating it the first time only. */
export async function openTaskCanvas(detail: ProductionJobDetail): Promise<{ canvasId: string; created: boolean }> {
    const canvasId = await fetchCanvasId(detail.job_id);
    await waitForHydration();
    if (useCanvasStore.getState().projects.some((project) => project.id === canvasId)) {
        syncTaskCanvasFinals(canvasId, (await fetchBoundTask(canvasId).catch(() => null)) || detail);
        return { canvasId, created: false };
    }
    const project = await buildProject(canvasId, detail);
    useCanvasStore.setState((state) => ({
        projects: [project, ...state.projects.filter((item) => item.id !== canvasId)],
        deletedProjects: state.deletedProjects.filter((item) => item.id !== canvasId),
    }));
    syncTaskCanvasFinals(canvasId, detail);
    return { canvasId, created: true };
}

/** The task bound to a task canvas (id task-...), or null for free canvases. */
export async function fetchBoundTask(canvasId: string): Promise<BoundTask | null> {
    if (!canvasId.startsWith("task-")) return null;
    const response = await fetch(`/api/canvas/${encodeURIComponent(canvasId)}/job`);
    if (!response.ok) return null;
    const { job_id: jobId, node_shots } = (await response.json()) as { job_id: string; node_shots?: Record<string, string> };
    return { ...(await getProductionJob(jobId)), node_shots };
}
