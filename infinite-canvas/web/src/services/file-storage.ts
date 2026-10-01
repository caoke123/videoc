import localforage from "localforage";
import { nanoid } from "nanoid";

import { withLocalProxy } from "@/stores/use-config-store";
import { fetchMediaBlob, mediaFileExists, mediaFileUrl, saveMediaBlob } from "@/services/api/shared-storage";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number };

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "media_files" });
const objectUrls = new Map<string, string>();

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    let blob: Blob;
    if (typeof input === "string") {
        const response = await fetch(withLocalProxy(input));
        if (!response.ok) throw new Error("下载媒体文件失败，未保存");
        blob = await response.blob();
    } else blob = input;
    const existing = typeof input === "string" ? /^\/api\/media-files\/([^/]+)$/.exec(input) : null;
    const storageKey = existing ? decodeURIComponent(existing[1]) : `${prefix}:${nanoid()}`;
    await store.setItem(storageKey, blob).catch(() => undefined);
    const url = existing ? mediaFileUrl(storageKey) : (await saveMediaBlob(storageKey, blob)).url;
    objectUrls.set(storageKey, url);
    const meta = blob.type.startsWith("video/") ? await readVideoMeta(url) : blob.type.startsWith("audio/") ? await readAudioMeta(url) : {};
    return { url, storageKey, bytes: blob.size, mimeType: blob.type || "application/octet-stream", ...meta };
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    if (fallback.startsWith("/api/")) return fallback;
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    if (await mediaFileExists(storageKey)) {
        const url = mediaFileUrl(storageKey);
        objectUrls.set(storageKey, url);
        return url;
    }
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const { url } = await saveMediaBlob(storageKey, blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getMediaBlob(storageKey: string) {
    const saved = await fetchMediaBlob(storageKey);
    if (saved) return saved;
    const original = await store.getItem<Blob>(storageKey);
    if (original) await saveMediaBlob(storageKey, original);
    return original;
}

export async function setMediaBlob(storageKey: string, blob: Blob) {
    const { url } = await saveMediaBlob(storageKey, blob);
    await store.setItem(storageKey, blob).catch(() => undefined);
    objectUrls.set(storageKey, url);
    return url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedMedia(usedData: unknown) {
    const usedKeys = collectMediaStorageKeys(usedData);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await Promise.all(unused.map((key) => store.removeItem(key)));
}

export function collectMediaStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.includes(":")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectMediaStorageKeys(child, keys)) : collectMediaStorageKeys(item, keys)));
    return keys;
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
