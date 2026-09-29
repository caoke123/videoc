import { useEffect, useMemo, useState } from "react";
import { App, Empty, Input, Spin, Tag } from "antd";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { libraryFileUrl, listLibrary, type LibraryAssetItem, type LibraryCategory } from "@/services/api/library";

// Shared grid for browsing production/assets/ (server-side library that grows over time
// as jobs collect it): search + category filter + click-to-select. Used by both the
// "选择资产" modal's 素材库 tab and the per-node "从素材库选择" picker.
export function LibraryBrowser({ onSelect, actionLabel }: { onSelect: (item: LibraryAssetItem) => void; actionLabel?: string }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [categories, setCategories] = useState<LibraryCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [categoryId, setCategoryId] = useState<string>("all");

    useEffect(() => {
        let cancelled = false;
        listLibrary()
            .then((data) => { if (!cancelled) setCategories(data); })
            .catch((error) => { if (!cancelled) message.error(error instanceof Error ? error.message : "素材库读取失败"); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [message]);

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return categories
            .filter((category) => categoryId === "all" || category.id === categoryId)
            .flatMap((category) => category.items)
            .filter((item) => !query || item.path.toLowerCase().includes(query) || (item.group || "").toLowerCase().includes(query));
    }, [categories, keyword, categoryId]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-3 pb-2">
                <Input size="small" className="w-56" allowClear prefix={<Search className="size-3.5 text-stone-400" />} placeholder={t("canvas.assetPicker.librarySearch")} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5 pb-2">
                <Tag.CheckableTag checked={categoryId === "all"} className={cn("prompt-filter-tag", categoryId === "all" && "is-active")} onChange={() => setCategoryId("all")}>
                    {t("common.all")}
                </Tag.CheckableTag>
                {categories.map((category) => (
                    <Tag.CheckableTag key={category.id} checked={categoryId === category.id} className={cn("prompt-filter-tag", categoryId === category.id && "is-active")} onChange={() => setCategoryId((prev) => (prev === category.id ? "all" : category.id))}>
                        {category.label}（{category.items.length}）
                    </Tag.CheckableTag>
                ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex min-h-40 items-center justify-center"><Spin /></div>
                ) : filtered.length ? (
                    <div className="grid grid-cols-4 gap-3">
                        {filtered.map((item) => (
                            <LibraryItemCard key={item.path} item={item} actionLabel={actionLabel} onClick={() => onSelect(item)} />
                        ))}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("canvas.assetPicker.libraryEmpty")} className="py-12" />
                )}
            </div>
        </div>
    );
}

function LibraryItemCard({ item, actionLabel, onClick }: { item: LibraryAssetItem; actionLabel?: string; onClick: () => void }) {
    const { t } = useTranslation();
    return (
        <button
            type="button"
            className="group relative aspect-[9/16] cursor-pointer overflow-hidden rounded-lg border border-stone-200 bg-white text-left transition hover:border-stone-400 hover:shadow-md dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-500"
            onClick={onClick}
        >
            <img src={libraryFileUrl(item.path)} alt={item.name} loading="lazy" className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-stone-950/0 text-sm font-medium text-white opacity-0 transition group-hover:bg-stone-950/55 group-hover:opacity-100">{actionLabel || t("canvas.assetPicker.insert")}</div>
        </button>
    );
}
