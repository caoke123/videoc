import { useEffect, useState } from "react";
import { Alert, App, Button, Checkbox, Input, Modal, Spin, Tag } from "antd";
import { ArrowDown, ArrowUp, Copy } from "lucide-react";

import { useCopyText } from "@/hooks/use-copy-text";
import { exportJianyingDraft, getJianyingExportPlan, type JianyingExportPlan } from "@/services/api/production";

type Row = { shot_id: string; duration: number; caption: string; included: boolean };

export function JianyingExportModal({ jobId, open, onClose }: { jobId: string; open: boolean; onClose: () => void }) {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const [plan, setPlan] = useState<JianyingExportPlan | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [result, setResult] = useState<{ draft_name: string; draft_path: string; duration: number } | null>(null);

    useEffect(() => {
        if (!open) return;
        setResult(null);
        setLoading(true);
        getJianyingExportPlan(jobId)
            .then((next) => {
                setPlan(next);
                setName(next.default_name);
                setRows(next.shots.map((shot) => ({ shot_id: shot.shot_id, duration: shot.duration, caption: shot.caption, included: true })));
            })
            .catch((error) => message.error(error instanceof Error ? error.message : "读取导出信息失败"))
            .finally(() => setLoading(false));
    }, [open, jobId, message]);

    const update = (index: number, patch: Partial<Row>) => setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    const move = (index: number, delta: number) =>
        setRows((prev) => {
            const target = index + delta;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    const picked = rows.filter((row) => row.included);
    const total = picked.reduce((sum, row) => sum + row.duration, 0);

    const submit = async () => {
        setExporting(true);
        try {
            setResult(await exportJianyingDraft(jobId, { name: name.trim(), shots: picked.map(({ shot_id, caption }) => ({ shot_id, caption })) }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导出失败");
        } finally {
            setExporting(false);
        }
    };

    return (
        <Modal
            title="导出剪映草稿"
            open={open}
            onCancel={onClose}
            width={720}
            footer={result ? <Button type="primary" onClick={onClose}>完成</Button> : undefined}
            okText="导出草稿"
            cancelText="取消"
            confirmLoading={exporting}
            onOk={() => void submit()}
            okButtonProps={{ disabled: !plan?.ready || !picked.length || !name.trim() }}
        >
            {loading ? (
                <div className="flex justify-center py-10"><Spin /></div>
            ) : result ? (
                <div className="flex flex-col gap-3 py-2 text-sm">
                    <Alert type="success" showIcon message={`已导出草稿「${result.draft_name}」，共 ${result.duration.toFixed(1)} 秒`} />
                    <p className="select-all break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">{result.draft_path}</p>
                    <div><Button size="small" icon={<Copy className="size-3.5" />} onClick={() => copyText(result.draft_path, "已复制草稿路径")}>复制路径</Button></div>
                    <p className="text-muted-foreground">请关闭并重新打开剪映专业版，在草稿列表里找到它。字幕来自镜头对白，需要按你的配音校对。</p>
                </div>
            ) : plan ? (
                <div className="flex flex-col gap-3 py-2 text-sm">
                    {!plan.exporter_installed ? (
                        <Alert type="warning" showIcon message="还没有安装剪映导出组件" description={<span>在项目根目录运行 <code className="select-all">{plan.setup_command}</code>，装好后重新打开这个窗口。</span>} />
                    ) : plan.reasons.length ? (
                        <Alert type="warning" showIcon message={plan.reasons.join("；")} />
                    ) : null}
                    <label className="block">
                        <span className="text-muted-foreground">草稿名称（不会覆盖已有草稿）</span>
                        <Input className="mt-1" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
                    </label>
                    <div>
                        <p className="mb-2 text-muted-foreground">按这个顺序排进时间线，只列出已通过审片的当前版本；可以调整顺序、去掉镜头、修改字幕</p>
                        <ul className="flex flex-col gap-2">
                            {rows.map((row, index) => (
                                <li key={row.shot_id} className="flex items-center gap-2 rounded-md border border-border p-2">
                                    <Checkbox checked={row.included} onChange={(event) => update(index, { included: event.target.checked })} />
                                    <Tag className="m-0">{row.shot_id}</Tag>
                                    <span className="w-12 shrink-0 text-xs text-muted-foreground">{row.duration.toFixed(1)} 秒</span>
                                    <Input size="small" value={row.caption} placeholder="字幕（留空则不加）" onChange={(event) => update(index, { caption: event.target.value })} />
                                    <Button size="small" type="text" icon={<ArrowUp className="size-3.5" />} disabled={index === 0} onClick={() => move(index, -1)} />
                                    <Button size="small" type="text" icon={<ArrowDown className="size-3.5" />} disabled={index === rows.length - 1} onClick={() => move(index, 1)} />
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-xs text-muted-foreground">共 {picked.length} 个镜头，约 {total.toFixed(1)} 秒，保留各镜头完整时长和原生音轨。只在剪映草稿目录新建一个草稿，不会导出成片。</p>
                </div>
            ) : null}
        </Modal>
    );
}
