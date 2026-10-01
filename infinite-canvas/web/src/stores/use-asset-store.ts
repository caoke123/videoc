import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { nanoid } from "nanoid";
import { localForageStorage } from "@/lib/localforage-storage";
import { cleanupUnusedImages, ensureImagePreview, previewUrlFor, resolveImageUrl, uploadImage } from "@/services/image-storage";
import { cleanupUnusedMedia, resolveMediaUrl } from "@/services/file-storage";
import { deleteSharedRecord, listSharedRecords, saveSharedRecord } from "@/services/api/shared-storage";
import { persistMediaReferences } from "@/services/persistent-media";

export type AssetKind = "text" | "image" | "video";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    hydrateError: string | null;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

// 卡片用缩略图渲染，自定义封面（远程地址或单独上传的封面）保持原样。
export function assetCoverUrl(asset: Asset) {
    const own = asset.kind === "image" ? asset.data.dataUrl : "";
    const cover = asset.coverUrl || own;
    return asset.kind === "image" && cover === own ? previewUrlFor(asset.data.storageKey) || cover : cover;
}

const ASSET_STORE_KEY = "infinite-canvas:asset_store";
let savedAssets: Asset[] = [];
let assetWrites: Promise<unknown> = Promise.resolve();

const assetStorage: PersistStorage<AssetStore> = {
    getItem: async (name) => {
        const shared = await listSharedRecords<Asset>("assets");
        const value = await localForageStorage.getItem(name);
        const parsed = value ? JSON.parse(value) as StorageValue<AssetStore> : { state: { assets: [] } } as StorageValue<AssetStore>;
        const known = new Set([...shared.items.map(asset => asset.id), ...shared.deletedIds]);
        for (const asset of parsed.state.assets) {
            if (known.has(asset.id)) continue;
            const saved = await persistMediaReferences(asset);
            await saveSharedRecord("assets", asset.id, saved);
            shared.items.push(saved);
        }
        parsed.state.assets = shared.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        parsed.state.assets = await Promise.all(
            parsed.state.assets.map(async (asset) => {
                if (asset.kind === "video" && asset.data.storageKey) return { ...asset, data: { ...asset.data, url: await resolveMediaUrl(asset.data.storageKey, asset.data.url) } };
                if (asset.kind !== "image") return asset;
                if (asset.data.storageKey) {
                    void ensureImagePreview(asset.data.storageKey);
                    return {
                        ...asset,
                        coverUrl: asset.coverUrl.startsWith("blob:") ? await resolveImageUrl(asset.data.storageKey, asset.coverUrl) : asset.coverUrl,
                        data: { ...asset.data, dataUrl: await resolveImageUrl(asset.data.storageKey, asset.data.dataUrl) },
                    };
                }
                if (!asset.data.dataUrl.startsWith("data:image/")) return asset;
                const image = await uploadImage(asset.data.dataUrl);
                return { ...asset, coverUrl: asset.coverUrl.startsWith("data:image/") ? image.url : asset.coverUrl, data: { ...asset.data, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes, mimeType: image.mimeType } };
            }),
        );
        savedAssets = parsed.state.assets;
        return parsed;
    },
    setItem: (_name, value) => {
        assetWrites = assetWrites.catch(() => undefined).then(async () => {
            const assets = await persistMediaReferences(value.state.assets);
            const previous = new Map(savedAssets.map(asset => [asset.id, JSON.stringify(asset)]));
            for (const asset of assets) if (previous.get(asset.id) !== JSON.stringify(asset)) await saveSharedRecord("assets", asset.id, asset);
            for (const asset of savedAssets) if (!assets.some(next => next.id === asset.id)) await deleteSharedRecord("assets", asset.id);
            savedAssets = assets;
        });
        return assetWrites.catch(error => {
            void import("antd").then(({ message }) => message.error("资产未保存到服务端，请检查本地服务"));
            throw error;
        }) as Promise<void>;
    },
    removeItem: async () => {
        for (const asset of savedAssets) await deleteSharedRecord("assets", asset.id);
        savedAssets = [];
    },
};

export const useAssetStore = create<AssetStore>()(
    persist(
        (set, get) => ({
            hydrated: false,
            hydrateError: null,
            assets: [],
            addAsset: (asset) => {
                const now = new Date().toISOString();
                const id = nanoid();
                set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
                return id;
            },
            updateAsset: (id, patch) =>
                set((state) => ({
                    assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
                })),
            removeAsset: (id) =>
                set((state) => {
                    const assets = state.assets.filter((asset) => asset.id !== id);
                    get().cleanupImages({ assets });
                    return { assets };
                }),
            replaceAssets: (assets) => set({ assets }),
            cleanupImages: (extra) => {
                window.setTimeout(async () => {
                    const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
                    await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                    await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
                }, 0);
            },
        }),
        {
            name: ASSET_STORE_KEY,
            storage: assetStorage,
            partialize: (state) => ({ assets: state.assets }) as StorageValue<AssetStore>["state"],
            onRehydrateStorage: () => (_state, error) => {
                useAssetStore.setState({ hydrated: true, hydrateError: error ? "读取或补存资产失败，请检查服务后刷新页面；浏览器原记录仍保留" : null });
            },
        },
    ),
);
window.addEventListener("focus", () => {
    void assetWrites.catch(() => undefined).then(() => useAssetStore.persist.rehydrate());
});
