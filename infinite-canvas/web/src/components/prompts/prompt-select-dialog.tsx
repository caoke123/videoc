import { LayoutGrid, List, Search } from "lucide-react";
import { type UIEvent, useEffect, useState } from "react";
import { App, Empty, Input, Modal, Segmented, Spin, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { usePromptSourceStore } from "@/stores/use-prompt-source-store";
import { PromptCard, PromptRow } from "./prompt-card";
import { usePromptList } from "./use-prompt-list";

const VIEW_KEY = "infinite-canvas:prompt-library-view";
const COLLAPSED_TAGS = 15;
type View = "grid" | "list";

function readView(): View | null {
    try {
        const value = localStorage.getItem(VIEW_KEY);
        return value === "grid" || value === "list" ? value : null;
    } catch {
        return null;
    }
}

export function PromptSelectDialog({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (item: Prompt) => void }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [keyword, setKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [chosenView, setChosenView] = useState<View | null>(readView);
    const [tagsExpanded, setTagsExpanded] = useState(false);
    const sources = usePromptSourceStore((state) => state.sources);
    const view: View = chosenView ?? (sources.some((source) => !source.builtIn && source.name === selectedCategory) ? "list" : "grid");
    const changeView = (value: View) => {
        setChosenView(value);
        try { localStorage.setItem(VIEW_KEY, value); } catch { /* the choice just is not remembered */ }
    };
    const { query, items, tags: promptTags, categories: promptCategories } = usePromptList({ keyword, tags: selectedTags, category: selectedCategory, enabled: open });
    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };
    const selectPrompt = (item: Prompt) => {
        onSelect(item);
        onOpenChange(false);
    };

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetchingNextPage && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <Modal title={t("prompts.library")} open={open} onCancel={() => onOpenChange(false)} footer={null} width={1040} centered>
            <div className="grid h-[62dvh] min-h-0 gap-5 sm:grid-cols-[200px_minmax(0,1fr)]" data-canvas-no-zoom onWheelCapture={(event) => event.stopPropagation()}>
                <aside className="thin-scrollbar min-h-0 overflow-y-auto border-r border-stone-200 pr-4 dark:border-stone-800">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{t("prompts.category")}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {promptCategories.map((category) => (
                            <Tag.CheckableTag key={category} checked={selectedCategory === category} className={cn("prompt-filter-tag", selectedCategory === category && "is-active")} onChange={() => setSelectedCategory(category)}>
                                {category === ALL_PROMPTS_OPTION ? t("common.all") : category}
                            </Tag.CheckableTag>
                        ))}
                    </div>
                    <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">{t("prompts.tags")}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {(tagsExpanded ? promptTags : promptTags.slice(0, COLLAPSED_TAGS)).map((tag) => {
                            const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                            return (
                                <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>
                                    {tag === ALL_PROMPTS_OPTION ? t("common.all") : tag}
                                </Tag.CheckableTag>
                            );
                        })}
                    </div>
                    {promptTags.length > COLLAPSED_TAGS ? <button type="button" className="mt-2 text-xs text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200" onClick={() => setTagsExpanded((value) => !value)}>{tagsExpanded ? "收起标签" : `展开全部 ${promptTags.length - 1} 个标签`}</button> : null}
                </aside>
                <section className="flex min-h-0 min-w-0 flex-col">
                    <div className="flex items-center gap-3">
                        <Input size="large" prefix={<Search className="size-4 text-stone-400" />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={t("prompts.searchTitle")} />
                        <Segmented value={view} onChange={(value) => changeView(value as View)} options={[{ value: "grid", icon: <LayoutGrid className="size-4" />, title: "卡片" }, { value: "list", icon: <List className="size-4" />, title: "列表" }]} />
                    </div>
                    <div className="thin-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-2" data-canvas-no-zoom onScroll={handleListScroll} onWheelCapture={(event) => event.stopPropagation()}>
                        {query.isLoading ? (
                            <div className="flex h-40 items-center justify-center">
                                <Spin />
                            </div>
                        ) : null}
                        {view === "list" ? (
                            <div className="grid gap-2 lg:grid-cols-2">
                                {items.map((item) => <PromptRow key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => selectPrompt(item)} showSource={selectedCategory === ALL_PROMPTS_OPTION} />)}
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                {items.map((item) => (
                                    <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => selectPrompt(item)} onCopy={() => selectPrompt(item)} compact showSource={selectedCategory === ALL_PROMPTS_OPTION} />
                                ))}
                            </div>
                        )}
                        {!query.isLoading && items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("prompts.empty")} className="py-8" /> : null}
                        {query.isFetchingNextPage ? (
                            <div className="py-4 text-center">
                                <Spin size="small" />
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>
        </Modal>
    );
}
