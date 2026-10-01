import { useState } from "react";
import { App, Button } from "antd";
import { LibraryBig } from "lucide-react";

import { getImageBlob } from "@/services/image-storage";
import { importLibraryAsset } from "@/services/api/library";
import { withLocalProxy } from "@/stores/use-config-store";

const MIME_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

async function resolveBlob({ dataUrl, storageKey }: { dataUrl: string; storageKey?: string }) {
    if (storageKey) {
        const blob = await getImageBlob(storageKey);
        if (blob) return blob;
    }
    try {
        const response = await fetch(withLocalProxy(dataUrl));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.blob();
    } catch {
        throw new Error("图片未缓存到本地，且远程地址无法直接读取（可能是跨域限制）。请在设置中开启本地转发代理后重试。");
    }
}

// The caller's `name` prop can carry a stale/guessed extension (e.g. older history records with no
// recorded mimeType); always rename to match the blob we are actually about to upload so the backend's
// extension-vs-content-type check never mismatches.
function withMatchingExt(name: string, blob: Blob) {
    const ext = MIME_EXT[blob.type];
    if (!ext) return name;
    return `${name.replace(/\.[^./]+$/, "")}.${ext}`;
}

// One click: the image lands in 素材库「未整理」 and is registered to a product/person/scene/material there.
export function SaveToLibraryButton({ dataUrl, storageKey, name, size = "small", className }: { dataUrl: string; storageKey?: string; name: string; size?: "small" | "middle"; className?: string }) {
    const { message } = App.useApp();
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            const blob = await resolveBlob({ dataUrl, storageKey });
            const result = await importLibraryAsset(blob, withMatchingExt(name, blob));
            message.success(result.duplicate ? "素材库里已有相同图片，未重复收录" : "已收进素材库「未整理」，到素材库页面登记归属");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "收录失败");
        } finally {
            setSaving(false);
        }
    };

    return <Button size={size} className={className} loading={saving} icon={<LibraryBig className="size-3.5" />} onClick={() => void submit()}>收进素材库</Button>;
}
