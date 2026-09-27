const nodeInfo = {
  reference: { kicker: 'REFERENCE ASSET', title: '水豚噜噜护肩套', copy: '产品身份图。用于锁定形状、粉色主体、黑色织物纹理与安装比例。', rows: [['文件', 'product-front.png'], ['用途', '图 1 · 产品身份'], ['状态', '已批准']], actions: ['替换参考图', '在新镜头复用'] },
  audio: { kicker: 'AUDIO REFERENCE', title: 'S01-driver-line.wav', copy: '用于引导演员口型和节奏。最终配音与剪辑由人工在剪映中完成。', rows: [['时长', '4.0 秒'], ['用途', '音频 1 · 口播参考'], ['状态', '已连接']], actions: ['替换音频', '查看口播文案'] },
  prompt: { kicker: 'SHOT CONTRACT', title: 'S01 · 开心通勤开场', copy: '镜头任务、人物动作、产品真实性和镜头运动都保存在这里。Codex 可读取并改写，但不会直接提交付费请求。', rows: [['画幅', '9:16'], ['时长', '4 秒'], ['原生声音', '需要']], actions: ['编辑镜头合同', '复制提示词'] },
  generation: { kicker: 'GENERATION NODE', title: 'AutoDL H3 六图三音频', copy: '此节点只指向 minimax_h3_z0903。实际请求由本地执行器读取，不会把 Token 发送到浏览器或写入项目文件。', rows: [['工作流', 'minimax_h3_z0903'], ['图像槽', '1 / 6 已连接'], ['音频槽', '1 / 3 已连接'], ['参数', '4 秒 · 768p 竖 · 2026']], actions: ['复制请求计划', '打开生成预检'] },
  result: { kicker: 'RESULT SLOT', title: '候选结果', copy: '生成成功后保存 MP4、任务 ID、参数快照和素材指纹。筛选通过的片段再由人工导入剪映。', rows: [['状态', '未生成'], ['输出', '等待 AutoDL 结果'], ['自动剪映导出', '关闭']], actions: ['查看运行记录'] }
};
const content = document.querySelector('#inspectorContent');
const toast = document.querySelector('#toast');
const viewport = document.querySelector('#viewport');
const stage = document.querySelector('#stage');
const lines = document.querySelector('.connections');
let active = 'reference', scale = 1, pan = { x: 0, y: 0 }, moving = null;

function renderInspector(key) {
  const data = nodeInfo[key];
  content.innerHTML = `<p class="detail-kicker">${data.kicker}</p><h2 class="detail-title">${data.title}</h2><p class="detail-copy">${data.copy}</p><div class="detail-list">${data.rows.map(([a,b]) => `<div class="detail-row"><span>${a}</span><b>${b}</b></div>`).join('')}</div><div class="detail-actions">${data.actions.map(a => `<button data-action="${a}">${a} <span style="float:right">→</span></button>`).join('')}</div>`;
  document.querySelectorAll('.node').forEach(n => n.classList.toggle('selected', n.dataset.node === key));
}
function applyTransform(){ const t = `translate(${pan.x}px,${pan.y}px) scale(${scale})`; stage.style.transform = t; lines.style.transform = t; document.querySelector('#zoomValue').textContent = `${Math.round(scale*100)}%`; }
function notify(message){ toast.textContent = message; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), 2500); }
function openDialog(){ document.querySelector('#runDialog').showModal(); }
renderInspector(active); applyTransform();

document.querySelectorAll('.node').forEach(node => node.addEventListener('click', (event) => { if (!moving) { active = node.dataset.node; renderInspector(active); } event.stopPropagation(); }));
content.addEventListener('click', e => { const action = e.target.closest('button')?.dataset.action; if (!action) return; if (action.includes('预检')) openDialog(); else if (action.includes('复制')) { navigator.clipboard?.writeText(JSON.stringify({workflow_id:'minimax_h3_z0903',duration:4,resolution:'768p竖',seed:2026},null,2)); notify('请求计划已复制（不含令牌）'); } else notify(`${action}：此原型已记录操作入口`); });
document.querySelector('#openRun').addEventListener('click', openDialog);
document.querySelector('#closeDialog').addEventListener('click', () => document.querySelector('#runDialog').close());
document.querySelector('#savePlan').addEventListener('click', () => { document.querySelector('#runDialog').close(); notify('已保存 z0903 生成计划；尚未提交 AutoDL'); });
document.querySelector('#closeInspector').addEventListener('click', () => document.querySelector('#inspector').style.display='none');
document.querySelector('#zoomIn').addEventListener('click', () => { scale=Math.min(1.4,scale+.1); applyTransform(); });
document.querySelector('#zoomOut').addEventListener('click', () => { scale=Math.max(.55,scale-.1); applyTransform(); });
document.querySelector('#fitCanvas').addEventListener('click', () => { scale=.78; pan={x:12,y:45}; applyTransform(); });
document.querySelector('#addShot').addEventListener('click', () => { notify('已建立 S04 空镜头合同；接下来可由 Codex 填入素材与提示词'); });
document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('.mode').forEach(b=>b.classList.remove('active')); button.classList.add('active'); notify(`已切换为${button.textContent}工作方式`); }));
viewport.addEventListener('wheel', (event) => { event.preventDefault(); scale = Math.min(1.4, Math.max(.55, scale + (event.deltaY < 0 ? .06 : -.06))); applyTransform(); }, {passive:false});
viewport.addEventListener('pointerdown', event => { if (event.target.closest('.node')) return; moving={x:event.clientX,y:event.clientY,px:pan.x,py:pan.y}; viewport.setPointerCapture(event.pointerId); viewport.classList.add('grabbing'); });
viewport.addEventListener('pointermove', event => { if(!moving)return; pan.x=moving.px+event.clientX-moving.x;pan.y=moving.py+event.clientY-moving.y;applyTransform(); });
viewport.addEventListener('pointerup', () => { moving=null;viewport.classList.remove('grabbing'); });
