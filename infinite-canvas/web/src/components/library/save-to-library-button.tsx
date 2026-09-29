import { useState } from "react";
import { App, Button, Input, Popover, Select } from "antd";
import { LibraryBig } from "lucide-react";

import { getImageBlob } from "@/services/image-storage";
import { importLibraryAsset, LIBRARY_CATEGORY_OPTIONS } from "@/services/api/library";
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

// Pushes a workbench result or "我的资产" image straight into production/assets/ (as a candidate),
// the reverse direction of LibraryBrowser/LibraryPickerModal which only pull from the library.
export function SaveToLibraryButton({ dataUrl, storageKey, name, size = "small", className }: { dataUrl: string; storageKey?: string; name: string; size?: "small" | "middle"; className?: string }) {
    const { message } = App.useApp();
    const [open, setOpen] = useState(false);
    const [category, setCategory] = useState<string>(LIBRARY_CATEGORY_OPTIONS[0].value);
    const [group, setGroup] = useState("");
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        setSaving(true);
        try {
            const blob = await resolveBlob({ dataUrl, storageKey });
            const result = await importLibraryAsset(blob, category, withMatchingExt(name, blob), group.trim() || undefined);
            message.success(result.duplicate ? "素材库里已有相同图片，未重复收录" : "已收进素材库");
            setOpen(false);
            setGroup("");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "收录失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Popover
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            content={
                <div className="w-56 space-y-2">
                    <Select className="w-full" size="small" value={category} onChange={setCategory} options={LIBRARY_CATEGORY_OPTIONS} />
                    <Input size="small" placeholder="分组（可选，如 seatbelt-shoulder-pad/pink-lulu-v1）" value={group} onChange={(event) => setGroup(event.target.value)} onPressEnter={() => void submit()} />
                    <Button type="primary" size="small" block loading={saving} onClick={() => void submit()}>收录</Button>
                </div>
            }
        >
            <Button size={size} className={className} icon={<LibraryBig className="size-3.5" />}>收进素材库</Button>
        </Popover>
    );
}
