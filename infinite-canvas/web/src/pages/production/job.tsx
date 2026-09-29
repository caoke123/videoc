import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { App, Button, Checkbox, Empty, Input, InputNumber, Modal, Select, Spin, Tag } from "antd";
import { ArrowLeft, Check, CloudUpload, Copy, ExternalLink, Film, LibraryBig, Pencil, RefreshCw, Upload, WandSparkles, X } from "lucide-react";

import { ConnectionPath } from "@/components/canvas/canvas-connections";
import { InfiniteCanvas } from "@/components/canvas/infinite-canvas";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "@/types/canvas";
import { canvasThemes } from "@/lib/canvas-theme";
import { useCopyText } from "@/hooks/use-copy-text";
import { composeTaskCut, fetchBoundTask, openTaskCanvas, syncTaskCanvasFinals } from "@/lib/production-canvas";
import { LIBRARY_CATEGORY_OPTIONS } from "@/services/api/library";
import { useThemeStore } from "@/stores/use-theme-store";
import { getProductionJob, preflightProductionBatch, productionFileUrl, promoteProductionAsset, publishProductionAudio, renameProductionJob, resolveProductionSubmit, resumeProductionPolling, reviewProductionShot, submitProductionBatch, uploadProductionAsset, type ProductionConnection, type ProductionJobDetail, type ProductionLayout, type ProductionNode } from "@/services/api/production";

const defaultViewport: ViewportTransform = { x: 260, y: 180, k: 0.65 };

function fileLabel(path: string) { return path.split("/").pop() || path; }
function mediaKind(path: string) {
    const ext = path.split(".").pop()?.toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext || "")) return "image";
    if (["mp4", "webm", "mov"].includes(ext || "")) return "video";
    if (["wav", "mp3", "m4a", "aac"].includes(ext || "")) return "audio";
    return "file";
}
function normalizeStatus(value: unknown) { return typeof value === "string" ? value.toUpperCase() : "PLANNED"; }
function runStateFor(detail: ProductionJobDetail | null, shotId: string) {
    return detail?.run_state?.shots?.[shotId] || (shotId === "MAIN" ? detail?.run_state : null);
}
function assetLabel(path: string) {
    if (path.endsWith("talent-reference-close.png")) return "女主角原图｜近景";
    if (path.endsWith("talent-reference-wide.png")) return "女主角原图｜半身";
    if (path.endsWith("pink-lulu-product-original.png")) return "粉色噜噜｜产品原图";
    if (path.endsWith("approved-install-geometry.png")) return "安全带佩戴参考";
    if (path.endsWith("main-driver-product-v1.png")) return "车内主镜头资产";
    if (path.endsWith("product-detail-v1.png")) return "产品细节镜头资产";
    if (path.endsWith("lulu_sweet_voice_v2_12s.wav")) return "真人配音｜12 秒";
    if (path.endsWith("/pink-lulu-user.png")) return "粉裤噜妹｜产品原图";
    if (path.endsWith("/yellow-lulu-user.png")) return "阳光噜噜｜产品原图";
    if (path.endsWith("character-keyframe-candidate-v1.png")) return "模特参考图｜关键帧候选（未审核）";
    if (path.includes("粉色噜噜-粉裤噜妹")) return "粉裤噜妹｜产品参考图";
    if (path.includes("黄色噜噜-阳光噜噜")) return "阳光噜噜｜产品参考图";
    if (path.endsWith("black-pad-material-4k.png")) return "护肩垫｜黑色织纹材料参考图";
    const library = /^library:products\/([^/]+)\/(source|approved)\//.exec(path);
    if (library) return `产品库｜${library[1]}｜${library[2] === "approved" ? "批准安装态" : "原图"}`;
    if (path.includes("/storyboards/") || /storyboard|分镜/i.test(path)) return `分镜图｜${fileLabel(path)}`;
    if (path.includes("/references/")) return `参考图｜${fileLabel(path)}`;
    if (path.includes("/production-assets/")) return `资产图｜${fileLabel(path)}`;
    if (path.endsWith("seed-audio-1.0.md")) return "口播配音 Brief｜Seed Audio 1.0";
    if (path.endsWith("creative-direction.md")) return "创意方案与分镜设计";
    return fileLabel(path);
}

function referencePath(value: unknown): string | null {
    const path = typeof value === "string" ? value : value && typeof value === "object" && "path" in value ? String(value.path) : "";
    return path ? path.replaceAll("\\", "/").replace(/^\.\//, "") : null;
}

function buildLayout(detail: ProductionJobDetail): ProductionLayout {
    const shots = detail.request_plan?.shots || (detail.request_plan?.request ? [{ shot_id: "MAIN", ...detail.request_plan.request }] : detail.shot_plan?.shots || []);
    const referencedPaths = new Set<string>();
    shots.forEach((shot) => {
        const shotId = String(shot.shot_id || "MAIN");
        const planned = detail.shot_plan?.shots?.find((item) => String(item.shot_id || "MAIN") === shotId);
        [...(Array.isArray(shot.ref_images) ? shot.ref_images : []), ...(Array.isArray(shot.ref_audio) ? shot.ref_audio : []), ...(Array.isArray(planned?.references) ? planned.references : [])]
            .map(referencePath).filter((path): path is string => Boolean(path)).forEach((path) => referencedPaths.add(path));
    });
    const assetFiles = new Set(detail.asset_files);
    const assetOrder = (path: string) => {
        if (path.endsWith("character-keyframe-candidate-v1.png")) return 0;
        if (path.includes("粉色噜噜-粉裤噜妹")) return 1;
        if (path.includes("黄色噜噜-阳光噜噜")) return 2;
        if (path.endsWith("black-pad-material-4k.png")) return 3;
        if (path.includes("/references/")) return 4;
        if (path.includes("/storyboards/") || /storyboard|分镜/i.test(path)) return 5;
        if (path.includes("/production-assets/")) return 6;
        if (path.endsWith("seed-audio-1.0.md")) return 8;
        if (path.endsWith("creative-direction.md")) return 9;
        return 10;
    };
    const assets = detail.asset_files.filter((path) => mediaKind(path) !== "file" && (path.startsWith("assets/source/") || path.startsWith("audio/source/") || referencedPaths.has(path))).sort((a, b) => assetOrder(a) - assetOrder(b));
    const grid = detail.format_id === "nine-grid-storyboard";
    let sharedAssetRow = 0;
    const assetNodes: ProductionNode[] = assets.map((path) => {
        const storyboardShotId = /(?:^|\/)(S\d{2})[-_].*storyboard/i.exec(path)?.[1];
        const storyboardIndex = storyboardShotId ? shots.findIndex((shot) => String(shot.shot_id) === storyboardShotId) : -1;
        const position = storyboardIndex >= 0 ? { x: storyboardIndex * 460, y: -270 } : { x: -390, y: sharedAssetRow++ * 240 };
        return { id: `asset:${path}`, kind: "asset", title: assetLabel(path), path, ...position };
    });
    const shotNodes: ProductionNode[] = shots.map((shot, index) => {
        const shotId = String(shot.shot_id || "MAIN");
        const row = Math.floor(index / 3);
        const col = index % 3;
        return { id: `shot:${shotId}`, kind: "shot", shotId, title: shotId, status: normalizeStatus(detail.run_state?.shots?.[shotId]?.status), x: grid ? col * 460 : index * 460, y: grid ? row * 340 : 0 };
    });
    const renderNodes: ProductionNode[] = shots.flatMap((shot, index) => {
        const shotId = String(shot.shot_id || "MAIN");
        const run = runStateFor(detail, shotId);
        const path = run?.task_id
            ? normalizeStatus(run.status) === "SUCCESS" && typeof run.output_file === "string" && assetFiles.has(run.output_file) ? run.output_file : undefined
            : detail.asset_files.find((file) => file.startsWith(`renders/runs/${shotId}/`) && mediaKind(file) === "video");
        if (!path) return [];
        const row = Math.floor(index / 3);
        const col = index % 3;
        return [{ id: `render:${path}`, kind: "render", title: `${shotId}｜生成结果`, shotId, status: normalizeStatus(run?.status || "SUCCESS"), path, x: grid ? col * 460 : index * 460, y: (grid ? row * 340 : 0) + 250 }];
    });
    const finalPath = detail.asset_files.filter((path) => /^renders\/preview\/(?:final|.*review).*\.mp4$/i.test(path) && !path.includes(".partial")).sort().pop();
    const finalPreviewNode: ProductionNode | null = finalPath
        ? { id: "render:final-preview", kind: "render", title: "剪辑预览", status: "SUCCESS", path: finalPath, x: shots.length * 460, y: 250 }
        : null;
    const finalEvent = finalPath ? [...detail.run_log].reverse().find((entry) => entry.type === "cut_composed" && entry.output_file === finalPath) : null;
    const finalShotIds = new Set((Array.isArray(finalEvent?.clips) ? finalEvent.clips : []).map((clip) => String((clip as { shot_id?: string }).shot_id || "")));
    const nodes = [...assetNodes, ...shotNodes, ...renderNodes, ...(finalPreviewNode ? [finalPreviewNode] : [])];
    const byPath = new Map(assetNodes.map((node) => [node.path, node.id]));
    const connections: ProductionConnection[] = [];
    if (!grid) {
        shotNodes.slice(1).forEach((node, index) => {
            const previous = shotNodes[index];
            connections.push({ id: `sequence:${previous.id}:${node.id}`, from: previous.id, to: node.id });
        });
    }
    shots.forEach((shot) => {
        const shotId = String(shot.shot_id || "MAIN");
        const shotNode = `shot:${shotId}`;
        const editorialShot = detail.shot_plan?.shots?.find((item) => String(item.shot_id || "MAIN") === shotId);
        const references = new Set([...(Array.isArray(shot.ref_images) ? shot.ref_images : []), ...(Array.isArray(shot.ref_audio) ? shot.ref_audio : []), ...(Array.isArray(editorialShot?.references) ? editorialShot.references : [])].map(referencePath).filter((path): path is string => Boolean(path)));
        for (const reference of references) {
            const assetId = byPath.get(reference);
            if (assetId) connections.push({ id: `ref:${assetId}:${shotNode}`, from: assetId, to: shotNode });
        }
        renderNodes.filter((node) => node.shotId === shotId).forEach((node) => connections.push({ id: `result:${shotNode}:${node.id}`, from: shotNode, to: node.id }));
        if (finalPreviewNode && finalShotIds.has(shotId)) connections.push({ id: `final:${shotNode}:${finalPreviewNode.id}`, from: shotNode, to: finalPreviewNode.id });
    });
    return { nodes, connections };
}

export default function ProductionJobPage() {
    const { jobId = "" } = useParams();
    const { message, modal } = App.useApp();
    const navigate = useNavigate();
    const copyText = useCopyText();
    const themeName = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeName];
    const containerRef = useRef<HTMLDivElement>(null);
    const uploadRef = useRef<HTMLInputElement>(null);
    const [detail, setDetail] = useState<ProductionJobDetail | null>(null);
    const [layout, setLayout] = useState<ProductionLayout>({ nodes: [], connections: [] });
    const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [submittingBatch, setSubmittingBatch] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [publishingAudio, setPublishingAudio] = useState(false);
    const [loading, setLoading] = useState(true);
    const [viewport, setViewport] = useState(defaultViewport);
    const layoutRef = useRef(layout);
    const initialFitRef = useRef(false);

    const refresh = useCallback(async () => {
        if (!jobId) return;
        try {
            const nextDetail = await getProductionJob(jobId);
            setDetail(nextDetail);
            setLogs(nextDetail.run_log);
            setLayout(buildLayout(nextDetail));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任务读取失败");
            navigate("/production", { replace: true });
        } finally { setLoading(false); }
    }, [jobId, message, navigate]);

    useEffect(() => { initialFitRef.current = false; void refresh(); }, [refresh]);
    useEffect(() => { layoutRef.current = layout; }, [layout]);
    useEffect(() => {
        const canvas = containerRef.current;
        if (initialFitRef.current || !canvas || !layout.nodes.length) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (!width || !height) return;
        const minX = Math.min(...layout.nodes.map((node) => node.x));
        const minY = Math.min(...layout.nodes.map((node) => node.y));
        const maxX = Math.max(...layout.nodes.map((node) => node.x + 330));
        const maxY = Math.max(...layout.nodes.map((node) => node.y + (node.kind === "shot" ? 190 : 235)));
        const k = Math.min(0.9, (width - 48) / (maxX - minX), (height - 48) / (maxY - minY));
        setViewport({ x: (width - (maxX - minX) * k) / 2 - minX * k, y: (height - (maxY - minY) * k) / 2 - minY * k, k });
        initialFitRef.current = true;
    }, [layout.nodes]);
    useEffect(() => {
        if (!detail || detail.status !== "running") return;
        const timer = setInterval(() => void refresh(), 5000);
        return () => clearInterval(timer);
    }, [detail, refresh]);

    const [renaming, setRenaming] = useState(false);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const submitRename = async () => {
        const next = renameValue.trim();
        if (!next) return void message.warning("标题不能为空");
        setRenaming(true);
        try {
            await renameProductionJob(jobId, next);
            setRenameOpen(false);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "重命名失败");
        } finally { setRenaming(false); }
    };

    const [promoteTarget, setPromoteTarget] = useState<string | null>(null);
    const [promoteCategory, setPromoteCategory] = useState(LIBRARY_CATEGORY_OPTIONS[0].value);
    const [promoteGroup, setPromoteGroup] = useState("");
    const [promoting, setPromoting] = useState(false);
    const submitPromote = async () => {
        if (!promoteTarget) return;
        setPromoting(true);
        try {
            const result = await promoteProductionAsset(jobId, { path: promoteTarget, category: promoteCategory, group: promoteGroup.trim() || undefined });
            message.success(result.duplicate ? "素材库里已有相同图片，未重复收录" : "已收进素材库，可在「素材库」页面查看");
            setPromoteTarget(null);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "收进素材库失败");
        } finally { setPromoting(false); }
    };

    const [openingCanvas, setOpeningCanvas] = useState(false);
    const openInMyCanvas = async () => {
        if (!detail) return;
        setOpeningCanvas(true);
        try {
            const { canvasId, created } = await openTaskCanvas(detail);
            message.success(created ? "已为该任务创建画布" : "已打开该任务的画布");
            navigate(`/canvas/${encodeURIComponent(canvasId)}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "打开画布失败");
        } finally {
            setOpeningCanvas(false);
        }
    };

    const activeNode = layout.nodes.find((node) => node.id === activeId) || null;
    const shots = detail?.request_plan?.shots || (detail?.request_plan?.request ? [{ shot_id: "MAIN", ...detail.request_plan.request }] : detail?.shot_plan?.shots || []);
    const [reviewing, setReviewing] = useState<string | null>(null);
    const [bulkAccepting, setBulkAccepting] = useState(false);
    const [recoveryTaskId, setRecoveryTaskId] = useState("");
    const [recoveringShot, setRecoveringShot] = useState<string | null>(null);
    const [resumingPolling, setResumingPolling] = useState(false);
    const [rejectCategory, setRejectCategory] = useState("material");
    const [composeOpen, setComposeOpen] = useState(false);
    const [composing, setComposing] = useState(false);
    const [composeShots, setComposeShots] = useState<string[]>([]);
    const [composeTransition, setComposeTransition] = useState<"cut" | "fade">("cut");
    const [composeTrim, setComposeTrim] = useState({ head: 0.2, tail: 0.2, fade: 0.15 });
    const shotsWithRender = shots.map((shot) => String(shot.shot_id || "MAIN")).filter((shotId) => {
        const run = runStateFor(detail, shotId);
        return normalizeStatus(run?.status) === "SUCCESS" && detail?.review_status?.shots?.[shotId]?.state === "accepted" && typeof run?.output_file === "string" && detail.asset_files.includes(run.output_file);
    });
    const openCompose = () => { setComposeShots(shotsWithRender); setComposeOpen(true); };
    const runCompose = async () => {
        if (!detail) return;
        setComposing(true);
        try {
            const result = await composeTaskCut(detail, { shots: shotsWithRender.filter((id) => composeShots.includes(id)).map((shot_id) => ({ shot_id, trim_head: composeTrim.head, trim_tail: composeTrim.tail })), transition: composeTransition, fade_seconds: composeTrim.fade });
            message.success(`已生成剪辑预览（${result.duration.toFixed(1)} 秒）`);
            setComposeOpen(false);
            await refresh();
            await fetch(`/api/jobs/${encodeURIComponent(detail.job_id)}/canvas-id`).then((r) => r.json()).then(async (data) => { const bound = await fetchBoundTask(data.canvas_id); if (bound) syncTaskCanvasFinals(data.canvas_id, bound); }).catch(() => undefined);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "合成失败");
        } finally {
            setComposing(false);
        }
    };
    const isPendingShot = (run: Record<string, unknown> | null | undefined) => !run || (!run.task_id && !run.output_file && (["PLANNED", "PREPARING"].includes(normalizeStatus(run.status)) || (normalizeStatus(run.status) === "SUBMIT_FAILED" && run.retry_approved === true)));
    const pendingBatchCount = shots.filter((shot) => isPendingShot(runStateFor(detail, String(shot.shot_id || "MAIN")))).length;
    const unconfirmedShotIds = shots.map((shot) => String(shot.shot_id || "MAIN")).filter((shotId) => {
        const state = runStateFor(detail, shotId);
        return !state?.task_id && (["SUBMITTING", "NEEDS_ATTENTION"].includes(normalizeStatus(state?.status)) || (normalizeStatus(state?.status) === "SUBMIT_FAILED" && state?.retry_approved !== true));
    });
    const audioPending = detail?.request_plan?.preparation_status === "audio_url_pending";
    const activeShot = activeNode?.kind === "shot" ? shots.find((shot) => String(shot.shot_id || "MAIN") === activeNode.shotId) : null;
    const run = activeNode?.shotId ? runStateFor(detail, activeNode.shotId) : null;
    const needsSubmitRecovery = Boolean(activeNode?.shotId && unconfirmedShotIds.includes(activeNode.shotId));
    const hasPendingPolling = shots.some((shot) => {
        const state = runStateFor(detail, String(shot.shot_id || "MAIN"));
        return Boolean(state?.task_id) && ["QUEUED", "RUNNING"].includes(normalizeStatus(state?.status));
    });
    const mediaNodes = useMemo(() => layout.nodes.map((node): CanvasNodeData => ({ id: node.id, type: node.kind === "shot" ? CanvasNodeType.Text : node.kind === "render" ? CanvasNodeType.Video : mediaKind(node.path || "") === "image" ? CanvasNodeType.Image : mediaKind(node.path || "") === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text, title: node.title, position: { x: node.x, y: node.y }, width: 330, height: node.kind === "shot" ? 190 : 235 })), [layout.nodes]);

    const selectNode = (event: React.MouseEvent, node: ProductionNode) => {
        event.stopPropagation();
        setActiveId(node.id);
        setSelected((current) => event.ctrlKey || event.metaKey ? current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id] : [node.id]);
    };

    const submitBatch = async () => {
        setSubmittingBatch(true);
        try {
            const plan = await preflightProductionBatch(jobId);
            if (plan.warnings?.length) message.warning(plan.warnings.join("；"));
            const result = await submitProductionBatch(jobId);
            if (result.failed) message.warning(`已提交 ${result.submitted.length} 个；${result.failed.shotId} 失败：${result.failed.error}`);
            else if (result.blocked?.length) message.warning(`已提交 ${result.submitted.length} 个镜头；${result.blocked.join("、")} 仍需核对提交结果`);
            else message.success(`已提交 ${result.submitted.length} 个镜头，正在并行生成`);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量检查失败");
        } finally { setSubmittingBatch(false); }
    };

    const [submittingShotId, setSubmittingShotId] = useState<string | null>(null);
    const submitOneShot = async (shotId: string) => {
        setSubmittingShotId(shotId);
        try {
            const plan = await preflightProductionBatch(jobId, [shotId]);
            if (plan.warnings?.length) message.warning(plan.warnings.join("；"));
            const result = await submitProductionBatch(jobId, [shotId]);
            if (result.failed) message.error(`${shotId} 提交失败：${result.failed.error}`);
            else message.success(`${shotId} 已提交，正在生成`);
            await refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "提交检查失败");
        } finally { setSubmittingShotId(null); }
    };

    const uploadAudio = async (file?: File) => {
        if (!file) return;
        const selectedShot = layout.nodes.find((node) => node.id === activeId && node.kind === "shot")?.shotId;
        try {
            if (mediaKind(file.name) !== "audio") return void message.warning("这里只上传配音音频；图片素材请在“我的画布”里换");
            if (!selectedShot) return void message.warning("请先点选要配这段配音的镜头");
            setUploading(true);
            await uploadProductionAsset(jobId, file, selectedShot);
            message.success(`配音已上传并挂到 ${selectedShot}，请点“发布配音”`);
            await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : "配音上传失败"); }
        finally { setUploading(false); if (uploadRef.current) uploadRef.current.value = ""; }
    };

    const publishAudio = async () => {
        const waiting = shots.filter((shot) => Array.isArray(shot.ref_audio) && shot.ref_audio.length && !(Array.isArray(shot.ref_audio_urls) && shot.ref_audio_urls.length)).map((shot) => String(shot.shot_id));
        if (!waiting.length) return void message.info("没有待发布的配音");
        setPublishingAudio(true);
        try {
            for (const shotId of waiting) await publishProductionAudio(jobId, shotId);
            message.success(`已发布 ${waiting.length} 个镜头的配音`);
            await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : "配音发布失败"); }
        finally { setPublishingAudio(false); }
    };

    const reviewShot = async (shotId: string, decision: "accepted" | "rejected") => {
        setReviewing(shotId);
        try {
            await reviewProductionShot(jobId, shotId, decision === "rejected" ? { decision, category: rejectCategory } : { decision });
            message.success(decision === "accepted" ? `${shotId} 已接受` : `${shotId} 已驳回，可到“我的画布”改素材或提示词后重新生成`);
            await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : "审核记录失败"); }
        finally { setReviewing(null); }
    };

    const adoptSubmit = async (shotId: string) => {
        const taskId = recoveryTaskId.trim();
        if (!/^[\w-]{8,64}$/.test(taskId)) return void message.warning("请输入在 AutoDL 核对到的任务 ID");
        setRecoveringShot(shotId);
        try {
            await resolveProductionSubmit(jobId, shotId, { task_id: taskId });
            message.success(`${shotId} 已接管远端任务，正在恢复轮询`);
            setRecoveryTaskId("");
            await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : "接管提交失败"); }
        finally { setRecoveringShot(null); }
    };

    const discardSubmit = (shotId: string) => {
        modal.confirm({
            title: "确认 AutoDL 没有创建这次任务？",
            content: "请先在 AutoDL 核对。确认未创建后，才解除本镜头的重复提交保护。",
            okText: "确认未创建",
            okType: "danger",
            cancelText: "取消",
            onOk: async () => {
                setRecoveringShot(shotId);
                try {
                    await resolveProductionSubmit(jobId, shotId, { discard: true });
                    message.success(`${shotId} 已核对，可重新批量提交`);
                    await refresh();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "处理待核对提交失败");
                    throw error;
                } finally { setRecoveringShot(null); }
            },
        });
    };

    const resumePolling = async () => {
        setResumingPolling(true);
        try {
            const result = await resumeProductionPolling(jobId);
            if (!result.tokenConfigured) message.warning("本机执行器缺少 AutoDL Token，无法恢复轮询");
            else if (result.resumed) message.info(`已恢复 ${result.resumed} 个镜头的轮询`);
            else if (result.alreadyRunning) message.info(`已有 ${result.alreadyRunning} 个镜头正在轮询`);
            else message.info("没有排队或生成中的镜头");
            await refresh();
        } catch (error) { message.error(error instanceof Error ? error.message : "恢复轮询失败"); }
        finally { setResumingPolling(false); }
    };

    const pendingReviewShots = Object.entries(detail?.review_status?.shots || {}).filter(([, item]) => item.state === "pending").map(([shotId]) => shotId);
    const acceptAllPending = () => {
        const targets = pendingReviewShots;
        if (!targets.length) return;
        modal.confirm({
            title: `确认这 ${targets.length} 个镜头的当前视频都没问题？`,
            content: `${targets.join("、")} 会被记为“已接受”（备注：批量接受）。之后重新生成的版本需要重新审片。`,
            okText: "全部接受",
            cancelText: "取消",
            onOk: async () => {
                setBulkAccepting(true);
                const failed: string[] = [];
                for (const shotId of targets) {
                    try { await reviewProductionShot(jobId, shotId, { decision: "accepted", note: "批量接受" }); } catch { failed.push(shotId); }
                }
                setBulkAccepting(false);
                if (failed.length) message.warning(`已接受 ${targets.length - failed.length} 个；${failed.join("、")} 记录失败`);
                else message.success(`已接受 ${targets.length} 个镜头`);
                await refresh();
            },
        });
    };

    if (loading) return <div className="flex h-full items-center justify-center bg-background"><Spin /></div>;
    if (!detail) return <Empty className="py-20" description="任务不存在" />;

    return (
        <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <Button type="text" icon={<ArrowLeft className="size-4" />} onClick={() => navigate("/production")}>任务历史</Button>
                    <span className="text-muted-foreground">/</span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <h1 className="truncate text-sm font-semibold">{String(detail.brief?.creative_concept || detail.job_id)}</h1>
                            <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={() => { setRenameValue(String(detail.brief?.creative_concept || detail.job_id)); setRenameOpen(true); }} />
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{detail.job_id}</p>
                    </div>
                    <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(detail.local_path, "已复制任务根目录")}>复制资产目录</Button>
                    <Tag color={detail.status === "success" ? "green" : detail.status === "failed" ? "red" : detail.status === "running" ? "blue" : "default"}>{normalizeStatus(detail.status)}</Tag>
                    {detail.review_status && detail.review_status.pending > 0 ? <Tag color="orange">待人工审片 {detail.review_status.pending}</Tag> : detail.review_status && detail.review_status.accepted > 0 && detail.review_status.rejected === 0 ? <Tag color="green">审片通过</Tag> : detail.review_status && detail.review_status.rejected > 0 ? <Tag color="red">有驳回 {detail.review_status.rejected}</Tag> : null}
                    {unconfirmedShotIds.length > 0 && <Tag color="orange">提交待核对 {unconfirmedShotIds.length}</Tag>}
                </div>
                <div className="flex shrink-0 gap-2">
                    <Button icon={<Upload className="size-4" />} loading={uploading} onClick={() => uploadRef.current?.click()}>上传配音</Button>
                    {audioPending && <Button icon={<CloudUpload className="size-4" />} loading={publishingAudio} onClick={() => void publishAudio()}>发布配音</Button>}
                    {detail.request_plan?.media_type !== "image" && <Button type="primary" icon={<WandSparkles className="size-4" />} loading={submittingBatch} disabled={!pendingBatchCount || audioPending} onClick={() => void submitBatch()}>{audioPending ? "等待发布配音" : !pendingBatchCount && unconfirmedShotIds.length ? "核对后可继续提交" : `批量提交 ${pendingBatchCount} 镜头`}</Button>}
                    {unconfirmedShotIds.length > 0 && <Button onClick={() => { const id = `shot:${unconfirmedShotIds[0]}`; setActiveId(id); setSelected([id]); }}>核对提交 {unconfirmedShotIds.length}</Button>}
                    {hasPendingPolling && <Button loading={resumingPolling} onClick={() => void resumePolling()}>继续轮询</Button>}
                    {pendingReviewShots.length > 0 && <Button icon={<Check className="size-4" />} loading={bulkAccepting} onClick={acceptAllPending}>全部接受 {pendingReviewShots.length}</Button>}
                    <Button icon={<Film className="size-4" />} disabled={!shotsWithRender.length} onClick={openCompose}>合成审片预览</Button>
                    <Button type="primary" icon={<ExternalLink className="size-4" />} loading={openingCanvas} onClick={() => void openInMyCanvas()}>在我的画布中打开</Button>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void refresh()}>刷新</Button>
                </div>
            </header>
            <div className="flex min-h-0 flex-1">
                <section className="relative min-w-0 flex-1">
                    <InfiniteCanvas containerRef={containerRef} viewport={viewport} tool="pan" onViewportChange={setViewport} onCanvasDeselect={() => { setSelected([]); setActiveId(null); }}>
                        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible">
                            {layout.connections.map((connection) => {
                                const from = mediaNodes.find((node) => node.id === connection.from);
                                const to = mediaNodes.find((node) => node.id === connection.to);
                                if (!from || !to) return null;
                                const edge: CanvasConnection = { id: connection.id, fromNodeId: from.id, toNodeId: to.id };
                                return <g key={connection.id} className="pointer-events-auto"><ConnectionPath connection={edge} from={from} to={to} active={activeId === connection.id} onSelect={() => setActiveId(connection.id)} /></g>;
                            })}
                        </svg>
                        {layout.nodes.map((node) => {
                            const media = mediaKind(node.path || "");
                            const kind = node.kind === "shot" ? "镜头提示词" : node.kind === "render" ? "生成结果" : media === "image" ? "图片资产" : media === "video" ? "视频资产" : media === "audio" ? "音频资产" : "项目文件";
                            const status = node.kind === "asset" ? "" : normalizeStatus(node.kind === "shot" ? runStateFor(detail, node.shotId || "")?.status || node.status : node.status);
                            const url = node.path ? productionFileUrl(jobId, node.path) : "";
                            const selectedNode = selected.includes(node.id);
                            return (
                                <article key={node.id} data-node-id={node.id} onClick={(event) => selectNode(event, node)} className="absolute cursor-pointer overflow-hidden rounded-xl border shadow-sm" style={{ left: node.x, top: node.y, width: 330, minHeight: node.kind === "shot" ? 190 : 235, background: theme.node.panel, borderColor: selectedNode ? theme.node.activeStroke : theme.node.stroke, color: theme.node.text }}>
                                    <div className="flex items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: theme.node.stroke }}><div className="min-w-0"><p className="text-[10px]" style={{ color: theme.node.muted }}>{kind}</p><p className="truncate text-sm font-medium">{node.title}</p></div>{status && <Tag color={status === "SUCCESS" ? "green" : status === "FAILED" || status === "ERROR" || status === "SUBMIT_FAILED" ? "red" : status === "RUNNING" || status === "QUEUED" ? "blue" : "default"}>{status}</Tag>}</div>
                                    <div className="p-3">
                                        {node.kind === "shot" ? <><p className="line-clamp-5 whitespace-pre-wrap text-xs" style={{ color: theme.node.muted }}>{String(shots.find((shot) => String(shot.shot_id || "MAIN") === node.shotId)?.prompt || "（尚未填写提示词）")}</p><p className="mt-3 text-[10px]" style={{ color: theme.node.faint }}>镜头 · {node.shotId}</p></> : node.kind === "render" && !node.path ? <p className="py-12 text-center text-xs" style={{ color: theme.node.muted }}>{node.id === "render:final-preview" ? "所有镜头完成后，完整审片版会显示在这里。" : status === "RUNNING" || status === "QUEUED" ? "AutoDL 正在生成；完成后视频会显示在这里。" : "本镜头的视频结果会显示在这里。"}</p> : media === "image" ? <img src={url} alt={node.title} className="h-40 w-full rounded-md object-contain" /> : media === "video" ? <video src={url} controls preload="metadata" className="h-40 w-full rounded-md bg-black object-contain" /> : media === "audio" ? <audio src={url} controls className="w-full" /> : <a href={url} download className="truncate text-xs text-muted-foreground">{node.path}</a>}
                                    </div>
                                </article>
                            );
                        })}
                    </InfiniteCanvas>
                    <div className="absolute bottom-3 left-3 rounded-md px-2 py-1 text-xs" style={{ background: theme.toolbar.panel, color: theme.node.muted }}>滚轮缩放 · 空格拖动画布 · 任务状态页只读；改素材、提示词、重新生成请到“我的画布”</div>
                </section>
                <aside className="w-[360px] shrink-0 overflow-auto border-l border-border px-4 py-4">
                    {activeNode?.kind === "shot" ? <>
                        <div className="flex items-center justify-between"><h2 className="font-semibold">{activeNode.shotId} · {detail.request_plan?.media_type === "image" ? "分镜提示词" : "提示词"}</h2><Tag>{detail.request_plan?.media_type === "image" ? "图像分镜" : `${String(activeShot?.duration || 3)} 秒`}</Tag></div>
                        <p className="mb-2 mt-3 text-xs text-muted-foreground">这里只看和审片。改提示词、换素材、重新生成请在“我的画布”里操作，结果会写回这个任务并记入历史。</p>
                        <div className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border p-3 text-xs">{String(activeShot?.prompt || "（尚未填写提示词）")}</div>
                        <div className="mt-3 flex gap-2">
                            <Button icon={<ExternalLink className="size-4" />} loading={openingCanvas} onClick={() => void openInMyCanvas()}>在我的画布中编辑</Button>
                            {detail.request_plan?.media_type !== "image" && isPendingShot(run) && !audioPending && activeNode.shotId ? <Button type="primary" icon={<WandSparkles className="size-4" />} loading={submittingShotId === activeNode.shotId} onClick={() => void submitOneShot(activeNode.shotId!)}>单独提交</Button> : null}
                        </div>
                        {audioPending ? <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">配音文件已入库，但尚未发布为 AutoDL 可访问 URL；发布后会自动映射到 H3 的音频输入。</p> : null}
                        {detail.request_plan?.media_type === "image" ? <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">九宫格已作为图像分镜画布接入；项目暂未登记 AutoDL 图像工作流，因此不会误用视频工作流提交。</p> : null}
                        {run ? <div className="mt-5 rounded-lg border border-border p-3 text-xs"><p>当前生成状态：{normalizeStatus(run.status)}</p><p className="mt-1 break-all text-muted-foreground">任务 ID：{String(run.task_id || "—")}</p>{run.submit_error || run.error ? <p className="mt-2 text-red-500">{String(run.submit_error || run.error)}</p> : null}</div> : null}
                        {needsSubmitRecovery && activeNode.shotId ? <div className="mt-5 rounded-lg border border-amber-500 p-3 text-xs">
                            <p className="font-medium">{normalizeStatus(run?.status) === "SUBMIT_FAILED" ? "提交失败，尚未人工核对" : "提交未得到 AutoDL 确认"}</p>
                            <p className="mt-1 text-muted-foreground">请先在 AutoDL 核对该镜头是否已创建任务。若已创建，填入远端任务 ID 接管；若确认未创建，再解除保护。</p>
                            <Input className="mt-3" value={recoveryTaskId} onChange={(event) => setRecoveryTaskId(event.target.value)} placeholder="AutoDL 任务 ID" />
                            <div className="mt-3 flex gap-2">
                                <Button size="small" type="primary" loading={recoveringShot === activeNode.shotId} onClick={() => void adoptSubmit(activeNode.shotId!)}>接管并轮询</Button>
                                <Button size="small" danger loading={recoveringShot === activeNode.shotId} onClick={() => discardSubmit(activeNode.shotId!)}>确认未创建</Button>
                            </div>
                        </div> : null}
                        {activeNode.shotId && detail.review_status?.shots?.[activeNode.shotId] ? <div className="mt-5 rounded-lg border border-border p-3 text-xs">
                            <p className="font-medium">人工审片：{{ pending: "待审片", accepted: "已接受", rejected: "已驳回" }[detail.review_status.shots[activeNode.shotId].state]}{detail.review_status.shots[activeNode.shotId].category ? `（${detail.review_status.shots[activeNode.shotId].category}）` : ""}</p>
                            <p className="mt-1 text-muted-foreground">结论针对当前这一版视频；重新生成后需要重新审片。</p>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button size="small" type="primary" icon={<Check className="size-3" />} loading={reviewing === activeNode.shotId} onClick={() => void reviewShot(activeNode.shotId!, "accepted")}>接受</Button>
                                <Select size="small" className="w-28" value={rejectCategory} onChange={setRejectCategory} options={[{ value: "material", label: "材质问题" }, { value: "consistency", label: "一致性" }, { value: "lipsync", label: "口型" }, { value: "composition", label: "构图" }, { value: "audio", label: "声音" }, { value: "other", label: "其他" }]} />
                                <Button size="small" danger icon={<X className="size-3" />} loading={reviewing === activeNode.shotId} onClick={() => void reviewShot(activeNode.shotId!, "rejected")}>驳回</Button>
                            </div>
                        </div> : null}
                    </> : activeNode?.kind === "asset" || activeNode?.kind === "render" ? <>
                        <h2 className="font-semibold">{activeNode.kind === "asset" ? "素材详情" : "生成版本"}</h2>
                        {activeNode.path ? <p className="mt-2 break-all text-xs text-muted-foreground">{activeNode.path}</p> : null}
                        {activeNode.path && mediaKind(activeNode.path) === "image" ? <img src={productionFileUrl(jobId, activeNode.path)} alt={activeNode.title} className="mt-4 max-h-80 w-full rounded-lg object-contain" /> : activeNode.path && mediaKind(activeNode.path) === "video" ? <video src={productionFileUrl(jobId, activeNode.path)} controls className="mt-4 w-full rounded-lg bg-black" /> : activeNode.path && mediaKind(activeNode.path) === "audio" ? <audio src={productionFileUrl(jobId, activeNode.path)} controls className="mt-4 w-full" /> : activeNode.kind === "render" && !activeNode.path ? <div className="mt-4 rounded-lg border border-border p-4 text-sm text-muted-foreground">{activeNode.shotId ? `镜头 ${activeNode.shotId}：${normalizeStatus(runStateFor(detail, activeNode.shotId)?.status || activeNode.status)}。生成完成后视频会出现在此节点。` : "所有镜头完成后，完整审片版会显示在此节点。"}</div> : activeNode.path ? <a className="mt-4 inline-block text-sm underline" href={productionFileUrl(jobId, activeNode.path)} download>下载文件</a> : null}
                        {activeNode.path && mediaKind(activeNode.path) === "image" ? <Button className="mt-3" icon={<LibraryBig className="size-4" />} onClick={() => { setPromoteTarget(activeNode.path!); setPromoteGroup(""); }}>收进素材库</Button> : null}
                    </> : <>
                        <h2 className="font-semibold">任务信息</h2>
                        <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-muted-foreground">创意形式</dt><dd className="mt-1">{detail.format_id || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">产品类目</dt><dd className="mt-1">{String(detail.brief?.category_id || "—")}</dd></div><div><dt className="text-xs text-muted-foreground">工作流</dt><dd className="mt-1">{detail.request_plan?.workflow_id || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">任务文件</dt><dd className="mt-1">{detail.asset_files.filter((path) => !path.startsWith("renders/")).length} 个素材/项目文件 · {layout.nodes.filter((node) => node.kind === "render").length} 个生成版本</dd></div></dl>
                    </>}
                    <section className="mt-8 border-t border-border pt-4"><div className="flex items-center justify-between"><h2 className="font-semibold">完整操作历史</h2><Button type="text" size="small" icon={<RefreshCw className="size-3" />} onClick={() => void refresh()} /></div>{logs.length ? <ol className="mt-3 space-y-3">{[...logs].reverse().map((log, index) => <li key={`${log.time}-${index}`} className="border-l-2 border-border pl-3"><p className="text-xs font-medium">{String(log.type || log.status || "task_event")}</p><p className="mt-1 text-xs text-muted-foreground">{String(log.shot_id || log.format_id || "任务")} · {log.time ? new Date(String(log.time)).toLocaleString() : ""}</p>{log.after !== undefined ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">{typeof log.after === "string" ? log.after : JSON.stringify(log.after)}</p> : log.error ? <p className="mt-1 text-xs text-red-500">{String(log.error)}</p> : null}</li>)}</ol> : <p className="mt-3 text-xs text-muted-foreground">暂无操作记录</p>}</section>
                </aside>
            </div>
            <input ref={uploadRef} type="file" accept=".wav,.mp3,.m4a,.aac" className="hidden" onChange={(event) => void uploadAudio(event.target.files?.[0])} />
            <Modal title="合成审片预览（本机 ffmpeg）" open={composeOpen} onCancel={() => setComposeOpen(false)} onOk={() => void runCompose()} okText="开始合成" cancelText="取消" confirmLoading={composing} okButtonProps={{ disabled: composeShots.length < 1 }}>
                <div className="flex flex-col gap-3 py-2 text-sm">
                    <div>
                        <div className="mb-1 text-muted-foreground">仅合成当前视频已通过人工审片的镜头</div>
                        <Checkbox.Group value={composeShots} onChange={(values) => setComposeShots(values as string[])} options={shotsWithRender.map((id) => ({ label: id, value: id }))} />
                    </div>
                    {shots.length > composeShots.length ? <p className="text-xs text-amber-600 dark:text-amber-400">本次预览未包含 {shots.length - composeShots.length} 个计划镜头；请核对待审、驳回或未生成的镜头后再制作正式成片。</p> : null}
                    <div className="flex items-center gap-2">镜头之间：<Select value={composeTransition} onChange={setComposeTransition} className="w-40" options={[{ value: "cut", label: "硬切" }, { value: "fade", label: "短交叉淡化" }]} />{composeTransition === "fade" ? <><InputNumber min={0.05} max={1} step={0.05} value={composeTrim.fade} onChange={(value) => setComposeTrim((current) => ({ ...current, fade: value ?? 0.15 }))} />秒</> : null}</div>
                    <div className="flex items-center gap-2">每个镜头裁掉：开头<InputNumber min={0} max={2} step={0.1} value={composeTrim.head} onChange={(value) => setComposeTrim((current) => ({ ...current, head: value ?? 0 }))} />秒，结尾<InputNumber min={0} max={2} step={0.1} value={composeTrim.tail} onChange={(value) => setComposeTrim((current) => ({ ...current, tail: value ?? 0 }))} />秒</div>
                    <div className="text-xs text-muted-foreground">沿用各镜头自带的音轨；预览保存在任务的 renders/preview 下，旧版本保留，不会改动镜头视频。</div>
                </div>
            </Modal>

            <Modal title="重命名任务" open={renameOpen} onCancel={() => setRenameOpen(false)} onOk={() => void submitRename()} confirmLoading={renaming} okText="保存" cancelText="取消">
                <Input className="mt-2" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} placeholder="任务标题" maxLength={80} onPressEnter={() => void submitRename()} />
                <p className="mt-2 text-xs text-muted-foreground">只改显示标题，任务文件夹名不变。</p>
            </Modal>

            <Modal title="收进素材库" open={Boolean(promoteTarget)} onCancel={() => setPromoteTarget(null)} onOk={() => void submitPromote()} confirmLoading={promoting} okText="收录" cancelText="取消">
                <div className="space-y-3 py-1 text-sm">
                    <label className="block">分类<Select className="mt-1 w-full" value={promoteCategory} onChange={setPromoteCategory} options={LIBRARY_CATEGORY_OPTIONS} /></label>
                    <label className="block">分组（可选）<Input className="mt-1" value={promoteGroup} onChange={(event) => setPromoteGroup(event.target.value)} placeholder="例如 seatbelt-shoulder-pad/pink-lulu-v1，留空则直接放在分类下" maxLength={121} /></label>
                    <p className="text-xs text-muted-foreground">收录后立即出现在"素材库"页面对应分类下，不会自动替换现有的身份/产品定妆照。</p>
                </div>
            </Modal>
        </main>
    );
}
