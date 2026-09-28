/**
 * AutoDL video generation through the local runner.
 * This script never contacts AutoDL and holds no token: the runner (127.0.0.1:4173, reached
 * through the dev server's /api proxy) records the request as a new shot of task
 * canvas-<canvas id> and submits it exactly like Codex automation does.
 * @param {string} prompt
 * @param {string[]} images - reference images as data URLs (at least one is required)
 * @param {object} params
 * @param {string|number} params.seconds - duration, clamped to 1-15 by the runner
 * @param {string} params.nodeId - the canvas node that is generating; the runner keeps node -> shot so
 *   generating the same node again re-rolls the same shot of the task
 * @param {function} poll
 * @param {AbortSignal} signal
 * @returns {Promise<{url: string}>}
 */
const match = location.pathname.match(/\/canvas\/([^/?#]+)/);
const canvasId = match ? decodeURIComponent(match[1]) : "adhoc";

async function callRunner(path, options) {
  const response = await fetch(path, { ...options, signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "本机执行器返回 HTTP " + response.status);
  return data;
}

const created = await callRunner("/api/canvas/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    canvas_id: canvasId,
    node_id: params.nodeId,
    client_request_id: crypto.randomUUID(),
    prompt,
    images,
    seconds: Number(params.seconds) || 6,
  }),
});

return await poll(
  () => callRunner("/api/canvas/generate/" + encodeURIComponent(created.job_id) + "/" + encodeURIComponent(created.shot_id)),
  (state) => {
    if (["FAILED", "SUBMIT_FAILED", "NEEDS_ATTENTION"].includes(state.status)) {
      throw new Error(state.error || "AutoDL 生成未完成，详见任务 " + created.job_id);
    }
    return state.status === "SUCCESS" && state.video_url ? { url: state.video_url } : null;
  },
  { intervalMs: 5000, timeoutMs: 1800000 },
);
