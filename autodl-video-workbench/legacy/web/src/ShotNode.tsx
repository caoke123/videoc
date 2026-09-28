import { Handle, Position } from '@xyflow/react';

const STATUS_LABEL: Record<string, string> = {
  success: '生成完成', running: '生成中', failed: '生成失败', planned: '待提交'
};

export interface ShotNodeData {
  shotId: string;
  purpose?: string;
  dialogue?: string;
  status?: string;
  referenceCount: number;
  [key: string]: unknown;
}

export default function ShotNode({ data }: { data: ShotNodeData }) {
  const statusKey = (data.status || 'planned').toLowerCase();
  const label = STATUS_LABEL[statusKey] || data.status || '未知状态';
  return (
    <div className={`shot-node status-${statusKey}`}>
      <Handle type="target" position={Position.Left} />
      <div className="shot-node-head">
        <strong>{data.shotId}</strong>
        <span className="shot-node-status">{label}</span>
      </div>
      {data.purpose && <p className="shot-node-purpose">{data.purpose}</p>}
      {data.dialogue && <p className="shot-node-dialogue">「{data.dialogue}」</p>}
      <p className="shot-node-refs">参考图 {data.referenceCount} 张</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
