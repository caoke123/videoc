import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, App, Button, Drawer, Empty, Input, Modal, Segmented, Select, Spin, Tag, Tooltip } from "antd";
import { Copy, RefreshCw, Search, TriangleAlert } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import { formatBytes } from "@/lib/image-utils";
import { libraryFileUrl, listLibraryEntities, registerLibraryImage, type LibraryAssetItem, type LibraryEntities, type LibraryEntity, type LibraryEntityType, type RegisterImageBody } from "@/services/api/library";

const TYPE_LABELS: Record<LibraryEntityType, string> = { sku: "产品", character: "人物", scene: "场景", material: "材质" };
const CATEGORY_LABELS: Record<string, string> = { "seatbelt-shoulder-pad": "安全带护肩套", "bag-charm": "包包挂饰" };
const categoryLabel = (id: string) => CATEGORY_LABELS[id] || id;

type Rec = Record<string, unknown>;
const rec = (value: unknown): Rec => (value && typeof value === "object" ? (value as Rec) : {});
const range = (value: Rec) => (value.min != null && value.max != null ? `${value.min}–${value.max}` : "");

export default function LibraryPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [data, setData] = useState<LibraryEntities>({ entities: [], unassigned: [], problems: [] });
    const [loading, setLoading] = useState(true);
    const [keyword, setKeyword] = useState("");
    const [type, setType] = useState<string>("all");
    const [category, setCategory] = useState<string>("all");
    const [detailId, setDetailId] = useState<string | null>(null);
    const [previewItem, setPreviewItem] = useState<LibraryAssetItem | null>(null);
    const [registering, setRegistering] = useState<LibraryAssetItem | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setData(await listLibraryEntities());
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材库读取失败");
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { void refresh(); }, [refresh]);

    const { entities } = data;
    const counts = useMemo(() => {
        const result: Record<string, number> = { all: entities.length };
        for (const entity of entities) result[entity.type] = (result[entity.type] || 0) + 1;
        return result;
    }, [entities]);
    const typeOptions = [{ value: "all", label: `全部（${counts.all}）` }, ...(Object.keys(TYPE_LABELS) as LibraryEntityType[]).map((value) => ({ value, label: `${TYPE_LABELS[value]}（${counts[value] || 0}）` }))];
    const categories = useMemo(() => [...new Set(entities.filter((entity) => entity.type === "sku" && entity.category).map((entity) => entity.category as string))], [entities]);

    const visible = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        const order = Object.keys(TYPE_LABELS);
        return [...entities].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type) || a.name.localeCompare(b.name, "zh")).filter((entity) => {
            if (type !== "all" && entity.type !== type) return false;
            if (type === "sku" && category !== "all" && entity.category !== category) return false;
            if (!query) return true;
            return [entity.name, entity.id, ...entity.aliases, ...entity.images.map((image) => image.role)].some((text) => text.toLowerCase().includes(query));
        });
    }, [entities, keyword, type, category]);

    const detail = entities.find((entity) => entity.id === detailId) || null;

    return (
        <main className="h-full overflow-auto bg-background text-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
                    <div>
                        <p className="text-xs text-muted-foreground">无限画布 · 共享素材</p>
                        <h1 className="mt-2 text-3xl font-semibold">素材库</h1>
                        <p className="mt-2 text-sm text-muted-foreground">按产品、人物、场景、材质整理，一个实体带着它的全套参考图和登记信息，供各任务复用引用。</p>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => void refresh()}>刷新</Button>
                </header>

                <div className="flex flex-wrap items-center gap-3">
                    <Segmented value={type} onChange={(value) => { setType(String(value)); setCategory("all"); }} options={typeOptions} />
                    <Input className="max-w-xs" allowClear prefix={<Search className="size-4 text-muted-foreground" />} placeholder="按名称、别名（电玩款）、图片用途搜索" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
                </div>
                {type === "sku" && categories.length > 1 ? (
                    <Segmented value={category} onChange={(value) => setCategory(String(value))} options={[{ value: "all", label: "全部品类" }, ...categories.map((id) => ({ value: id, label: categoryLabel(id) }))]} />
                ) : null}

                {data.problems.length ? <Alert type="error" showIcon title="部分登记文件无法读取" description={data.problems.join("；")} /> : null}

                {loading ? (
                    <div className="flex min-h-64 items-center justify-center"><Spin /></div>
                ) : visible.length ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                        {visible.map((entity) => <EntityCard key={entity.id} entity={entity} onOpen={() => setDetailId(entity.id)} />)}
                    </div>
                ) : (
                    <Empty className="py-20" description={entities.length ? "没有匹配的素材" : "素材库还是空的，在 production/assets 下为每个产品/人物/场景/材质放图并添加登记文件"} />
                )}

                {data.unassigned.length ? (
                    <section className="flex flex-col gap-3 border-t border-border pt-6">
                        <h2 className="text-lg font-medium">未整理<span className="ml-2 text-sm font-normal text-muted-foreground">{data.unassigned.length} 张，没有归入任何实体，需要登记或清理</span></h2>
                        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                            {data.unassigned.map((item) => (
                                <div key={item.path} className="overflow-hidden rounded-md border border-border bg-card">
                                    <button type="button" className="block w-full cursor-zoom-in" onClick={() => setPreviewItem(item)}><img src={libraryFileUrl(item.path)} alt={item.name} className="aspect-[9/16] w-full object-cover" loading="lazy" /></button>
                                    <p className="line-clamp-1 px-2 pt-2 text-[11px] text-muted-foreground" title={item.path}>{item.path}</p>
                                    <div className="p-2"><Button size="small" block onClick={() => setRegistering(item)}>登记到…</Button></div>
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>

            <Drawer open={Boolean(detail)} onClose={() => setDetailId(null)} size={680} title={detail ? <span>{detail.name}<Tag className="ml-2">{TYPE_LABELS[detail.type]}</Tag>{detail.status === "pending" ? <Tag color="orange">待确认</Tag> : null}</span> : null}>
                {detail ? <EntityDetail entity={detail} all={entities} onPreview={setPreviewItem} onOpenEntity={setDetailId} onCopy={(text) => copyText(text, "已复制引用")} /> : null}
            </Drawer>

            <RegisterModal item={registering} entities={entities} onClose={() => setRegistering(null)} onDone={() => { setRegistering(null); void refresh(); }} />

            <Modal open={Boolean(previewItem)} onCancel={() => setPreviewItem(null)} footer={null} centered width="auto" styles={{ body: { padding: 0, lineHeight: 0 } }}>
                {previewItem ? <img src={libraryFileUrl(previewItem.path)} alt={previewItem.name} className="max-h-[85vh] w-auto rounded" /> : null}
            </Modal>
        </main>
    );
}

const CREATE_TYPES = { character: "新建人物", scene: "新建场景", material: "新建材质" } as const;
const ROLE_OPTIONS = [
    { value: "driver", label: "主驾佩戴参考" },
    { value: "passenger", label: "副驾驶位佩戴参考" },
    { value: "identity", label: "商品原图（身份真值）" },
    { value: "other", label: "其他参考" },
];

function RegisterModal({ item, entities, onClose, onDone }: { item: LibraryAssetItem | null; entities: LibraryEntity[]; onClose: () => void; onDone: () => void }) {
    const { message } = App.useApp();
    const [mode, setMode] = useState<string>("existing");
    const [entityId, setEntityId] = useState<string>();
    const [role, setRole] = useState<"identity" | "driver" | "passenger" | "other">("driver");
    const [name, setName] = useState("");
    const [label, setLabel] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (item) { setMode("existing"); setEntityId(undefined); setRole("driver"); setName(""); setLabel(""); } }, [item]);

    const entity = entities.find((other) => other.id === entityId);
    const hasIdentity = Boolean(entity?.images.some((image) => image.kind === "identity"));
    const entityOptions = (Object.keys(TYPE_LABELS) as LibraryEntityType[]).map((type) => ({ label: TYPE_LABELS[type], options: entities.filter((other) => other.type === type).map((other) => ({ value: other.id, label: other.name })) })).filter((group) => group.options.length);
    const needsLabel = mode !== "existing" || (entity && entity.type !== "sku");

    const submit = async () => {
        if (!item) return;
        let body: RegisterImageBody;
        if (mode === "existing") {
            if (!entityId) return message.warning("请选择要登记到的实体");
            body = { path: item.path, entityId, role: entity?.type === "sku" ? role : "other", label: label.trim() || undefined };
        } else {
            if (!name.trim()) return message.warning("请填写名称");
            body = { path: item.path, create: { type: mode as keyof typeof CREATE_TYPES, name: name.trim() }, label: label.trim() || undefined };
        }
        setSaving(true);
        try {
            await registerLibraryImage(body);
            message.success("已登记");
            onDone();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登记失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal open={Boolean(item)} onCancel={onClose} title="登记到…" okText="登记" cancelText="取消" confirmLoading={saving} onOk={() => void submit()} centered>
            {item ? (
                <div className="flex gap-4">
                    <img src={libraryFileUrl(item.path)} alt={item.name} className="h-48 w-28 shrink-0 rounded-md object-cover" />
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <Segmented block value={mode} onChange={(value) => setMode(String(value))} options={[{ value: "existing", label: "已有实体" }, ...Object.entries(CREATE_TYPES).map(([value, text]) => ({ value, label: text }))]} />
                        {mode === "existing" ? (
                            <>
                                <Select showSearch optionFilterProp="label" placeholder="选择产品、人物、场景或材质" value={entityId} onChange={(value) => { setEntityId(value); setRole("driver"); }} options={entityOptions} />
                                {entity?.type === "sku" ? <Select value={role} onChange={setRole} options={ROLE_OPTIONS.map((option) => ({ ...option, disabled: option.value === "identity" && hasIdentity }))} /> : null}
                            </>
                        ) : (
                            <Input placeholder="名称" value={name} onChange={(event) => setName(event.target.value)} />
                        )}
                        {needsLabel || role === "other" || role === "driver" || role === "passenger" ? <Input placeholder={needsLabel ? "用途说明（可选，如：45° 侧面）" : "用途说明（可选）"} value={label} onChange={(event) => setLabel(event.target.value)} /> : null}
                        <p className="text-xs text-muted-foreground">新产品需要测量尺寸，请让 Agent 登记。登记后图片会移入该实体的目录，原来的未整理位置不再保留。</p>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}

function EntityCard({ entity, onOpen }: { entity: LibraryEntity; onOpen: () => void }) {
    const cover = entity.images.find((image) => image.ref === entity.cover) || entity.images[0];
    return (
        <button type="button" onClick={onOpen} className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-foreground/30">
            <div className="relative">
                {cover ? <img src={libraryFileUrl(cover.path)} alt={entity.name} className="aspect-[3/4] w-full object-cover" loading="lazy" /> : <div className="aspect-[3/4] w-full bg-muted" />}
                <span className="absolute left-2 top-2 flex gap-1">
                    <Tag className="m-0" variant="filled">{TYPE_LABELS[entity.type]}</Tag>
                    {entity.status === "pending" ? <Tag className="m-0" color="orange" variant="filled">待确认</Tag> : null}
                </span>
                {entity.warnings.length ? <Tooltip title={entity.warnings.join("；")}><TriangleAlert className="absolute right-2 top-2 size-4 text-amber-500" /></Tooltip> : null}
            </div>
            <div className="flex flex-col gap-1 p-3">
                <p className="line-clamp-2 text-sm font-medium">{entity.name}</p>
                {entity.aliases.length ? <p className="line-clamp-1 text-[11px] text-muted-foreground">{entity.aliases.join(" · ")}</p> : null}
                <p className="text-[11px] text-muted-foreground">{entity.images.length} 张{entity.category ? ` · ${categoryLabel(entity.category)}` : ""}</p>
            </div>
        </button>
    );
}

function EntityDetail({ entity, all, onPreview, onOpenEntity, onCopy }: { entity: LibraryEntity; all: LibraryEntity[]; onPreview: (item: LibraryAssetItem) => void; onOpenEntity: (id: string) => void; onCopy: (text: string) => void }) {
    const meta = entity.meta;
    const scale = rec(meta.installed_reference_scale);
    const belt = rec(scale.pad_width_to_local_vehicle_belt_width);
    const pad = rec(meta.pad);
    const plush = meta.plush_geometry == null ? null : rec(meta.plush_geometry);
    const installation = rec(meta.installation);
    const lockedParts = Array.isArray(meta.identity_locked_parts) ? (meta.identity_locked_parts as string[]) : [];
    const related = entity.related.map((ref) => all.find((other) => other.images.some((image) => image.ref === ref))).filter((other): other is LibraryEntity => Boolean(other));
    const notes = typeof meta.notes === "string" ? meta.notes : "";

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <code>{entity.id}</code>
                {entity.aliases.map((alias) => <Tag key={alias} className="m-0">{alias}</Tag>)}
                <Button size="small" className="ml-auto" icon={<Copy className="size-3.5" />} onClick={() => onCopy(entity.images.map((image) => image.ref).join("\n"))}>复制全部引用</Button>
            </div>

            {entity.warnings.length ? <Alert type="warning" showIcon title={entity.warnings.join("；")} /> : null}

            <div className="grid grid-cols-3 gap-3">
                {entity.images.map((image) => (
                    <div key={image.path} className="overflow-hidden rounded-md border border-border bg-card">
                        <button type="button" className="block w-full cursor-zoom-in" onClick={() => onPreview(image)}><img src={libraryFileUrl(image.path)} alt={image.role} className="aspect-[3/4] w-full object-cover" loading="lazy" /></button>
                        <div className="flex flex-col gap-1 p-2">
                            <p className="text-xs font-medium">{image.role}</p>
                            <p className="line-clamp-1 text-[11px] text-muted-foreground" title={image.name}>{image.name} · {formatBytes(image.bytes)}</p>
                            <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => onCopy(image.ref)}>复制引用</Button>
                        </div>
                    </div>
                ))}
            </div>

            {related.length ? (
                <Section title="配套素材">
                    {related.map((other) => <Tag key={other.id} className="cursor-pointer" onClick={() => onOpenEntity(other.id)}>{TYPE_LABELS[other.type]}：{other.name}</Tag>)}
                </Section>
            ) : null}

            {entity.type === "sku" ? (
                <>
                    <Section title="佩戴比例（登记值）">
                        <ul className="list-disc pl-5 text-sm leading-6">
                            {belt.nominal != null ? <li>护肩垫宽度 ≈ 局部安全带宽度的 {String(belt.nominal)} 倍（合格 {range(belt)}，超过 {String(belt.hard_reject_above)} 淘汰）</li> : null}
                            {pad.length_cm != null ? <li>护肩垫 {String(pad.length_cm)} × {String(pad.width_cm)} cm</li> : null}
                            {installation.vehicle_belt_passes_inside_pad ? <li>安全带从垫顶中心进入、底部中心穿出，中心线对齐</li> : null}
                            {installation.placement_zone ? <li>位置：{String(installation.placement_zone).replaceAll("_", " ")}</li> : null}
                            {plush ? <li>{plush.plush_width_cm != null ? `玩偶实物 ${String(plush.plush_width_cm)}×${String(plush.plush_height_cm)} cm（宽×高），` : ""}玩偶宽/垫宽 {String(plush.plush_width_to_pad_width)}，玩偶高/垫长 {String(plush.plush_height_to_pad_length)}{plush.plush_center_y_from_pad_top != null ? `，玩偶中心距垫顶 ${String(plush.plush_center_y_from_pad_top)}` : ""}{plush.tolerance_percent != null ? `（容差 ${String(plush.tolerance_percent)}%）` : ""}</li> : <li className="text-amber-600">玩偶几何：未测量</li>}
                        </ul>
                    </Section>
                    {lockedParts.length ? <Section title="锁定部件">{lockedParts.map((part) => <Tag key={part} className="m-0">{part.replaceAll("_", " ")}</Tag>)}</Section> : null}
                    {meta.approval_note ? <Section title="批准记录"><p className="text-sm text-muted-foreground">{String(meta.approved_on || "")} {String(meta.approval_note)}</p></Section> : null}
                </>
            ) : null}

            {notes ? <Section title="说明"><p className="text-sm leading-6 text-muted-foreground">{notes}</p></Section> : null}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{title}</h3>
            <div className="flex flex-wrap gap-2">{children}</div>
        </section>
    );
}
