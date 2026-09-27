const $ = selector => document.querySelector(selector);
const viewport = $('#viewport');
const stage = $('#stage');
const lines = $('.connections');
const toast = $('#toast');
const nodes = [...document.querySelectorAll('.node')];
let project = null;
let health = null;
let scale = 1;
let pan = { x: 0, y: 0 };
let moving = null;
let draggingNode = null;
let suppressNodeClick = false;
let pollTimer = null;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function applyTransform() {
  const transform = `translate(${pan.x}px, ${pan.y}px) scale(${scale})`;
  stage.style.transform = transform;
  lines.style.transform = transform;
  $('#zoomValue').textContent = `${Math.round(scale * 100)}%`;
}

function fitCanvas() {
  const left = Math.min(...nodes.map(node => node.offsetLeft));
  const top = Math.min(...nodes.map(node => node.offsetTop));
  const right = Math.max(...nodes.map(node => node.offsetLeft + node.offsetWidth));
  const bottom = Math.max(...nodes.map(node => node.offsetTop + node.offsetHeight));
  const width = right - left;
  const height = bottom - top;
  scale = Math.max(.55, Math.min(1, (viewport.clientWidth - 58) / width, (viewport.clientHeight - 100) / height));
  pan = {
    x: (viewport.clientWidth - width * scale) / 2 - left * scale,
    y: (viewport.clientHeight - height * scale) / 2 - top * scale
  };
  applyTransform();
}

function renderConnections() {
  document.querySelectorAll('.connections path').forEach(path => {
    const [fromNode, fromPort] = path.dataset.from.split(':');
    const [toNode, toPort] = path.dataset.to.split(':');
    const source = $(`.node[data-node="${fromNode}"] .node-port.${fromPort}`);
    const target = $(`.node[data-node="${toNode}"] .node-port.${toPort}`);
    if (!source || !target) return;
    const sx = source.parentElement.offsetLeft + source.offsetLeft + source.offsetWidth / 2;
    const sy = source.parentElement.offsetTop + source.offsetTop + source.offsetHeight / 2;
    const tx = target.parentElement.offsetLeft + target.offsetLeft + target.offsetWidth / 2;
    const ty = target.parentElement.offsetTop + target.offsetTop + target.offsetHeight / 2;
    const dx = tx - sx;
    const dy = ty - sy;
    if (Math.abs(dy) > Math.abs(dx) * 1.2) {
      const bend = Math.max(65, Math.abs(dy) * .45);
      path.setAttribute('d', `M ${sx} ${sy} C ${sx} ${sy + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`);
    } else {
      const bend = Math.max(55, Math.abs(dx) * .42);
      path.setAttribute('d', `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`);
    }
  });
}

function focusNode(name) {
  const node = $(`.node[data-node="${name}"]`);
  if (!node) return;
  pan.x = viewport.clientWidth / 2 - (node.offsetLeft + node.offsetWidth / 2) * scale;
  pan.y = viewport.clientHeight / 2 - (node.offsetTop + node.offsetHeight / 2) * scale;
  applyTransform();
  nodes.forEach(item => item.classList.toggle('selected', item === node));
}

function renderInspector(name) {
  const labels = { reference: '产品原图', audio: '音频参考', prompt: '分镜与提示词', generation: 'AutoDL 视频生成', result: '最终视频' };
  const details = {
    reference: '黄橙款与粉色款分别绑定各自的原始图片。黑色卷曲护肩套、玩偶比例和配件组合必须保持一致。',
    audio: '工作流要求第一个音频槽。本次使用 AutoDL 官方静音参考，视频中没有口播。',
    prompt: '画布中显示的是这次实际提交给 AutoDL 的完整英文提示词，滚动提示词区域即可阅读全部内容。',
    generation: '这里显示工作流 ID、任务 ID、排队或生成状态及运行耗时。绿色跑马灯表示正在生成。',
    result: '视频文件保存在本机项目中。播放、放大和下载均读取同一个 MP4 文件。'
  };
  $('#inspectorContent').innerHTML = `<p class="detail-kicker">CANVAS NODE</p><h2 class="detail-title">${labels[name]}</h2><p class="detail-copy">${details[name]}</p>`;
  $('#inspector').classList.add('open');
}

function setProcessStep(status) {
  const steps = [...document.querySelectorAll('#processSteps span')];
  const completedCount = status === 'SUCCESS' ? 4 : status === 'RUNNING' ? 2 : status === 'QUEUED' ? 1 : 0;
  const current = status === 'QUEUED' ? 1 : status === 'RUNNING' ? 2 : -1;
  steps.forEach((step, index) => {
    step.classList.toggle('done', index < completedCount || status === 'SUCCESS');
    step.classList.toggle('current', index === current);
  });
}

function renderProject() {
  if (!project) return;
  const { request, sources, audio, run } = project;
  $('#yellowImage').src = sources[0].url;
  $('#yellowLink').href = sources[0].url;
  $('#pinkImage').src = sources[1].url;
  $('#pinkLink').href = sources[1].url;
  $('#audioPlayer').src = audio.url;
  $('#promptContent').textContent = request.prompt;
  $('#taskId').textContent = run.taskId || '尚未提交';
  const status = run.status;
  const generation = $('.generation-node');
  generation.classList.toggle('is-running', status === 'QUEUED' || status === 'RUNNING');
  generation.classList.toggle('is-success', status === 'SUCCESS');
  generation.classList.toggle('is-failed', status === 'FAILED' || status === 'ERROR');
  setProcessStep(status);

  const labels = { PLANNED: '待提交', QUEUED: '排队中', RUNNING: '正在生成', SUCCESS: '生成完成', FAILED: '生成失败', ERROR: '状态异常' };
  const label = labels[status] || status;
  $('#generationBadge').textContent = label;
  $('#generationStatus').textContent = label;
  $('#generationTime').textContent = run.elapsedSeconds == null ? (run.submittedAt ? '已提交，等待进度' : '素材与提示词已就绪') : `AutoDL 运行 ${run.elapsedSeconds} 秒`;
  $('#topStatus').textContent = `AutoDL · ${label}`;
  $('#topStatus').className = `top-status ${status === 'SUCCESS' ? 'success' : ['QUEUED','RUNNING'].includes(status) ? 'running' : ''}`;
  $('#footerStatus').textContent = run.videoReady ? '视频已保存到本机 · 等待人工审片' : `任务状态：${label}`;
  $('#resultBadge').textContent = run.videoReady ? 'MP4 已保存' : label;

  const placeholder = $('#resultPlaceholder');
  const video = $('#resultVideo');
  const actions = $('#resultActions');
  if (run.videoReady) {
    placeholder.hidden = true;
    video.hidden = false;
    actions.hidden = false;
    $('#reviewNote').hidden = false;
    if (video.getAttribute('src') !== run.videoUrl) video.src = run.videoUrl;
    video.poster = run.posterUrl || '';
    $('#downloadVideo').href = run.downloadUrl;
    $('#largeDownload').href = run.downloadUrl;
    $('#resultMeta').textContent = '480 × 864 · 3.05 秒 · 点击播放或下载';
    $('#openRun').innerHTML = '查看视频 <span>→</span>';
  } else {
    placeholder.hidden = false;
    placeholder.textContent = ['QUEUED','RUNNING'].includes(status) ? `${label}\n结果准备中…` : status === 'PLANNED' ? '等待生成视频' : run.error || '尚无可播放结果';
    actions.hidden = true;
    video.hidden = true;
    $('#reviewNote').hidden = true;
    $('#openRun').innerHTML = status === 'PLANNED' ? '提交测试 <span>→</span>' : '查看任务 <span>→</span>';
  }
  renderConnections();
}

async function loadProject() {
  try {
    const [projectResponse, healthResponse] = await Promise.all([fetch('/api/project', { cache: 'no-store' }), fetch('/api/health', { cache: 'no-store' })]);
    if (!projectResponse.ok) throw new Error('本机项目读取失败');
    project = await projectResponse.json();
    health = healthResponse.ok ? await healthResponse.json() : null;
    renderProject();
    if (['QUEUED','RUNNING'].includes(project.run.status)) schedulePoll();
  } catch (error) {
    $('#promptContent').textContent = '本机执行器未连接。请确认 127.0.0.1:4173 正在运行。';
    $('#generationStatus').textContent = '连接失败';
    $('#resultPlaceholder').textContent = '无法读取本机结果';
    $('#topStatus').textContent = '本机执行器未连接';
    console.error(error);
  }
}

function schedulePoll() {
  if (pollTimer) return;
  pollTimer = window.setInterval(async () => {
    await loadProject();
    if (!project || !['QUEUED','RUNNING'].includes(project.run.status)) { clearInterval(pollTimer); pollTimer = null; }
  }, 5000);
}

function openRunDialog() {
  if (project?.run.videoReady) return focusNode('result');
  if (project && ['QUEUED','RUNNING'].includes(project.run.status)) return focusNode('generation');
  const alreadySubmitted = Boolean(health?.alreadySubmitted || project?.run.taskId);
  $('#tokenState').textContent = health?.comfyuiTokenConfigured ? '✓ 本机 ComfyUI Token 已就绪' : '○ 需要本机 ComfyUI Token';
  $('#submitStatus').textContent = alreadySubmitted ? '此测试已提交过一次，已锁定再次提交。' : health?.comfyuiTokenConfigured ? '准备就绪。点击后会提交一次 AutoDL 任务。' : '请在本机配置 AUTODL_COMFYUI_TOKEN。';
  $('#savePlan').disabled = alreadySubmitted || !health?.comfyuiTokenConfigured;
  $('#runDialog').showModal();
}

async function submitSmokeTest() {
  if (health?.alreadySubmitted || project?.run.taskId) return;
  const button = $('#savePlan');
  button.disabled = true;
  button.textContent = '提交中…';
  try {
    const response = await fetch('/api/submit-smoke-test', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '提交失败');
    $('#runDialog').close();
    notify(`任务已提交：${result.taskId}`);
    await loadProject();
    focusNode('generation');
  } catch (error) {
    $('#submitStatus').textContent = error.message;
    button.disabled = false;
  } finally { button.textContent = '提交 1 次测试'; }
}

nodes.forEach(node => {
  node.addEventListener('click', event => {
    if (suppressNodeClick) { suppressNodeClick = false; return; }
    if (event.target.closest('a,button,video,audio,.prompt-content')) return;
    nodes.forEach(item => item.classList.toggle('selected', item === node));
    renderInspector(node.dataset.node);
  });
  node.addEventListener('pointerdown', event => {
    if (event.target.closest('a,button,video,audio,.prompt-content')) return;
    draggingNode = { node, x: event.clientX, y: event.clientY, left: node.offsetLeft, top: node.offsetTop, moved: false };
    node.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });
  node.addEventListener('pointermove', event => {
    if (draggingNode?.node !== node) return;
    const dx = (event.clientX - draggingNode.x) / scale;
    const dy = (event.clientY - draggingNode.y) / scale;
    if (Math.abs(dx) + Math.abs(dy) > 4) draggingNode.moved = true;
    node.style.left = `${Math.max(18, draggingNode.left + dx)}px`;
    node.style.top = `${Math.max(18, draggingNode.top + dy)}px`;
    renderConnections();
  });
  node.addEventListener('pointerup', event => {
    if (draggingNode?.node !== node) return;
    suppressNodeClick = draggingNode.moved;
    draggingNode = null;
    node.releasePointerCapture?.(event.pointerId);
  });
});

viewport.addEventListener('wheel', event => {
  if (event.target.closest('.prompt-content')) return;
  event.preventDefault();
  scale = Math.min(1.35, Math.max(.5, scale + (event.deltaY < 0 ? .06 : -.06)));
  applyTransform();
}, { passive: false });
viewport.addEventListener('pointerdown', event => {
  if (event.target.closest('.node')) return;
  moving = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  viewport.setPointerCapture(event.pointerId);
  viewport.classList.add('grabbing');
});
viewport.addEventListener('pointermove', event => {
  if (!moving) return;
  pan.x = moving.panX + event.clientX - moving.x;
  pan.y = moving.panY + event.clientY - moving.y;
  applyTransform();
});
viewport.addEventListener('pointerup', () => { moving = null; viewport.classList.remove('grabbing'); });

$('#fitCanvas').addEventListener('click', fitCanvas);
$('#zoomIn').addEventListener('click', () => { scale = Math.min(1.35, scale + .1); applyTransform(); });
$('#zoomOut').addEventListener('click', () => { scale = Math.max(.5, scale - .1); applyTransform(); });
$('#openRun').addEventListener('click', openRunDialog);
$('#closeDialog').addEventListener('click', () => $('#runDialog').close());
$('#savePlan').addEventListener('click', submitSmokeTest);
$('#closeInspector').addEventListener('click', () => $('#inspector').classList.remove('open'));
$('#previewVideo').addEventListener('click', () => { $('#largeVideo').src = project.run.videoUrl; $('#previewDialog').showModal(); });
$('#closePreview').addEventListener('click', () => { $('#largeVideo').pause(); $('#previewDialog').close(); });
$('#previewDialog').addEventListener('close', () => $('#largeVideo').pause());
document.querySelectorAll('.nav-item').forEach((button, index) => button.addEventListener('click', () => {
  if (index === 0) fitCanvas();
  if (index === 1) focusNode('prompt');
  if (index === 2) focusNode('result');
  if (index === 3) focusNode('reference');
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item === button));
}));
document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.mode').forEach(item => item.classList.toggle('active', item === button)); notify(`已切换为${button.textContent}工作方式`); }));
window.addEventListener('resize', fitCanvas);

renderConnections();
window.requestAnimationFrame(fitCanvas);
loadProject();
