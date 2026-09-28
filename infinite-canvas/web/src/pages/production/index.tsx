import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { App, Button, Card, Empty, Input, Modal, Select, Spin, Tag } from "antd";
import { Clapperboard, Plus, RefreshCw } from "lucide-react";
import dayjs from "dayjs";

import { createProductionJob, listProductionCategories, listProductionFormats, listProductionJobs, type ProductionCategory, type ProductionFormat, type ProductionJob } from "@/services/api/production";

function statusLabel(status: string | null, pendingReview = 0) {
    if (status === "success" && pendingReview > 0) return "待人工审片";
    if (status === "success") return "已完成";
    if (status === "running") return "生成中";
    if (status === "partial") return "部分完成";
    if (status === "failed") return "失败";
    return "待处理";
}

export default function ProductionJobsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [jobs, setJobs] = useState<ProductionJob[]>([]);
    const [formats, setFormats] = useState<ProductionFormat[]>([]);
    const [categories, setCategories] = useState<ProductionCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [formatId, setFormatId] = useState<string>();
    const [categoryId, setCategoryId] = useState<string>();

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [nextJobs, nextFormats, nextCategories] = await Promise.all([listProductionJobs(), listProductionFormats(), listProductionCategories()]);
            setJobs(nextJobs);
            setFormats(nextFormats);
            setCategories(nextCategories);
            setFormatId((current) => current || nextFormats.find((item) => item.format_id === "ugc-single-shot")?.format_id || nextFormats[0]?.format_id);
            setCategoryId((current) => current || nextCategories.find((item) => item.status === "active")?.category_id || nextCategories[0]?.category_id);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任务列表读取失败");
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { void refresh(); }, [refresh]);

    const createJob = async () => {
        if (!formatId || !categoryId) return;
        setCreating(true);
        try {
            const result = await createProductionJob({ title: title.trim() || "新创意任务", formatId, categoryId });
            setModalOpen(false);
            navigate(`/production/${encodeURIComponent(result.job_id)}`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "任务创建失败");
        } finally {
            setCreating(false);
        }
    };

    const formatNames = new Map(formats.map((item) => [item.format_id, item.name]));
    const categoryNames = new Map(categories.map((item) => [item.category_id, item.name]));

    return (
        <main className="h-full overflow-auto bg-background text-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-7 px-6 py-8">
                <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
                    <div>
                        <p className="text-xs text-muted-foreground">无限画布 · AutoDL</p>
                        <h1 className="mt-2 text-3xl font-semibold">任务历史</h1>
                        <p className="mt-2 text-sm text-muted-foreground">任务、素材、提示词、生成版本与人工操作都保存在项目任务目录中。</p>
                    </div>
                    <div className="flex gap-2">
                        <Button icon={<RefreshCw className="size-4" />} onClick={() => void refresh()}>刷新</Button>
                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => setModalOpen(true)}>新建任务</Button>
                    </div>
                </header>

                {loading ? <div className="flex min-h-64 items-center justify-center"><Spin /></div> : jobs.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {jobs.map((job) => (
                            <Card key={job.job_id} hoverable onClick={() => navigate(`/production/${encodeURIComponent(job.job_id)}`)} className="cursor-pointer border-border bg-card">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted"><Clapperboard className="size-5" /></div>
                                    <Tag color={job.status === "success" && (job.review?.pending || 0) > 0 ? "orange" : job.status === "success" ? "green" : job.status === "failed" ? "red" : job.status === "running" ? "blue" : "default"}>{statusLabel(job.status, job.review?.pending || 0)}</Tag>
                                </div>
                                <h2 className="mt-4 line-clamp-2 text-lg font-medium">{job.title}</h2>
                                <p className="mt-1 text-xs text-muted-foreground">{job.job_id}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Tag>{formatNames.get(job.format_id || "") || job.format_id || "未标注形式"}</Tag>
                                    <Tag>{categoryNames.get(job.category_id || "") || job.category_id || "未标注类目"}</Tag>
                                    <Tag>{job.shot_count ?? "?"} 个镜头</Tag>
                                </div>
                                <p className="mt-4 text-xs text-muted-foreground">最近更新：{job.updated_at ? dayjs(job.updated_at).format("YYYY-MM-DD HH:mm") : "—"}</p>
                            </Card>
                        ))}
                    </div>
                ) : <Empty className="py-20" description="还没有任务，创建一个创意任务开始记录素材和生成过程。"><Button type="primary" onClick={() => setModalOpen(true)}>新建任务</Button></Empty>}
            </div>

            <Modal title="新建任务" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => void createJob()} confirmLoading={creating} okText="创建并打开" cancelText="取消">
                <div className="space-y-4 py-3">
                    <label className="block text-sm">任务名称<Input className="mt-2" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：秋季通勤创意" maxLength={80} /></label>
                    <label className="block text-sm">产品类目<Select className="mt-2 w-full" value={categoryId} onChange={setCategoryId} options={categories.map((item) => ({ value: item.category_id, label: `${item.name}${item.status === "draft" ? "（草稿类目）" : ""}` }))} /></label>
                    <label className="block text-sm">创意形式<Select className="mt-2 w-full" value={formatId} onChange={setFormatId} options={formats.map((item) => ({ value: item.format_id, label: `${item.name}${item.media_type === "image" && !item.workflow_id ? "（仅分镜设计，暂不能提交生成）" : item.status === "draft" ? "（试验形式）" : ""}` }))} /></label>
                    {formats.find((item) => item.format_id === formatId)?.media_type === "image" && !formats.find((item) => item.format_id === formatId)?.workflow_id ? <p className="text-xs text-amber-600 dark:text-amber-400">此形式尚未配置图像工作流，可保存分镜和素材，暂不能在任务页提交生成。</p> : null}
                    <p className="text-xs text-muted-foreground">这里建立任务记录：每个镜头预留一个位置，不会预先生成占位文件。按镜头实际需要准备最小素材包（产品原图、必要的人物或场景参考），在“我的画布”里搭节点、填提示词，或交给 Codex 准备；明确提交后才会调用生成服务，生成后在任务页人工审片。</p>
                </div>
            </Modal>
        </main>
    );
}
