import { ArrowLeft, ArrowRight, BookOpen, CheckSquare, ClipboardPaste, Download, FolderPlus, History, ImagePlus, LoaderCircle, PenLine, Plus, RefreshCw, SlidersHorizontal, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Drawer, Empty, Image, Input, Modal, Tag, Tooltip, Typography } from "antd";
import localforage from "localforage";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { ImageSettingsPanel } from "@/components/image-settings-panel";
import { ModelPicker } from "@/components/model-picker";
import { PromptSelectDialog } from "@/components/prompts/prompt-select-dialog";
import { AssetPickerModal, type InsertAssetPayload } from "@/components/canvas/asset-picker-modal";
import { SaveToLibraryButton } from "@/components/library/save-to-library-button";
import { canvasThemes } from "@/lib/canvas-theme";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { modelMatchesCapability, modelOptionLabel, modelOptionName, normalizeModelOptionValue, selectableModelsByCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { nanoid } from "nanoid";
import { formatBytes, formatDuration } from "@/lib/image-utils";
import { requestEdit, requestGeneration } from "@/services/api/image";
import type { Prompt } from "@/services/api/prompts";
import { libraryFileUrl } from "@/services/api/library";
import { imageToDataUrl, ensureImagePreview, getImagePreviewRevision, previewUrlFor, resolveImageUrl, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { useWorkbenchAgentStore, type WorkbenchReferenceSource } from "@/stores/use-workbench-agent-store";
import type { ReferenceImage } from "@/types/image";
import i18n from "@/i18n";
import { generatedImageUrl, listGeneratedImages, registerGeneratedImage, updateWorkbenchTarget, type WorkbenchTarget } from "@/services/api/generated-images";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { listImageHistory, saveImageHistory, deleteImageHistory } from "@/services/api/image-history";

type GeneratedImage = {
    name?: string;
    id: string;
    dataUrl: string;
    storageKey?: string;
    durationMs: number;
    width: number;
    height: number;
    bytes: number;
    mimeType?: string;
};

type GenerationResult = {
    id: string;
    status: "pending" | "success" | "failed";
    image?: GeneratedImage;
    error?: string;
};

type GenerationLog = {
    id: string;
    createdAt: number;
    title: string;
    prompt: string;
    time: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    imageCount: number;
    size: string;
    quality: string;
    status: "success" | "failed";
    images: GeneratedImage[];
};

type GenerationLogConfig = Pick<AiConfig, "model" | "imageModel" | "quality" | "size" | "count" | "background" | "systemPrompt" | "apiFormat" | "baseUrl">;

type UpdateAiConfig = <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;


function libraryFileExt(mimeType?: string) {
    return { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mimeType || ""] || "png";
}

// Resolve an Agent-supplied reference spec (library ref, "我的素材" asset id, or a plain URL) into a
// usable reference image, reusing whichever image already exists instead of asking the Agent to re-generate it.
async function resolveAgentReference(source: WorkbenchReferenceSource): Promise<ReferenceImage | null> {
    try {
        if (source.type === "generated") {
            const stored = await uploadImage(generatedImageUrl(source.imageId));
            return { id: source.imageId, name: source.imageId, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey };
        }
        if (source.type === "library") {
            const path = source.ref.startsWith("library:") ? source.ref.slice("library:".length) : source.ref;
            const stored = await uploadImage(libraryFileUrl(path));
            return { id: nanoid(), name: path.split("/").pop() || "reference", type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey };
        }
        if (source.type === "asset") {
            const asset = useAssetStore.getState().assets.find((item) => item.id === source.assetId);
            if (!asset || asset.kind !== "image") return null;
            return { id: nanoid(), name: asset.title, type: asset.data.mimeType, dataUrl: asset.data.dataUrl, storageKey: asset.data.storageKey };
        }
        if (source.type === "resolved") {
            return { id: nanoid(), name: source.name || "reference", type: "", dataUrl: source.dataUrl, storageKey: source.storageKey };
        }
        const stored = await uploadImage(source.url);
        return { id: nanoid(), name: "reference", type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey };
    } catch {
        return null;
    }
}
const RESULT_ACTION_BUTTON_CLASS = "min-w-0 px-1.5 [&_.ant-btn-icon]:shrink-0 [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";
const browserLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragDepthRef = useRef(0);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const [prompt, setPrompt] = useState("");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const [results, setResults] = useState<GenerationResult[]>([]);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [running, setRunning] = useState(false);
    const [importingHistory, setImportingHistory] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [promptDialogOpen, setPromptDialogOpen] = useState(false);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [startedAt, setStartedAt] = useState(0);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [previewLog, setPreviewLog] = useState<GenerationLog | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isReferenceDragActive, setIsReferenceDragActive] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const [draftTarget, setDraftTarget] = useState<WorkbenchTarget | undefined>(undefined);
    const [loadingReferences, setLoadingReferences] = useState(false);
    const commandNameRef = useRef<string | undefined>(undefined);
    const activeTargetRef = useRef<{ target?: WorkbenchTarget; taskId: string } | null>(null);
    const agentTaskIdRef = useRef<string | undefined>(undefined);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const canGenerate = Boolean(prompt.trim());
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    useEffect(() => {
        if (!running || !startedAt) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [running, startedAt]);

    useEffect(() => {
        void refreshLogs();
        const reload = () => { void refreshLogs(); };
        window.addEventListener("focus", reload);
        return () => window.removeEventListener("focus", reload);
    }, []);

    const addReferences = async (files?: FileList | null) => {
        const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/"));
        const nextReferences = await Promise.all(
            imageFiles.map(async (file) => {
                const image = await uploadImage(file);
                return { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
            }),
        );
        setReferences((value) => [...value, ...nextReferences]);
    };

    const replaceIndexRef = useRef<number | null>(null);
    const replaceInputRef = useRef<HTMLInputElement>(null);
    const replaceReference = async (file?: File) => {
        const index = replaceIndexRef.current;
        if (!file || index === null) return;
        const image = await uploadImage(file);
        const next: ReferenceImage = { id: nanoid(), name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
        setReferences((value) => value.map((ref, i) => (i === index ? next : ref)));
    };

    const addReferencesFromClipboard = async () => {
        try {
            const items = await navigator.clipboard.read();
            const blobs = await Promise.all(items.flatMap((item) => item.types.filter((type) => type.startsWith("image/")).map((type) => item.getType(type))));
            if (!blobs.length) {
                message.error(t("imageWorkbench.clipboardEmpty"));
                return;
            }
            const nextReferences = await Promise.all(
                blobs.map(async (blob, index) => {
                    const image = await uploadImage(blob);
                    return { id: nanoid(), name: `clipboard-${index + 1}.png`, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey };
                }),
            );
            setReferences((value) => [...value, ...nextReferences]);
            message.success(t("imageWorkbench.clipboardAdded", { count: nextReferences.length }));
        } catch {
            message.error(t("imageWorkbench.clipboardEmpty"));
        }
    };

    const generate = async () => {
        if (running || loadingReferences) return;
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const target = draftTarget;
        const name = commandNameRef.current;
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        if (!modelMatchesCapability(effectiveConfig, model, "image") || !isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.configIncomplete") });
            return;
        }

        const snapshot = buildRequestSnapshot();
        if (!snapshot) {
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.invalidParams") });
            return;
        }

        const taskId = agentTaskId || `image-${nanoid()}`;
        const generationSnapshot = { ...snapshot, taskId, target, name };
        activeTargetRef.current = { target, taskId };
        setElapsedMs(0);
        setRunning(true);
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        setPreviewLog(null);
        setResults(Array.from({ length: generationCount }, () => ({ id: nanoid(), status: "pending" })));
        const batchStartedAt = performance.now();
        setStartedAt(batchStartedAt);

        if (target) {
            try { await updateWorkbenchTarget(target, taskId, "bind"); }
            catch (error) {
                const reason = error instanceof Error ? error.message : "无法绑定目标节点";
                setRunning(false);
                message.error(reason);
                if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: reason });
                return;
            }
        }
        const tasks = Array.from({ length: generationCount }, (_, index) => runGenerationSlot(index, generationSnapshot));

        const result = await Promise.allSettled(tasks);
        const successImages = result.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const successCount = successImages.length;
        const failCount = generationCount - successCount;
        const failed = result.find((item): item is PromiseRejectedResult => item.status === "rejected");
        const error = failed?.reason instanceof Error ? failed.reason.message : failCount ? t("workbench.generationFailed") : undefined;
        let backfill: "applied" | "skipped" | "failed" | undefined;
        let backfillError: string | undefined;
        if (target && successImages.length) {
            try {
                const filled = await fillTarget(target, taskId, successImages, text);
                backfill = filled ? "applied" : "skipped";
                if (!filled) message.warning("目标节点已更换图片或生成任务，结果已保留，未覆盖节点");
            } catch (error) {
                backfill = "failed";
                backfillError = error instanceof Error ? error.message : "回填失败";
                message.error(`图片已保存，回填失败：${backfillError}`);
            }
        }
        try {
            await saveLog(
                buildLog({
                    prompt: text,
                    model,
                    config: { ...snapshot.config, count: String(generationCount) },
                    references: snapshot.references,
                    durationMs: performance.now() - batchStartedAt,
                    successCount,
                    failCount,
                    status: successCount ? "success" : "failed",
                    images: successImages,
                }),
            );
            successCount ? message.success(t("imageWorkbench.generated")) : message.error(failed?.reason instanceof Error ? failed.reason.message : t("workbench.generationFailed"));
        } catch (error) {
            message.error(`服务器保存生成记录失败：${error instanceof Error ? error.message : "未知错误"}`);
        } finally {
            setRunning(false);
            if (agentTaskId) updateAgentTask(agentTaskId, { status: successCount ? "succeeded" : "failed", successCount, failCount, error: successCount ? backfillError : error, imageIds: successImages.map(image => image.id), backfill });
        }
    };

    // Handle image-generation commands from the Agent panel by setting the prompt and optionally starting generation.
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        const startRun = () => {
            setDraftTarget(imageCommand.target);
            commandNameRef.current = imageCommand.name;
            if (imageCommand.run) {
                agentTaskIdRef.current = imageCommand.taskId;
                setAutoRunToken((value) => value + 1);
            }
        };
        setDraftTarget(undefined);
        commandNameRef.current = undefined;
        setResults([]);
        setPreviewLog(null);
        setReferences([]);
        if (imageCommand.references?.length) {
            setLoadingReferences(true);
            Promise.all(imageCommand.references.map(resolveAgentReference)).then((resolved) => {
                if (processedCommandRef.current !== imageCommand.nonce) return;
                const valid = resolved.filter((item): item is ReferenceImage => Boolean(item));
                if (valid.length !== resolved.length) {
                    const error = "参考图读取失败，未启动生成";
                    message.error(error);
                    if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error });
                    return;
                }
                setReferences(valid);
                setLoadingReferences(false);
                startRun();
            }).finally(() => { if (processedCommandRef.current === imageCommand.nonce) setLoadingReferences(false); });
        } else {
            setLoadingReferences(false);
            setReferences([]);
            startRun();
        }
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const downloadImage = (image: GeneratedImage, index: number) => {
        saveAs(image.dataUrl, `${image.id}.${libraryFileExt(image.mimeType)}`);
    };

    const addResultToReferences = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences((value) => [...value, { id: nanoid(), name: image.name || image.id, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        message.success(t("imageWorkbench.addedReference"));
    };

    const saveResultToAssets = async (image: GeneratedImage, index: number) => {
        const stored = await uploadImage(image.dataUrl);
        addAsset({
            kind: "image",
            title: image.name || image.id,
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt, generatedImageId: image.id },
        });
        message.success(t("common.addedToAssets"));
    };

    const applyPromptPreset = async (item: Prompt) => {
        if (running || loadingReferences) return;
        const hide = message.loading(t("prompts.loadingPresetReferences"), 0);
        setLoadingReferences(true);
        try {
            const loaded = await Promise.all(
                item.referenceImageUrls.map(async (url, index) => {
                    const existing = item.applyMode === "append" ? references.find(ref => ref.id === `preset:${url}`) : undefined;
                    if (existing) return existing;
                    const stored = await uploadImage(url);
                    return { id: `preset:${url}`, name: item.referenceImageNames?.[index] || `${item.title}-${index + 1}`, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey };
                }),
            );
            setPrompt((prev) => item.applyMode === "replace" ? item.prompt : (prev.trim() ? `${prev}\n\n${item.prompt}` : item.prompt));
            if (item.applyMode === "append") {
                setReferences(value => [...value, ...loaded.filter(ref => !value.some(existing => existing.id === ref.id))]);
            } else if (item.applyMode === "replace" || loaded.length) setReferences(loaded);
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("prompts.loadPresetReferencesFailed"));
        } finally {
            hide();
            setLoadingReferences(false);
        }
    };

    const insertPickedAsset = async (payload: InsertAssetPayload) => {
        if (payload.kind === "text") {
            setPrompt(payload.content);
        } else if (payload.kind === "image") {
            const stored = await uploadImage(payload.dataUrl);
            setReferences((value) => [...value, { id: nanoid(), name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey }]);
        } else {
            message.warning(t("imageWorkbench.unsupportedAsset"));
        }
        setAssetPickerOpen(false);
    };

    const createSession = () => {
        processedCommandRef.current = 0;
        setLoadingReferences(false);
        setDraftTarget(undefined);
        commandNameRef.current = undefined;
        activeTargetRef.current = null;
        setPrompt("");
        setReferences([]);
        setResults([]);
        setElapsedMs(0);
        setStartedAt(0);
        setSelectedLogIds([]);
        setPreviewLog(null);
    };

    const deleteSelectedLogs = async () => {
        try {
            await deleteImageHistory(selectedLogIds);
            if (previewLog && selectedLogIds.includes(previewLog.id)) { setPreviewLog(null); setResults([]); }
            setSelectedLogIds([]);
            setDeleteConfirmOpen(false);
            await refreshLogs();
        } catch (error) { message.error(error instanceof Error ? error.message : "删除记录失败"); }
    };

    const saveLog = async (log: GenerationLog) => {
        await saveImageHistory(await serializeLog(log));
        await refreshLogs();
    };

    const refreshLogs = async () => {
        try { setLogs(await readStoredLogs()); }
        catch (error) { message.error(error instanceof Error ? error.message : "读取服务器生成记录失败"); }
    };

    const importBrowserHistory = async () => {
        setImportingHistory(true);
        try {
            const serverLogs = await listImageHistory<GenerationLog>();
            const existing = new Set(serverLogs.map(log => log.id));
            const local: GenerationLog[] = [];
            await browserLogStore.iterate<GenerationLog, void>(log => { if (!existing.has(log.id)) local.push(log); });
            let imported = 0;
            const failures: string[] = [];
            for (const log of local) {
                try {
                    const saved = await saveImageHistory(await serializeLog(await normalizeLog(log)));
                    serverLogs.push(saved);
                    imported++;
                } catch (error) { failures.push(`${log.title || log.id}：${error instanceof Error ? error.message : "图片读取失败"}`); }
            }
            const linkedImages = new Set(serverLogs.flatMap(log => log.images.map(image => image.id)));
            let recovered = 0;
            for (const image of await listGeneratedImages()) {
                if (linkedImages.has(image.id) || serverLogs.some(log => log.id === `recovered-${image.id}`)) continue;
                const log = await normalizeLog({
                    id: `recovered-${image.id}`, createdAt: Date.parse(image.createdAt),
                    title: `已恢复图片 · ${image.name}`, prompt: "", time: new Date(image.createdAt).toLocaleString(),
                    successCount: 1, imageCount: 1, status: "success",
                    images: [{ ...image, dataUrl: generatedImageUrl(image.id), durationMs: 0, width: 0, height: 0 }],
                });
                // Registry metadata cannot reconstruct the original prompt or parameters.
                await saveImageHistory({ ...log, prompt: "" });
                recovered++;
            }
            await refreshLogs();
            if (failures.length) message.error(`已导入 ${imported} 条，恢复 ${recovered} 张图片；${failures.length} 条未导入，原数据保留。${failures[0]}`);
            else message.success(`已导入 ${imported} 条本机记录，恢复 ${recovered} 张图片，原浏览器数据保留`);
        } catch (error) {
            await refreshLogs();
            message.error(error instanceof Error ? error.message : "导入记录失败");
        } finally { setImportingHistory(false); }
    };

    const renameLog = async (id: string, title: string) => {
        const log = logs.find(item => item.id === id);
        if (!log || !title.trim() || title.trim() === log.title) return;
        try {
            await saveLog({ ...log, title: title.trim() });
            setPreviewLog(current => current?.id === id ? { ...current, title: title.trim() } : current);
        } catch (error) { message.error(error instanceof Error ? error.message : "修改记录名称失败"); }
    };

    const previewGenerationLog = async (log: GenerationLog) => {
        processedCommandRef.current = 0;
        setLoadingReferences(false);
        setDraftTarget(undefined);
        commandNameRef.current = undefined;
        activeTargetRef.current = null;
        setPreviewLog(log);
        setLogsOpen(false);
        setPrompt(log.prompt);
        setReferences(log.references || []);
        const savedModel = log.config.imageModel || log.model;
        if (savedModel) {
            const matches = selectableModelsByCapability(effectiveConfig, "image").filter(value => modelOptionName(value) === modelOptionName(savedModel));
            const restoredModel = normalizeModelOptionValue(savedModel, effectiveConfig.channels) || (matches.length === 1 ? matches[0] : "");
            if (restoredModel && modelMatchesCapability(effectiveConfig, restoredModel, "image")) updateConfig("imageModel", restoredModel);
            else message.warning("历史记录的模型渠道已失效或存在多个同名模型，请重新选择生图模型");
        }
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
        if (log.config.background !== undefined) updateConfig("background", log.config.background);
        if (log.config.systemPrompt !== undefined) updateConfig("systemPrompt", log.config.systemPrompt);
        setResults(log.images.map((image) => ({ id: image.id, status: "success", image })));
    };

    const buildRequestSnapshot = () => {
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            return null;
        }
        if (!modelMatchesCapability(effectiveConfig, model, "image") || !isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return null;
        }
        return { text, config: { ...effectiveConfig, model, count: "1" }, references: [...references] };
    };

    const runGenerationSlot = async (index: number, snapshot: { text: string; config: AiConfig; references: ReferenceImage[]; taskId?: string; target?: WorkbenchTarget; name?: string }) => {
        const itemStartedAt = performance.now();
        try {
            const result = snapshot.references.length ? await requestEdit(snapshot.config, snapshot.text, snapshot.references) : await requestGeneration(snapshot.config, snapshot.text);
            const image = result[0];
            if (!image) throw new Error(t("imageWorkbench.missingResult"));
            const stored = await uploadImage(image.dataUrl);
            const nextImage: GeneratedImage = { id: image.id, dataUrl: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), durationMs: performance.now() - itemStartedAt, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
            const registered = await registerGeneratedImage(nextImage, { name: `${snapshot.name?.trim() && /\p{Script=Han}/u.test(snapshot.name) ? snapshot.name.trim() : "生成图片"}-${index + 1}`, taskId: snapshot.taskId, canvasId: snapshot.target?.canvasId, nodeId: snapshot.target?.nodeId });
            nextImage.id = registered.id;
            nextImage.name = registered.name;
            nextImage.dataUrl = generatedImageUrl(registered.id);
            setResults((value) => updateResultAt(value, index, { status: "success", image: nextImage }));
            return nextImage;
        } catch (error) {
            setResults((value) => updateResultAt(value, index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") }));
            throw error;
        }
    };

    const retryResult = async (index: number) => {
        const snapshot = buildRequestSnapshot();
        if (!snapshot) return;
        setPreviewLog(null);
        setResults((value) => updateResultAt(value, index, { status: "pending", error: undefined, image: undefined }));
        const retryStartedAt = performance.now();
        try {
            const binding = activeTargetRef.current;
            const image = await runGenerationSlot(index, { ...snapshot, ...binding });
            if (binding?.target) {
                const previous = results.flatMap(result => result.image ? [result.image] : []);
                await fillTarget(binding.target, binding.taskId, [...previous, image], snapshot.text);
            }
            await saveLog(
                buildLog({
                    prompt: snapshot.text,
                    model,
                    config: { ...snapshot.config, count: "1" },
                    references: snapshot.references,
                    durationMs: performance.now() - retryStartedAt,
                    successCount: 1,
                    failCount: 0,
                    status: "success",
                    images: [image],
                }),
            );
            message.success(t("workbench.retrySuccess"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("workbench.generationFailed"));
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:block">
                    <LogPanel
                        logs={logs}
                        selectedLogIds={selectedLogIds}
                        activeLogId={previewLog?.id}
                        onSelectedLogIdsChange={setSelectedLogIds}
                        onCreateSession={createSession}
                        onDeleteSelected={() => setDeleteConfirmOpen(true)}
                        onPreviewLog={(log) => void previewGenerationLog(log)}
                        onRenameLog={(id, title) => void renameLog(id, title)}
                        onImportHistory={() => void importBrowserHistory()}
                        importingHistory={importingHistory}
                    />
                </aside>

                <section className="grid gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[minmax(420px,48%)_minmax(0,1fr)]">
                    <div className="thin-scrollbar flex flex-col rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto">
                        <div>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">{t("imageWorkbench.title")}</h1>
                                </div>
                                <div className="flex shrink-0 gap-2 lg:hidden">
                                    <Button icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                        {t("workbench.logs")}
                                    </Button>
                                    <Button icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                        {t("workbench.settings")}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 space-y-5">
                            <div>
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">{t("workbench.prompt")}</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<BookOpen className="size-3.5" />} onClick={() => setPromptDialogOpen(true)}>
                                            {t("workbench.viewPrompts")}
                                        </Button>
                                        <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setAssetPickerOpen(true)}>
                                            {t("workbench.viewAssets")}
                                        </Button>
                                    </div>
                                </div>
                                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} autoSize={{ minRows: 7, maxRows: 18 }} placeholder={t("imageWorkbench.promptPlaceholder")} />
                            </div>

                            <div className="min-w-0">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <span className="text-base font-semibold">{t("imageWorkbench.references")}</span>
                                    <div className="flex gap-2">
                                        <Button size="small" icon={<ClipboardPaste className="size-3.5" />} onClick={() => void addReferencesFromClipboard()}>
                                            {t("workbench.clipboard")}
                                        </Button>
                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => fileInputRef.current?.click()}>
                                            {t("workbench.upload")}
                                        </Button>
                                    </div>
                                </div>
                                <div
                                    className={`hover-scrollbar hover-scrollbar-hint relative flex min-h-24 w-full min-w-0 max-w-full gap-2 overflow-x-scroll overflow-y-hidden rounded-lg border border-dashed p-2 pb-3 overscroll-x-contain transition-colors ${isReferenceDragActive ? "border-stone-900 bg-stone-100/80 dark:border-stone-100 dark:bg-stone-900/80" : "border-stone-300 dark:border-stone-700"}`}
                                    onDragEnter={(event) => {
                                        event.preventDefault();
                                        dragDepthRef.current += 1;
                                        if (event.dataTransfer.types.includes("Files")) setIsReferenceDragActive(true);
                                    }}
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "copy";
                                    }}
                                    onDragLeave={(event) => {
                                        event.preventDefault();
                                        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                                        if (!dragDepthRef.current) setIsReferenceDragActive(false);
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        dragDepthRef.current = 0;
                                        setIsReferenceDragActive(false);
                                        void addReferences(event.dataTransfer.files);
                                    }}
                                    onWheel={(event) => {
                                        if (event.currentTarget.scrollWidth <= event.currentTarget.clientWidth) return;
                                        event.preventDefault();
                                        event.currentTarget.scrollLeft += event.deltaY;
                                    }}
                                >
                                    {references.map((item, index) => (
                                        <div key={item.id} className="w-20 shrink-0" title={item.name}>
                                            <div className="group relative size-20 overflow-hidden rounded-md border border-stone-200 dark:border-stone-800">
                                            <img src={previewUrlFor(item.storageKey) || item.dataUrl} alt={item.name} className="size-full object-cover" />
                                            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{imageReferenceLabel(index)}</span>
                                            <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                                                <button
                                                    type="button"
                                                    className="flex size-6 items-center justify-center rounded bg-black/60 text-white"
                                                    onClick={() => {
                                                        replaceIndexRef.current = index;
                                                        replaceInputRef.current?.click();
                                                    }}
                                                    aria-label={t("imageWorkbench.replaceReference")}
                                                >
                                                    <RefreshCw className="size-3.5" />
                                                </button>
                                                <button
                                                    type="button"
                                                    className="flex size-6 items-center justify-center rounded bg-black/60 text-white"
                                                    onClick={() => setReferences((value) => value.filter((ref) => ref.id !== item.id))}
                                                    aria-label={t("imageWorkbench.removeReference")}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </button>
                                            </div>
                                            </div>
                                            <ReferenceOrderButtons index={index} total={references.length} onMove={(offset) => setReferences((value) => moveListItem(value, index, offset))} />
                                        </div>
                                    ))}
                                    {!references.length ? <div className="flex min-w-full items-center justify-center text-sm text-stone-500">{isReferenceDragActive ? t("imageWorkbench.dropReferences") : t("imageWorkbench.noReferences")}</div> : null}
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900 sm:hidden">
                                <span className="truncate text-stone-500 dark:text-stone-400">
                                    {modelOptionLabel(effectiveConfig, model)} · {effectiveConfig.size} · {effectiveConfig.quality}
                                </span>
                                <Button size="small" type="text" icon={<SlidersHorizontal className="size-4" />} onClick={() => setSettingsOpen(true)}>
                                    {t("workbench.adjust")}
                                </Button>
                            </div>

                            <div className="hidden gap-4 sm:grid sm:grid-cols-2">
                                <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                            </div>
                        </div>

                        <div className="mt-auto pt-6">
                            {draftTarget ? <div className="mb-2 text-xs text-muted-foreground">编辑后点击生成，成功后回填到「{commandNameRef.current || draftTarget.nodeId}」<Button type="text" size="small" disabled={running} onClick={() => setDraftTarget(undefined)}>取消回填</Button></div> : null}
                            <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={running || loadingReferences} disabled={!canGenerate || running || loadingReferences} onClick={() => void generate()}>
                                {t("workbench.generate")}
                            </Button>
                        </div>
                    </div>

                    <div className="thin-scrollbar rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold">{t("workbench.results")}</h2>
                            </div>
                            {running ? <Tag className="m-0 px-2 py-1">{t("workbench.waiting", { time: formatDuration(elapsedMs) })}</Tag> : null}
                        </div>
                        {results.length ? (
                            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                                {results.map((result, index) =>
                                    result.status === "success" && result.image ? (
                                        <ResultImageCard key={result.id} image={result.image} index={index} onEdit={addResultToReferences} onDownload={downloadImage} onSaveAsset={saveResultToAssets} />
                                    ) : result.status === "failed" ? (
                                        <FailedImageCard key={result.id} error={result.error || t("workbench.generationFailed")} onRetry={() => retryResult(index)} />
                                    ) : (
                                        <PendingImageCard key={result.id} />
                                    ),
                                )}
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 text-center dark:border-stone-700 lg:min-h-[560px]">
                                <ImagePlus className="mb-4 size-11 text-stone-400" />
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("imageWorkbench.empty")} />
                            </div>
                        )}
                    </div>
                </section>
            </main>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                    void addReferences(event.target.files);
                    event.target.value = "";
                }}
            />
            <input
                ref={replaceInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void replaceReference(event.target.files?.[0]);
                    event.target.value = "";
                }}
            />
            <Drawer title={t("workbench.logs")} placement="bottom" size="large" open={logsOpen} onClose={() => setLogsOpen(false)}>
                <LogPanel
                    logs={logs}
                    selectedLogIds={selectedLogIds}
                    activeLogId={previewLog?.id}
                    onSelectedLogIdsChange={setSelectedLogIds}
                    onCreateSession={createSession}
                    onDeleteSelected={() => setDeleteConfirmOpen(true)}
                    onPreviewLog={(log) => void previewGenerationLog(log)}
                    onRenameLog={(id, title) => void renameLog(id, title)}
                        onImportHistory={() => void importBrowserHistory()}
                        importingHistory={importingHistory}
                />
            </Drawer>
            <Drawer title={t("workbench.settings")} placement="bottom" size="82vh" open={settingsOpen} onClose={() => setSettingsOpen(false)}>
                <div className="grid grid-cols-2 gap-3 pb-4">
                    <GenerationSettings config={effectiveConfig} model={model} updateConfig={updateConfig} openConfigDialog={openConfigDialog} />
                </div>
            </Drawer>
            <PromptSelectDialog open={promptDialogOpen} onOpenChange={setPromptDialogOpen} onSelect={(item) => void applyPromptPreset(item)} />
            <AssetPickerModal open={assetPickerOpen} defaultTab="my-assets" onInsert={(payload) => void insertPickedAsset(payload)} onClose={() => setAssetPickerOpen(false)} />
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>
        </div>
    );
}

function GenerationSettings({ config, model, updateConfig, openConfigDialog }: { config: AiConfig; model: string; updateConfig: UpdateAiConfig; openConfigDialog: (shouldPromptContinue?: boolean) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { t } = useTranslation();

    return (
        <>
            <label className="col-span-2 block min-w-0 sm:col-span-1">
                <span className="mb-1.5 block text-sm font-semibold sm:mb-2 sm:text-base">{t("workbench.model")}</span>
                <ModelPicker config={config} value={model} onChange={(value) => updateConfig("imageModel", value)} capability="image" fullWidth onMissingConfig={() => openConfigDialog(false)} />
            </label>
            <div className="col-span-2">
                <ImageSettingsPanel config={config} onConfigChange={(key, value) => updateConfig(key, value)} theme={theme} showTitle={false} className="space-y-4" maxCount={10} />
            </div>
        </>
    );
}

function ResultImageCard({
    image,
    index,
    onEdit,
    onDownload,
    onSaveAsset,
}: {
    image: GeneratedImage;
    index: number;
    onEdit: (image: GeneratedImage, index: number) => void;
    onDownload: (image: GeneratedImage, index: number) => void;
    onSaveAsset: (image: GeneratedImage, index: number) => void;
}) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    return (
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-background dark:border-stone-800">
            <div className="mx-auto w-3/5 [&_.ant-image]:block">
                <Image src={previewUrlFor(image.storageKey) || image.dataUrl} preview={{ src: image.dataUrl }} alt={t("imageWorkbench.resultAlt", { count: index + 1 })} width="100%" style={{ display: "block", width: "100%", height: "auto" }} />
            </div>
            <div className="space-y-2 border-t border-stone-200 px-3 py-2.5 dark:border-stone-800">
                <div className="flex min-w-0 gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-stone-400">
                    {image.width > 0 && image.height > 0 ? <span>
                        {image.width}x{image.height}
                    </span> : null}
                    <span>{formatBytes(image.bytes)}</span>
                    <span>{formatDuration(image.durationMs)}</span>
                </div>
                <div className="break-words text-xs">{image.name || image.id}</div>
                <Typography.Text copyable={{ text: image.id }} className="!text-xs break-all" type="secondary">图片 ID：{image.id}</Typography.Text>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                    <Tooltip title={t("common.addToAssets")}>
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => void onSaveAsset(image, index)}>
                            {t("common.addToAssets")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("imageWorkbench.addReference")}>
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<PenLine className="size-3.5" />} onClick={() => void onEdit(image, index)}>
                            {t("imageWorkbench.addReference")}
                        </Button>
                    </Tooltip>
                    <Tooltip title={t("common.download")}>
                        <Button className={RESULT_ACTION_BUTTON_CLASS} size="small" icon={<Download className="size-3.5" />} onClick={() => onDownload(image, index)}>
                            {t("common.download")}
                        </Button>
                    </Tooltip>
                    <SaveToLibraryButton className={RESULT_ACTION_BUTTON_CLASS} dataUrl={image.dataUrl} storageKey={image.storageKey} name={`${image.id}.${libraryFileExt(image.mimeType)}`} />
                </div>
            </div>
        </div>
    );
}

function PendingImageCard() {
    const { t } = useTranslation();
    return (
        <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900">
            <div
                className="absolute inset-0 opacity-60"
                style={{
                    backgroundImage: "radial-gradient(circle, rgba(120,113,108,0.35) 1.4px, transparent 1.6px)",
                    backgroundSize: "16px 16px",
                }}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-stone-500 dark:text-stone-400">
                <LoaderCircle className="size-6 animate-spin" />
                <span>{t("workbench.generating")}</span>
            </div>
        </div>
    );
}

function FailedImageCard({ error, onRetry }: { error: string; onRetry: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden rounded-lg border border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20">
            <div className="flex aspect-[3/4] flex-col items-center justify-center gap-3 p-5 text-center">
                <div className="text-sm font-medium text-red-600 dark:text-red-300">{t("workbench.failed")}</div>
                <Typography.Paragraph ellipsis={{ rows: 4 }} className="!mb-0 !text-xs !text-red-500 dark:!text-red-300">
                    {error}
                </Typography.Paragraph>
            </div>
            <div className="flex justify-end border-t border-red-200 p-3 dark:border-red-950">
                <Button size="small" danger onClick={onRetry}>
                    {t("workbench.retry")}
                </Button>
            </div>
        </div>
    );
}

function updateResultAt(results: GenerationResult[], index: number, next: Partial<GenerationResult>) {
    return results.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item));
}

function LogPanel({
    logs,
    selectedLogIds,
    activeLogId,
    onSelectedLogIdsChange,
    onCreateSession,
    onDeleteSelected,
    onPreviewLog,
    onRenameLog,
    onImportHistory,
    importingHistory,
}: {
    logs: GenerationLog[];
    selectedLogIds: string[];
    activeLogId?: string;
    onSelectedLogIdsChange: (ids: string[]) => void;
    onCreateSession: () => void;
    onDeleteSelected: () => void;
    onPreviewLog: (log: GenerationLog) => void;
    onRenameLog: (id: string, title: string) => void;
    onImportHistory: () => void;
    importingHistory: boolean;
}) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selectedLogIds.length === logs.length;
    const toggleAll = () => onSelectedLogIdsChange(allSelected ? [] : logs.map((log) => log.id));

    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold">{t("workbench.logs")}</h2>
                </div>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onCreateSession}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" icon={<Upload className="size-3.5" />} loading={importingHistory} onClick={onImportHistory}>导入本机历史</Button>
                <Button size="small" icon={<CheckSquare className="size-3.5" />} disabled={!logs.length} onClick={toggleAll}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedLogIds.length} onClick={onDeleteSelected}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-3">
                {logs.map((log) => (
                    <LogCard
                        key={log.id}
                        log={log}
                        selected={selectedLogIds.includes(log.id)}
                        active={activeLogId === log.id}
                        onSelectedChange={(checked) => onSelectedLogIdsChange(checked ? [...selectedLogIds, log.id] : selectedLogIds.filter((id) => id !== log.id))}
                        onClick={() => onPreviewLog(log)}
                        onRename={(title) => onRenameLog(log.id, title)}
                    />
                ))}
                {!logs.length ? <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-stone-300 text-center text-sm text-stone-500 dark:border-stone-700">{t("workbench.noLogs")}</div> : null}
            </div>
        </>
    );
}

function LogCard({ log, selected, active, onSelectedChange, onClick, onRename }: { log: GenerationLog; selected: boolean; active: boolean; onSelectedChange: (checked: boolean) => void; onClick: () => void; onRename: (title: string) => void }) {
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const thumbnails = log.images.filter((image) => image.dataUrl).slice(0, 4);

    return (
        <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onClick(); } }}
            className={`block w-full rounded-lg border p-2 text-left transition ${active ? "border-stone-900 bg-blue-50 dark:border-stone-100 dark:bg-blue-950/20" : "border-stone-200 bg-background hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900"}`}
            onClick={onClick}
        >
            <div className="grid grid-cols-[minmax(128px,1fr)_auto] gap-2">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-2">
                    <Checkbox className="mt-0.5" checked={selected} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelectedChange(event.target.checked)} />
                    <div className="min-w-0">
                        <div className="text-sm font-semibold leading-5" onClick={(event) => event.stopPropagation()}>
                            <Typography.Text editable={{ tooltip: "修改记录名称", onChange: onRename }} className="!text-sm !font-semibold break-words">{log.title}</Typography.Text>
                        </div>
                        {thumbnails.length ? (
                            <div className="mt-2 flex gap-1 overflow-hidden">
                                {thumbnails.map((image) => (
                                    <img key={image.id} src={previewUrlFor(image.storageKey) || image.dataUrl} alt="" className="size-8 shrink-0 rounded-md object-cover" />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
                <div className="grid justify-items-end gap-2">
                    <div className="flex gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="blue">
                            {t("workbench.successCount", { count: log.successCount ?? log.imageCount })}
                        </Tag>
                        {log.failCount ? (
                            <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="red">
                                {t("workbench.failCount", { count: log.failCount })}
                            </Tag>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{t("workbench.itemCount", { count: log.imageCount })}</Tag>
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none" color="green">
                            {formatDuration(log.durationMs)}
                        </Tag>
                    </div>
                    <div className="flex justify-end">
                        <Tag className="m-0 flex h-6 items-center rounded-md px-1.5 text-xs leading-none">{log.time}</Tag>
                    </div>
                </div>
            </div>
        </div>
    );
}

async function readStoredLogs() {
    return Promise.all((await listImageHistory<GenerationLog>()).map(normalizeLog));
}

async function normalizeLog(log: Partial<GenerationLog>): Promise<GenerationLog> {
    const references = await Promise.all(
        (log.references || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const images = await Promise.all(
        (log.images || []).map(async (item) => {
            void ensureImagePreview(item.storageKey);
            return { ...item, dataUrl: await resolveImageUrl(item.storageKey, item.dataUrl) };
        }),
    );
    const config = normalizeLogConfig(log);
    return {
        id: log.id || nanoid(),
        createdAt: log.createdAt || Date.now(),
        title: log.title || log.model || i18n.t("workbench.untitled"),
        prompt: log.prompt || log.title || "",
        time: log.time || new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model: log.model || config.imageModel || "",
        config,
        references,
        durationMs: log.durationMs || 0,
        successCount: log.successCount ?? log.imageCount ?? 0,
        failCount: log.failCount || 0,
        imageCount: log.imageCount || log.successCount || 0,
        size: log.size || config.size || "",
        quality: log.quality || config.quality || "",
        status: log.status || "success",
        images,
    };
}

async function serializeLog(log: GenerationLog): Promise<GenerationLog> {
    return {
        ...log,
        references: await Promise.all(log.references.map(async item => ({ ...item, url: undefined, storageKey: undefined, dataUrl: await imageToDataUrl(item) }))),
        images: await Promise.all(log.images.map(async image => ({ ...image, storageKey: undefined, dataUrl: image.dataUrl.startsWith("/api/generated-images/") ? image.dataUrl : await imageToDataUrl(image) }))),
    };
}

function normalizeLogConfig(log: Partial<GenerationLog>): GenerationLogConfig {
    return {
        model: log.config?.model || log.model || "",
        imageModel: log.config?.imageModel || log.model || "",
        quality: log.config?.quality || log.quality || "",
        size: log.config?.size || log.size || "",
        count: log.config?.count || String(log.imageCount || log.successCount || 1),
        background: log.config?.background || "", systemPrompt: log.config?.systemPrompt || "",
        apiFormat: log.config?.apiFormat || "openai", baseUrl: log.config?.baseUrl || "",
    };
}

function moveListItem<T>(items: T[], index: number, offset: number) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= items.length) return items;
    const next = [...items];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    return next;
}

function ReferenceOrderButtons({ index, total, onMove }: { index: number; total: number; onMove: (offset: number) => void }) {
    if (total <= 1) return null;
    return (
        <div className="mt-1 flex justify-center gap-2">
            <Button type="text" size="small" aria-label="参考图左移" title="左移" className="!h-5 !w-5 !min-w-5 !rounded !p-0" icon={<ArrowLeft className="size-3.5" />}  disabled={index <= 0} onClick={() => onMove(-1)} />
            <Button type="text" size="small" aria-label="参考图右移" title="右移" className="!h-5 !w-5 !min-w-5 !rounded !p-0" icon={<ArrowRight className="size-3.5" />}  disabled={index >= total - 1} onClick={() => onMove(1)} />
        </div>
    );
}

function buildLog({
    prompt,
    model,
    config,
    references,
    durationMs,
    successCount,
    failCount,
    status,
    images,
}: {
    prompt: string;
    model: string;
    config: GenerationLogConfig;
    references: ReferenceImage[];
    durationMs: number;
    successCount: number;
    failCount: number;
    status: GenerationLog["status"];
    images: GeneratedImage[];
}): GenerationLog {
    const logConfig = {
        model: config.model,
        imageModel: config.imageModel,
        quality: config.quality,
        size: config.size,
        count: config.count,
        background: config.background, systemPrompt: config.systemPrompt, apiFormat: config.apiFormat, baseUrl: config.baseUrl,
    };
    return {
        id: nanoid(),
        createdAt: Date.now(),
        title: images[0]?.name?.replace(/-\d+$/, "") || "图片生成",
        prompt,
        time: new Date().toLocaleString(i18n.resolvedLanguage, { hour12: false }),
        model,
        config: logConfig,
        references,
        durationMs,
        successCount,
        failCount,
        imageCount: Number(logConfig.count) || successCount,
        size: logConfig.size,
        quality: logConfig.quality,
        status,
        images,
    };
}

async function fillTarget(target: WorkbenchTarget, taskId: string, images: GeneratedImage[], prompt: string) {
    const result = await updateWorkbenchTarget(target, taskId, "complete", images.map(image => ({ id: image.id, status: "success", content: generatedImageUrl(image.id), naturalWidth: image.width, naturalHeight: image.height, bytes: image.bytes, mimeType: image.mimeType || "image/png" })), prompt);
    useCanvasStore.getState().mergeRemoteProject(result.project);
    return result.applied;
}
