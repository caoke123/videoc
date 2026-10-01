import { Copy, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Tag, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";

function PromptBadges({ item, showSource }: { item: Prompt; showSource?: boolean }) {
    const refs = item.referenceImageUrls.length;
    return (
        <>
            {showSource ? <Tag className="m-0 text-[10px]" variant="filled">{item.category}</Tag> : null}
            {refs ? <Tag className="m-0 text-[10px]" color="blue" variant="filled">参考图 ×{refs}</Tag> : null}
            {item.applyMode === "append" ? <Tag className="m-0 text-[10px]" color="gold" variant="filled">追加</Tag> : null}
        </>
    );
}

export function PromptCard({
    item,
    onOpen,
    onCopy,
    actionLabel,
    actionIcon = <Copy className="size-3.5" />,
    actionType = "text",
    extraAction,
    compact = false,
    showSource = false,
}: {
    item: Prompt;
    onOpen: () => void;
    onCopy: () => void;
    actionLabel?: string;
    actionIcon?: ReactNode;
    actionType?: "text" | "primary";
    extraAction?: ReactNode;
    compact?: boolean;
    showSource?: boolean;
}) {
    const { i18n, t } = useTranslation();
    return (
        <Card
            hoverable
            className={compact ? "group cursor-pointer overflow-hidden transition-transform duration-200 hover:-translate-y-1" : "flex h-full flex-col overflow-hidden"}
            styles={{ body: compact ? { padding: 0 } : { display: "flex", flex: 1, flexDirection: "column", padding: 0 } }}
            cover={
                <button type="button" className="relative block w-full cursor-pointer text-left" onClick={onOpen}>
                    {item.coverUrl ? <img src={item.coverUrl} alt={item.title} className={compact ? "aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" : "aspect-[4/3] w-full object-cover"} loading="lazy" /> : <span className={compact ? "grid aspect-[3/4] w-full place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600" : "grid aspect-[4/3] w-full place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600"}><FileText className="size-8" /></span>}
                    {compact ? <span className="absolute left-1.5 top-1.5 flex flex-wrap gap-1"><PromptBadges item={item} showSource={showSource} /></span> : null}
                </button>
            }
        >
            <button type="button" className={compact ? "block w-full cursor-pointer text-left" : "block w-full flex-1 cursor-pointer text-left"} onClick={onOpen}>
                <div className={compact ? "px-3 py-2.5" : "p-4"}>
                    <div className="flex items-start justify-between gap-3">
                        <Tooltip title={item.title} mouseEnterDelay={0.3}>
                            <h2 className={compact ? "line-clamp-2 text-xs font-semibold leading-snug text-stone-950 dark:text-stone-100" : "line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100"}>{item.title}</h2>
                        </Tooltip>
                        {!compact ? <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500">{formatPromptDate(item.updatedAt, i18n.resolvedLanguage)}</span> : null}
                    </div>
                    {!compact ? <><p className="mt-2 line-clamp-3 text-xs leading-5 text-stone-600 dark:text-stone-400">{item.description || item.prompt}</p><div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((tag) => <Tag key={tag} className="m-0 text-[11px]">{tag}</Tag>)}</div></> : null}
                </div>
            </button>
            {!compact ? <div className="mt-auto flex items-center gap-2 px-4 pb-4"><Button block={actionType === "primary"} type={actionType} size="small" icon={actionIcon} onClick={onCopy}>{actionLabel || t("common.copy")}</Button>{extraAction}</div> : null}
        </Card>
    );
}

export function PromptRow({ item, onOpen, showSource = false }: { item: Prompt; onOpen: () => void; showSource?: boolean }) {
    const thumb = item.coverUrl || item.referenceImageUrls[0];
    return (
        <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 rounded-lg border border-stone-200 p-2.5 text-left transition hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600">
            {thumb ? <img src={thumb} alt="" className="h-36 w-28 shrink-0 rounded-md object-cover" loading="lazy" /> : <span className="grid h-36 w-28 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600"><FileText className="size-6" /></span>}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-stone-950 dark:text-stone-100">{item.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                    <PromptBadges item={item} showSource={showSource} />
                    {item.tags.slice(0, 4).map((tag) => <Tag key={tag} className="m-0 text-[10px]">{tag}</Tag>)}
                </div>
                {item.description ? <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-stone-500 dark:text-stone-400">{item.description}</p> : null}
            </div>
        </button>
    );
}
