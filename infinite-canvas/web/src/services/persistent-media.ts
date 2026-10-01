import { nanoid } from "nanoid";
import { saveMediaBlob } from "@/services/api/shared-storage";

// Normalize at the document boundary as well as at upload time: no saved document may depend
// on a browser object URL. Existing IndexedDB files are copied, never removed during recovery.
export async function persistMediaReferences<T>(value: T): Promise<T> {
    if (typeof value === "string" && /^(blob:|data:(image|video|audio)\/)/.test(value)) {
        const response = await fetch(value);
        if (!response.ok) throw new Error("参考文件无法读取，尚未保存");
        return (await saveMediaBlob(`file:${nanoid()}`, await response.blob())).url as T;
    }
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return await Promise.all(value.map(persistMediaReferences)) as T;
    const item = value as Record<string, unknown>;
    const mediaFields = ["content", "url", "dataUrl", "coverUrl", "workbenchSourceContent"];
    const next = Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, child]) => [key, mediaFields.includes(key) ? child : await persistMediaReferences(child)])));
    const storageKey = typeof item.storageKey === "string" ? item.storageKey : undefined;
    for (const key of mediaFields) {
        const original = item[key];
        if (typeof original !== "string" || original.startsWith("/")) continue;
        if (!original && storageKey && ["url", "dataUrl", "content"].includes(key)) {
            const url = storageKey.startsWith("image:") ? await (await import("@/services/image-storage")).resolveImageUrl(storageKey)
                : await (await import("@/services/file-storage")).resolveMediaUrl(storageKey);
            if (!url) throw new Error(`原文件缺失，记录尚未补存：${storageKey}`);
            next[key] = url;
            continue;
        }
        if (!original) continue;
        const media = key === "dataUrl" || key === "coverUrl" || storageKey || item.mimeType || item.naturalWidth;
        if (!original.startsWith("blob:") && !original.startsWith("data:image/") && !original.startsWith("data:video/") && !original.startsWith("data:audio/") && !(media && /^https?:\/\//.test(original))) continue;
        let url = original;
        if (storageKey && (key !== "coverUrl" || original === item.dataUrl || original === item.url)) {
            const images = storageKey.startsWith("image:");
            url = images ? await (await import("@/services/image-storage")).resolveImageUrl(storageKey, original)
                : await (await import("@/services/file-storage")).resolveMediaUrl(storageKey, original);
        }
        if (url === original) {
            const response = await fetch(original);
            if (!response.ok) throw new Error(`文件无法读取，尚未保存到服务端：${storageKey || key}`);
            const blob = await response.blob();
            const id = storageKey || `file:${nanoid()}`;
            url = (await saveMediaBlob(id, blob)).url;
        }
        next[key] = url;
    }
    return next as T;
}
