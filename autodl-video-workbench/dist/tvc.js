const $ = selector => document.querySelector(selector);
const nodes = [...document.querySelectorAll('.node')];
const viewport = $('#viewport');
const stage = $('#stage');
const lines = $('.connections');
const shotNames = { S01: '黄橙款 · 开场', S02: '粉色款 · 亮相', S03: '双款同框 · 收尾' };
const shotSummaries = {
  S01: '黄橙款在暖白棚景中亮相。产品保持原样，镜头正面轻推近，暖光扫过黑色卷曲织物。',
  S02: '粉色款在淡粉棚景中亮相。产品保持原样，镜头正面轻推近，柔和侧光突出细节。',
  S03: '两款独立产品并列于深灰台面。正面轻拉远，完整呈现两件护肩套与各自玩偶。'
};
const linesOfVoice = { S01: '带上好心情，出发。', S02: '甜甜的，也酷酷的。', S03: '今天的通勤搭子，你选哪一个？' };
const statusLabels = { PLANNED: '待提交', QUEUED: '排队中', RUNNING: '正在生成', SUCCESS: '生成完成', FAILED: '生成失败', ERROR: '处理异常', SUBMIT_FAILED: '提交失败' };
let snapshot = null;
let selectedShot = 'S01';
let scale = 1;
let pan = { x: 0, y: 0 };
let moving = null;
let draggingNode = null;
let suppressClick = false;
let firstRender = true;
let priorVideoReady = false;

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
  pan = { x: (viewport.clientWidth - width * scale) / 2 - left * scale, y: (viewport.clientHeight - height * scale) / 2 - top * scale };
  applyTransform();
}
function renderConnections() {
  document.querySelectorAll('.connections path').forEach(path => {
    const [fromName, fromPort] = path.dataset.from.split(':');
    const [toName, toPort] = path.dataset.to.split(':');
    const from = $(`.node[data-node="${fromName}"] .node-port.${fromPort}`);
    const to = $(`.node[data-node="${toName}"] .node-port.${toPort}`);
    if (!from || !to) return;
    const sx = from.parentElement.offsetLeft + from.offsetLeft + from.offsetWidth / 2;
    const sy = from.parentElement.offsetTop + from.offsetTop + from.offsetHeight / 2;
    const tx = to.parentElement.offsetLeft + to.offsetLeft + to.offsetWidth / 2;
    const ty = to.parentElement.offsetTop + to.offsetTop + to.offsetHeight / 2;
    if (Math.abs(ty - sy) > Math.abs(tx - sx) * 1.2) {
      const bend = Math.max(65, Math.abs(ty - sy) * .45);
      path.setAttribute('d', `M ${sx} ${sy} C ${sx} ${sy + bend}, ${tx} ${ty - bend}, ${tx} ${ty}`);
    } else {
      const bend = Math.max(55, Math.abs(tx - sx) * .42);
      path.setAttribute('d', `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`);
    }
  });
}
function renderSteps(status) {
  const completed = status === 'SUCCESS' ? 4 : status === 'RUNNING' ? 2 : status === 'QUEUED' ? 1 : 0;
  const current = status === 'QUEUED' ? 1 : status === 'RUNNING' ? 2 : -1;
  [...document.querySelectorAll('#processSteps span')].forEach((step, index) => {
    step.classList.toggle('done', index < completed || status === 'SUCCESS');
    step.classList.toggle('current', index === current);
  });
}
function renderSources(shot) {
  const grid = $('#sourceGrid');
  if (grid.dataset.shot === shot.shotId) return;
  grid.dataset.shot = shot.shotId;
  grid.replaceChildren();
  grid.classList.toggle('single', shot.sourceUrls.length === 1);
  shot.sourceUrls.forEach((url, index) => {
    const link = document.createElement('a');
    link.className = 'source-card'; link.href = url; link.target = '_blank'; link.rel = 'noopener';
    const image = document.createElement('img'); image.src = url; image.alt = url.includes('yellow') ? '黄橙款护肩套原图' : '粉色款护肩套原图';
    const caption = document.createElement('span'); caption.textContent = url.includes('yellow') ? '黄橙款 · SKU 01' : '粉色款 · SKU 02';
    link.append(image, caption); grid.append(link);
  });
  $('#sourceCount').textContent = `${shot.sourceUrls.length} 张`;
  $('#sourceTitle').textContent = shot.sourceUrls.length === 2 ? '两款原图独立锁定' : `${shot.sourceUrls[0].includes('yellow') ? '黄橙款' : '粉色款'}完整产品原图`;
}
function renderShot(shot) {
  const switchedVideo = priorVideoReady !== shot.videoReady;
  priorVideoReady = shot.videoReady;
  $('#promptShotId').textContent = shot.shotId;
  $('#shotTitle').textContent = shotNames[shot.shotId];
  $('#shotSummary').textContent = shotSummaries[shot.shotId];
  $('#promptContent').textContent = shot.prompt;
  $('#shotDuration').textContent = `${shot.duration} 秒`;
  $('#generationDuration').textContent = `${shot.duration} 秒`;
  $('#seedDisplay').textContent = `Seed ${shot.seed}`;
  $('#voiceLine').textContent = linesOfVoice[shot.shotId];
  $('#referenceSlot').textContent = `参考图 ${shot.sourceUrls.length} / 6`;
  $('#taskId').textContent = shot.taskId || '尚未提交';
  renderSources(shot);

  const status = shot.status;
  const label = statusLabels[status] || status;
  $('#generationBadge').textContent = label;
  $('#generationStatus').textContent = label;
  $('#generationTime').textContent = shot.elapsedSeconds == null ? '等待 AutoDL 更新' : `AutoDL 已运行 ${shot.elapsedSeconds} 秒`;
  const generation = $('.generation-node');
  generation.classList.toggle('is-running', ['QUEUED','RUNNING'].includes(status));
  generation.classList.toggle('is-success', status === 'SUCCESS');
  generation.classList.toggle('is-failed', ['FAILED','ERROR','SUBMIT_FAILED'].includes(status));
  renderSteps(status);

  const video = $('#resultVideo');
  $('#resultBadge').textContent = shot.videoReady ? 'MP4 已保存' : label;
  if (shot.videoReady) {
    $('#resultPlaceholder').hidden = true;
    video.hidden = false;
    $('#resultActions').hidden = false;
    if (video.getAttribute('src') !== shot.videoUrl) video.src = shot.videoUrl;
    $('#downloadVideo').href = shot.downloadUrl;
    $('#resultMeta').textContent = `原始 768p · ${shot.duration} 秒 · 点击播放或下载`;
  } else {
    video.pause(); video.removeAttribute('src'); video.load(); video.hidden = true;
    $('#resultPlaceholder').hidden = false;
    $('#resultPlaceholder').textContent = ['QUEUED','RUNNING'].includes(status) ? `${label}\n生成结果准备中…` : shot.error || '尚无镜头视频';
    $('#resultActions').hidden = true;
    $('#resultMeta').textContent = '完成后可在此播放与下载';
  }
  $('#footerStatus').textContent = `${shot.shotId} · ${label}${shot.elapsedSeconds == null ? '' : ` · ${shot.elapsedSeconds} 秒`}`;
  renderConnections();
  if (firstRender || switchedVideo) { window.requestAnimationFrame(fitCanvas); firstRender = false; }
}
function makeFinalShotCard(shot) {
  const button = document.createElement('button'); button.className = 'final-shot'; button.type = 'button';
  const image = document.createElement('img'); image.src = shot.sourceUrls[0]; image.alt = shotNames[shot.shotId];
  const body = document.createElement('div');
  const title = document.createElement('strong'); title.textContent = `${shot.shotId} · ${shotNames[shot.shotId]}`;
  const meta = document.createElement('span'); meta.textContent = `${shot.duration} 秒 · ${statusLabels[shot.status] || shot.status}${shot.videoReady ? ' · 可预览' : ''}`;
  body.append(title, meta); button.append(image, body);
  button.addEventListener('click', () => chooseShot(shot.shotId));
  return button;
}
function renderFinal() {
  const assembly = snapshot.assembly;
  const list = $('#finalShotList'); list.replaceChildren(...snapshot.shots.map(makeFinalShotCard));
  $('#finalBadge').textContent = assembly.ready ? '720 × 1280 · 约 10 秒' : '等待合成';
  $('#finalPlaceholder').hidden = assembly.ready;
  $('#finalVideo').hidden = !assembly.ready;
  $('#finalDownload').hidden = !assembly.ready;
  if (assembly.ready) {
    if ($('#finalVideo').getAttribute('src') !== assembly.videoUrl) $('#finalVideo').src = assembly.videoUrl;
    $('#finalDownload').href = assembly.downloadUrl;
  } else {
    const done = snapshot.shots.filter(shot => shot.videoReady).length;
    $('#finalPlaceholder').textContent = `${done} / 3 个镜头已落盘。\n完成后提供 10 秒合成预览。`;
  }
  $('#footerStatus').textContent = assembly.ready ? '10 秒合成预览已就绪 · 待人工审片' : '逐镜生成中 · 合成尚未完成';
}
function renderTabs() {
  for (const shot of snapshot.shots) $(`#tabStatus${shot.shotId}`).textContent = statusLabels[shot.status] || shot.status;
  $('#tabStatusFinal').textContent = snapshot.assembly.ready ? '可播放' : `${snapshot.shots.filter(shot => shot.videoReady).length}/3 已完成`;
  const successCount = snapshot.shots.filter(shot => shot.videoReady).length;
  $('#overallStatus').textContent = snapshot.assembly.ready ? '合成预览已就绪' : `${successCount}/3 镜头已生成`;
  document.querySelectorAll('[data-shot]').forEach(button => button.classList.toggle('active', button.dataset.shot === selectedShot));
}
function chooseShot(id) {
  selectedShot = id;
  $('#shotCanvas').hidden = id === 'FINAL';
  $('#finalView').hidden = id !== 'FINAL';
  renderTabs();
  if (id === 'FINAL') renderFinal();
  else { priorVideoReady = false; renderShot(snapshot.shots.find(shot => shot.shotId === id)); window.requestAnimationFrame(fitCanvas); }
}
async function refresh() {
  try {
    const response = await fetch('/api/tvc/project', { cache: 'no-store' });
    if (!response.ok) throw new Error(`本机任务读取失败：${response.status}`);
    snapshot = await response.json();
    renderTabs();
    if (selectedShot === 'FINAL') renderFinal();
    else renderShot(snapshot.shots.find(shot => shot.shotId === selectedShot));
  } catch (error) {
    $('#overallStatus').textContent = '任务读取失败';
    $('#resultPlaceholder').textContent = error.message;
    console.error(error);
  }
}

document.querySelectorAll('[data-shot]').forEach(button => button.addEventListener('click', () => { if (snapshot) chooseShot(button.dataset.shot); }));
$('#finalShortcut').addEventListener('click', () => { if (snapshot) chooseShot('FINAL'); });
$('#fitCanvas').addEventListener('click', fitCanvas);
$('#zoomIn').addEventListener('click', () => { scale = Math.min(1.35, scale + .1); applyTransform(); });
$('#zoomOut').addEventListener('click', () => { scale = Math.max(.5, scale - .1); applyTransform(); });
$('#previewVideo').addEventListener('click', () => {
  const shot = snapshot.shots.find(item => item.shotId === selectedShot);
  if (!shot?.videoReady) return;
  $('#previewTitle').textContent = `${shot.shotId} · ${shotNames[shot.shotId]}`;
  $('#largeVideo').src = shot.videoUrl;
  $('#largeDownload').href = shot.downloadUrl;
  $('#previewDialog').showModal();
});
$('#closePreview').addEventListener('click', () => { $('#largeVideo').pause(); $('#previewDialog').close(); });
$('#previewDialog').addEventListener('close', () => $('#largeVideo').pause());
viewport.addEventListener('wheel', event => { if (event.target.closest('.prompt-content')) return; event.preventDefault(); scale = Math.min(1.35, Math.max(.5, scale + (event.deltaY < 0 ? .06 : -.06))); applyTransform(); }, { passive: false });
viewport.addEventListener('pointerdown', event => { if (event.target.closest('.node')) return; moving = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; viewport.setPointerCapture(event.pointerId); viewport.classList.add('grabbing'); });
viewport.addEventListener('pointermove', event => { if (!moving) return; pan.x = moving.panX + event.clientX - moving.x; pan.y = moving.panY + event.clientY - moving.y; applyTransform(); });
viewport.addEventListener('pointerup', () => { moving = null; viewport.classList.remove('grabbing'); });
nodes.forEach(node => {
  node.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } nodes.forEach(item => item.classList.toggle('selected', item === node)); });
  node.addEventListener('pointerdown', event => { if (event.target.closest('a,button,video,audio,.prompt-content')) return; draggingNode = { node, x: event.clientX, y: event.clientY, left: node.offsetLeft, top: node.offsetTop, moved: false }; node.setPointerCapture(event.pointerId); event.stopPropagation(); });
  node.addEventListener('pointermove', event => { if (draggingNode?.node !== node) return; const dx = (event.clientX - draggingNode.x) / scale; const dy = (event.clientY - draggingNode.y) / scale; if (Math.abs(dx) + Math.abs(dy) > 4) draggingNode.moved = true; node.style.left = `${Math.max(18, draggingNode.left + dx)}px`; node.style.top = `${Math.max(18, draggingNode.top + dy)}px`; renderConnections(); });
  node.addEventListener('pointerup', event => { if (draggingNode?.node !== node) return; suppressClick = draggingNode.moved; draggingNode = null; node.releasePointerCapture?.(event.pointerId); });
});
window.addEventListener('resize', () => { if (selectedShot !== 'FINAL') fitCanvas(); });
renderConnections();
refresh();
window.setInterval(refresh, 5000);
