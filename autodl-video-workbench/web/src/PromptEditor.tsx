import { useEffect, useState } from 'react';
import { patchShotPrompt, submitShot } from './api';

export default function PromptEditor({ jobId, shotId, prompt, canSubmit, onChanged }: {
  jobId: string;
  shotId: string;
  prompt: string | null;
  canSubmit: boolean;
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState(prompt ?? '');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { setDraft(prompt ?? ''); setMessage(null); }, [shotId, prompt]);

  if (!canSubmit) {
    return <p className="empty-hint">该任务没有 request-plan.json，不支持人工编辑/提交</p>;
  }

  const dirty = draft !== (prompt ?? '');

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await patchShotPrompt(jobId, shotId, draft);
      setMessage(result.changed ? '已保存，run-log 已记录一条 prompt_edit' : '内容未变化，未写入');
      onChanged();
    } catch (err) {
      setMessage(`保存失败：${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (dirty) { setMessage('有未保存的修改，请先保存再提交'); return; }
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await submitShot(jobId, shotId, '人工在画布上重新提交');
      setMessage(`已提交给 AutoDL：任务 ${result.taskId}（${result.status}），run-log 已记录一条 manual_submit`);
      onChanged();
    } catch (err) {
      setMessage(`提交失败：${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="prompt-editor">
      <textarea className="prompt-editor-input" value={draft} onChange={event => setDraft(event.target.value)} rows={9} />
      <div className="prompt-editor-actions">
        <button onClick={handleSave} disabled={!dirty || saving}>{saving ? '保存中…' : '保存修改'}</button>
        <button onClick={handleSubmit} disabled={submitting || dirty} className="submit-btn" title={dirty ? '请先保存修改' : '调用 AutoDL 重新生成这个镜头（会产生真实费用）'}>
          {submitting ? '提交中…' : '重新生成（调用 AutoDL）'}
        </button>
      </div>
      {message && <p className="prompt-editor-message">{message}</p>}
    </div>
  );
}
