import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "@/types/canvas";
import { useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";
import { productionFileUrl, type ProductionJobDetail } from "@/services/api/production";

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
        const runs = detail.run_state?.shots?.[shotId] || (shotId === "MAIN" ? detail.run_state : null);
        const rendered = typeof runs?.output_file === "string" && detail.asset_files.includes(runs.output_file)
            ? runs.output_file
            : detail.asset_files.filter((file) => file.startsWith(`renders/runs/${shotId}/`) && isVideo(file)).sort().pop();
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

/** One task <-> exactly one canvas: opens the bound canvas, creating it the first time only. */
export async function openTaskCanvas(detail: ProductionJobDetail): Promise<{ canvasId: string; created: boolean }> {
    const canvasId = await fetchCanvasId(detail.job_id);
    await waitForHydration();
    if (useCanvasStore.getState().projects.some((project) => project.id === canvasId)) return { canvasId, created: false };
    const project = await buildProject(canvasId, detail);
    useCanvasStore.setState((state) => ({
        projects: [project, ...state.projects.filter((item) => item.id !== canvasId)],
        deletedProjects: state.deletedProjects.filter((item) => item.id !== canvasId),
    }));
    return { canvasId, created: true };
}
