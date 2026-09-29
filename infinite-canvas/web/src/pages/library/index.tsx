import { useCallback, useEffect, useMemo, useState } from "react";
import { App, Button, Card, Empty, Input, Modal, Segmented, Spin } from "antd";
import { Copy, RefreshCw, Search } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes } from "@/lib/image-utils";
import { libraryFileUrl, listLibrary, type LibraryAssetItem, type LibraryCategory } from "@/services/api/library";

export default function LibraryPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [categories, setCategories] = useState<LibraryCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [categoryId, setCategoryId] = useState<string>("all");
    const [previewItem, setPreviewItem] = useState<LibraryAssetItem | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setCategories(await listLibrary());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材库读取失败");
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { void refresh(); }, [refresh]);

    const totalCount = categories.reduce((sum, category) => sum + category.items.length, 0);
    const segmentedOptions = useMemo(
        () => [{ value: "all", label: `全部（${totalCount}）` }, ...categories.map((category) => ({ value: category.id, label: `${category.label}（${category.items.length}）` }))],
        [categories, totalCount],
    );

    const visibleCategories = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return categories
            .filter((category) => categoryId === "all" || category.id === categoryId)
            .map((category) => ({ ...category, items: category.items.filter((item) => !query || item.path.toLowerCase().includes(query) || (item.group || "").toLowerCase().includes(query)) }))
            .filter((category) => category.items.length > 0);
    }, [categories, keyword, categoryId]);

    return (
        <main className="h-full overflow-auto bg-background text-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
                    <div>
                        <p className="text-xs text-muted-foreground">无限画布 · 共享素材</p>
                        <h1 className="mt-2 text-3xl font-semibold">素材库</h1>
                        <p className="mt-2 text-sm text-muted-foreground">角色定妆照、产品参考图、材料参考图、结构参考图，来自 production/assets，供各任务复用引用。</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void refresh()}>刷新</Button>
                </header>

                <div className="flex flex-wrap items-center gap-3">
                    <Segmented value={categoryId} onChange={(value) => setCategoryId(String(value))} options={segmentedOptions} />
                    <Input className="max-w-xs" allowClear prefix={<Search className="size-4 text-muted-foreground" />} placeholder="按文件名或分组搜索" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                </div>

                {loading ? (
                    <div className="flex min-h-64 items-center justify-center"><Spin /></div>
                ) : visibleCategories.length ? (
                    <div className="flex flex-col gap-8">
                        {visibleCategories.map((category) => (
                            <section key={category.id}>
                                <h2 className="mb-3 text-lg font-medium">{category.label}<span className="ml-2 text-sm font-normal text-muted-foreground">{category.items.length} 张</span></h2>
                                <div className="grid gap-4 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                                    {category.items.map((item) => (
                                        <LibraryCard key={item.path} item={item} onPreview={() => setPreviewItem(item)} onCopy={() => { copyText(item.ref, "已复制引用"); }} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                ) : (
                    <Empty className="py-20" description={totalCount ? "没有匹配的素材" : "素材库还是空的，去 production/assets 下按分类放图就会出现在这里"} />
                )}
            </div>

            <Modal open={Boolean(previewItem)} onCancel={() => setPreviewItem(null)} footer={null} centered width="auto" styles={{ body: { padding: 0, lineHeight: 0 } }}>
                {previewItem ? <img src={libraryFileUrl(previewItem.path)} alt={previewItem.name} className="max-h-[85vh] w-auto rounded" /> : null}
            </Modal>
        </main>
    );
}

function LibraryCard({ item, onPreview, onCopy }: { item: LibraryAssetItem; onPreview: () => void; onCopy: () => void }) {
    return (
        <Card hoverable size="small" className="overflow-hidden border-border bg-card" styles={{ body: { padding: 0 } }}>
            <button type="button" className="block w-full cursor-zoom-in" onClick={onPreview}>
                <img src={libraryFileUrl(item.path)} alt={item.name} className="aspect-[9/16] w-full object-cover" loading="lazy" />
            </button>
            <div className="p-3">
                <p className="line-clamp-1 text-xs font-medium">{item.name}</p>
                {item.group ? <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">{item.group}</p> : null}
                <p className="mt-1 text-[11px] text-muted-foreground">{formatBytes(item.bytes)}</p>
                <Button size="small" className="mt-2 w-full" icon={<Copy className="size-3.5" />} onClick={onCopy}>复制引用</Button>
            </div>
        </Card>
    );
}
