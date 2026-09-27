import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, type Node, type Edge, type NodeMouseHandler } from '@xyflow/react';
import { getJobDetail } from './api';
import type { JobDetail as JobDetailType, RequestPlan, ShotPlanEntry } from './types';
import ShotNode, { type ShotNodeData } from './ShotNode';

const nodeTypes = { shot: ShotNode };

// request-plan.json has two shapes (see job-actions.mjs): a `shots[]` array for
// multi-shot jobs, or a single flat `request` object for single-shot ones.
function resolvePrompt(requestPlan: RequestPlan | null, shotId: string): string | null {
  if (!requestPlan) return null;
  if (requestPlan.shots) return requestPlan.shots.find(shot => shot.shot_id === shotId)?.prompt ?? null;
  return requestPlan.request?.prompt ?? null;
}

function shotRunStatus(runState: Record<string, unknown> | null, shotId: string): string | undefined {
  if (!runState) return undefined;
  const perShot = (runState.shots as Record<string, { status?: string }> | undefined)?.[shotId];
  if (perShot?.status) return perShot.status;
  // Single-shot jobs keep a flat run-state (no `shots` map) — only applies when there's one shot total.
  if (!runState.shots && typeof runState.status === 'string') return runState.status;
  return undefined;
}

function buildGraph(shots: ShotPlanEntry[], runState: Record<string, unknown> | null): { nodes: Node<ShotNodeData>[]; edges: Edge[] } {
  const nodes: Node<ShotNodeData>[] = shots.map((shot, index) => ({
    id: shot.shot_id,
    type: 'shot',
    position: { x: index * 260, y: 0 },
    data: {
      shotId: shot.shot_id,
      purpose: shot.purpose,
      dialogue: shot.dialogue,
      status: shotRunStatus(runState, shot.shot_id) || shot.status,
      referenceCount: shot.references?.length ?? 0
    }
  }));
  const edges: Edge[] = shots.slice(1).map((shot, index) => ({
    id: `${shots[index].shot_id}-${shot.shot_id}`,
    source: shots[index].shot_id,
    target: shot.shot_id
  }));
  return { nodes, edges };
}

function AssetList({ assets }: { assets: Record<string, string[]> }) {
  const groups = Object.entries(assets).filter(([, files]) => files.length > 0);
  if (groups.length === 0) return <p className="empty-hint">没有资产记录</p>;
  return (
    <>
      {groups.map(([group, files]) => (
        <div key={group} className="asset-group">
          <h4>{group}（{files.length}）</h4>
          <ul>{files.map(file => <li key={file}>{file}</li>)}</ul>
        </div>
      ))}
    </>
  );
}

function RunLogPanel({ entries }: { entries: JobDetailType['run_log'] }) {
  if (entries.length === 0) return <p className="empty-hint">暂无操作日志</p>;
  return (
    <ul className="run-log-list">
      {entries.slice().reverse().map((entry, index) => (
        <li key={index} className={entry.actor === 'user' ? 'log-actor-user' : 'log-actor-system'}>
          <span className="log-time">{entry.time?.slice(0, 19).replace('T', ' ')}</span>
          <span className="log-shot">{entry.shot_id}</span>
          <span className="log-type">{entry.type || entry.status}</span>
          {entry.actor === 'user' && <span className="log-actor-badge">人工</span>}
        </li>
      ))}
    </ul>
  );
}

export default function JobDetail({ jobId, onBack }: { jobId: string; onBack: () => void }) {
  const [job, setJob] = useState<JobDetailType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  useEffect(() => {
    setJob(null);
    setError(null);
    setSelectedShotId(null);
    getJobDetail(jobId).then(setJob).catch(err => setError(err.message));
  }, [jobId]);

  const graph = useMemo(() => (job?.shot_plan?.shots ? buildGraph(job.shot_plan.shots, job.run_state) : null), [job]);
  const onNodeClick: NodeMouseHandler = (_event, node) => setSelectedShotId(node.id);
  const selectedPrompt = job ? resolvePrompt(job.request_plan, selectedShotId ?? '') : null;

  return (
    <div className="job-detail">
      <div className="job-detail-toolbar">
        <button onClick={onBack}>← 返回任务历史</button>
        <h2>{jobId}</h2>
        {job?.format_id && <span className="format-pill">{job.format_id}</span>}
      </div>

      {error && <div className="panel-error">读取失败：{error}</div>}
      {!job && !error && <div className="panel-loading">加载中…</div>}

      {job && (
        <div className="job-detail-body">
          <div className="job-canvas">
            {graph ? (
              <ReactFlow nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodeClick={onNodeClick} fitView>
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            ) : (
              <div className="empty-hint">该任务没有 shot-plan.json，无法渲染镜头节点图。顶层文件：{job.top_level_files.join('、') || '（无）'}</div>
            )}
          </div>
          <aside className="job-side-panel">
            {selectedShotId && (
              <section>
                <h3>提示词（{selectedShotId}）</h3>
                {selectedPrompt ? <p className="prompt-text">{selectedPrompt}</p> : <p className="empty-hint">该任务没有 request-plan.json，或此镜头没有对应的提示词记录</p>}
              </section>
            )}
            <section>
              <h3>资产</h3>
              <AssetList assets={job.assets} />
            </section>
            <section>
              <h3>成片 / 渲染输出</h3>
              <AssetList assets={job.renders} />
            </section>
            <section>
              <h3>操作历史（run-log）</h3>
              <RunLogPanel entries={job.run_log} />
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
