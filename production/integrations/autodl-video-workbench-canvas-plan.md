# AutoDL 画布工作台 — 改造方案（Phase 1-5 已完成）

状态：**方向与决策点已于 2026-09-27 确认，Phase 1-5 已于同日全部完成并在浏览器实测验证**。唯一没有自动化测试覆盖的是"点击重新生成→真实触发 AutoDL 付费生成"这一步的最终真实调用，原因见 Phase 2、Phase 5 的说明——需要你自己在准备好付费测试时手动点一次验证。

## 1. 背景

`autodl-video-workbench/` 现在是一个和真正生产数据完全脱节的孤立小工具：`local-runner.mjs` 自己维护一份写死的单一 project 状态，`/api/project` 永远只返回这一个任务，画布节点（黄橙款/粉色款/提示词/生成/结果）直接写死在 `dist/index.html`、`dist/tvc.html` 里。而真正的生产数据——`production/jobs/<批次名>/`——已经有一套成熟、被多个批次验证过的目录约定（`brief.json`、`shot-plan.json`、`assets/`、`renders/`、`run-log.jsonl`、`<job>-run-state.json`）。这两边没有打通。

## 2. 你提的四条要求，对应到具体设计

| 需求 | 设计对应 |
|---|---|
| 1. 点开任务能看到全部资产/提示词/节点关系/成片 | 画布"任务历史"直接读 `production/jobs/*/`；点开任务 = 渲染该 job 的 `brief.json` + `shot-plan.json` + `assets/` + `renders/` |
| 2. 人工改提示词、手动重新生成，且要留日志 | 编辑写回 `shot-plan.json` 对应镜头字段；手动生成复用现有 AutoDL 提交逻辑；每次人工操作追加一条 `run-log.jsonl` |
| 3. 创意形式可扩展（UGC/TVC/9 宫格分镜等） | 新增"形式模板注册表"，参照 `production/config/categories.json` 已有的类目注册模式，同级新增一份形式注册表 |
| 4. 不管用什么画布，最终都要能调 AutoDL API 生成 | 画布只是前端视图，后端统一走一条提交/轮询链路，与画布技术选型解耦 |

**关键发现**：需求 1、2 要的东西（任务、资产、提示词、日志）在 `production/jobs/` 里已经基本存在，不需要另造一套数据结构，工作量比"从零设计任务系统"小很多。抽查了 `production/jobs/pair-plush-tvc-10s-20260927/`：

- `shot-plan.json` 已经是逐镜头结构（`shot_id`/`prompt` 相关字段/`references`/`dfcine_workflow_id`/`status`），画布节点数据可以直接映射，不用改 schema。
- `run-log.jsonl` 已经是**追加写**的事件日志（`submitted`/`success` 两种事件，带 `run_id`/`time`），需求 2 的"日志"要求只需要在这个已有格式上加一种新的事件类型（人工编辑/人工触发），不用新发明日志系统。
- `<job>-run-state.json`（如 `tvc-run-state.json`）已经是逐镜头的聚合状态（`status`/`task_id`/`elapsed_seconds`/`output_file`），画布的状态展示直接读这个文件就够。
- `production/config/categories.json` 已经是"注册表 + 独立 profile 文件"的模式（`category_id` → `production/categories/<id>.md`），需求 3 的"形式注册表"照抄这个模式即可，不用发明新范式。

## 3. 新增/改动的数据结构

### 3.1 形式注册表（新增，对应需求 3）

新增 `production/config/formats.json`（与 `categories.json` 同级、同模式）：

```json
{
  "schema_version": 1,
  "formats": [
    {
      "format_id": "tvc-multi-shot",
      "name": "多镜头 TVC",
      "status": "active",
      "profile": "production/formats/tvc-multi-shot.md",
      "node_template": ["reference", "audio", "prompt", "generation", "result"],
      "layout": "sequential-tabs"
    },
    {
      "format_id": "ugc-single-shot",
      "name": "单镜头口播 UGC",
      "status": "active",
      "profile": "production/formats/ugc-single-shot.md",
      "node_template": ["reference", "audio", "prompt", "generation", "result"],
      "layout": "single"
    },
    {
      "format_id": "nine-grid-storyboard",
      "name": "9 宫格分镜",
      "status": "draft",
      "profile": "production/formats/nine-grid-storyboard.md",
      "node_template": ["reference", "prompt", "generation"],
      "layout": "grid-3x3",
      "node_count": 9
    }
  ]
}
```

`brief.json` 增加一个 `format_id` 字段（向后兼容：缺省时默认 `tvc-multi-shot`，因为现有 job 基本都是这个形状）。画布读到 `format_id` 后去 `formats.json` 查节点模板和布局，渲染对应的图结构——这就是"可扩展"的落地方式：加一种新形式 = 加一条 `formats.json` 记录 + 一个 profile md，不需要改画布代码。

### 3.2 人工操作日志（扩展现有 `run-log.jsonl`，对应需求 2）

现有两种事件（`submitted`/`success`）不变，新增：

```json
{"time":"...","shot_id":"S02","actor":"user","type":"prompt_edit","field":"dialogue","before":"...","after":"...","run_id":null}
{"time":"...","shot_id":"S02","actor":"user","type":"manual_submit","run_id":"<新 run_id>","reason":"抽卡重来"}
```

`actor` 字段区分是脚本/Agent 写的还是画布上人工操作写的；沿用现有 `run_id` 关联方式，人工触发生成后走的还是同一条 AutoDL 提交链路，只是多记一条 `manual_submit`。

### 3.3 任务列表 API（新增，对应需求 1）

`local-runner.mjs` 需要从"单 project 状态机"改成"多任务读取器"：

- `GET /api/jobs` — 扫描 `production/jobs/*/`，读每个 job 的 `brief.json`（标题/形式/创建时间）+ `<job>-run-state.json` 或 `run-log.jsonl` 最后一条（整体状态），返回任务列表卡片数据。
- `GET /api/jobs/:jobId` — 返回单个 job 的完整详情：`brief` + `shot-plan` + 资产清单（扫 `assets/` 目录）+ `renders/` 文件列表 + run-state。
- `PATCH /api/jobs/:jobId/shots/:shotId` — 人工编辑某镜头字段，写回 `shot-plan.json`，追加 `prompt_edit` 日志。
- `POST /api/jobs/:jobId/shots/:shotId/submit` — 人工触发该镜头重新生成，复用现有 AutoDL 提交逻辑，追加 `manual_submit` 日志。
- `GET /api/jobs/:jobId/run-log` — 返回完整日志（画布"操作历史"面板用）。

## 4. 画布技术选型：确认迁移到 React Flow

结合需求 3（形式可扩展）重新确认结论：现在手写的 `app.js`/`tvc.js`（节点写死在 HTML 里）无法支撑"随时加新创意形式"，继续手写等于要自己实现一遍"节点类型注册 + 动态图渲染"，工作量不比直接上 React Flow 小，还得自己踩坑（上次审查列的缩放锚点、拖拽重排、pointercancel 兜底等问题）。

不采用 infinite-canvas 整体方案（对比结论见上一轮讨论）：它解决的是自由创作画布，节点类型是为图片编辑/多项目管理设计的，接进来要连带迁移一整套 UI 技术栈，超出当前需求。

**选型：迁移到 React + TypeScript + Vite + React Flow**，这也是需要向你确认的第一个决策点——现在 `autodl-video-workbench` 是零依赖的纯静态 HTML/JS/CSS，迁移后会引入完整的前端构建链路（`npm install`、`vite build`，产出物替换现有 `dist/`）。

## 5. 分阶段实施计划

> 每个阶段结束都有一个可验证的产出，方便你随时叫停或调整方向。

### Phase 1 — 后端数据层（不涉及画布，风险最低）✅ 已完成 2026-09-27
- 新增 `autodl-video-workbench/job-store.mjs`：`listJobs()`/`getJobDetail()`，容错读取 `production/jobs/*/`（brief/shot-plan/review/run-state/run-log/assets/renders），任何单个 job 格式不规整都不会导致接口整体失败
- `local-runner.mjs` 新增 `GET /api/jobs`、`GET /api/jobs/:id` 只读接口，不改动任何现有路由和文件格式
- 实测跑过全部 10 个真实 job 目录，包括无 `brief.json`/`shot-plan.json` 的早期批次（`canvas1-lulu-20260816`）和旧版 `request-plan.json`/`run-state.json` 形状的冒烟测试批次——均正常降级返回，不报错
- 验收：`curl http://127.0.0.1:4173/api/jobs` 和 `/api/jobs/pair-plush-tvc-10s-20260927` 均返回完整结构化数据；`/api/tvc/project` 等既有接口回归测试通过

> Phase 1 过程中发现并更正了第 6 节决策点 2 的错误前提（见下），不影响 Phase 1 范围。

- 待办（推到 Phase 4）：`production/config/formats.json` + profile md 尚未创建——Phase 1 先验证了数据能读出来，形式注册表放到 Phase 4 和"9 宫格分镜"验证案例一起做，避免提前设计出用不上的字段

### Phase 2 — 人工操作闭环（后端，仍不涉及画布）✅ 已完成 2026-09-27
- 新增 `autodl-video-workbench/job-actions.mjs`：`patchShotField()`、`submitShot()`、`pollShot()`
- **范围更正**（比原计划文字更准确）：可编辑、可提交的字段是 `request-plan.json` 里逐镜头的 `prompt`（这是真正发给 AutoDL 的英文提示词），不是 `shot-plan.json` 的 `dialogue` 等编辑用字段——后者是创意/文案层面的记录，不直接驱动生成。只有已经有 `request-plan.json` 的 job（走 AutoDL 直连路径的）才支持人工编辑/提交；走 DFCine 等其他工作流的 job 没有这个文件，这两个新接口会明确报错"不支持"，不会硬凑。
- `local-runner.mjs` 新增 `PATCH /api/jobs/:jobId/shots/:shotId`（编辑字段）、`POST /api/jobs/:jobId/shots/:shotId/submit`（人工触发生成，复用 `submitTask`/`pollTask` 的同一套 AutoDL 提交/轮询逻辑，泛化成支持任意 job/shot）
- 每次编辑、每次人工提交都追加一条 `run-log.jsonl`：`{"actor":"user","type":"prompt_edit",...}` / `{"actor":"user","type":"manual_submit",...}`，与现有 `submitted`/`success`/`failed` 事件共存，不改变旧字段含义
- 保留原有的"进行中禁止重复提交"防护；单镜头冒烟测试 job 保留原有的"提交过一次就永久锁定"防重复计费护栏，多镜头 job（真正的"重新抽卡"场景）允许在非进行中状态下重新提交
- 验收方式做了调整：`submitShot` 会真的调用 AutoDL 付费接口，**没有用真实 job 数据做端到端提交测试**，避免误触发计费任务。验证方式：在一个隔离的临时 job（测试完已删除，未污染真实数据）上验证了 PATCH 编辑 → 写回 `request-plan.json` → 追加 `run-log.jsonl` 的完整链路；并验证了所有会在调用 AutoDL 前拦截的报错路径（镜头不存在、字段不可编辑、job 没有 `request-plan.json`）。真实一次人工提交需要你在准备付费测试时手动验证。

### Phase 3 — React Flow 画布骨架 ✅ 已完成 2026-09-27
- 新增 `autodl-video-workbench/web/`：React 18 + TypeScript + Vite 5 + `@xyflow/react`（React Flow）
- `JobList.tsx`（任务历史列表）+ `JobDetail.tsx`（React Flow 画布 + 资产/成片/操作历史侧栏）+ `ShotNode.tsx`（自定义节点），对接 Phase 1 的 `/api/jobs`、`/api/jobs/:id`
- Vite dev server 通过 `server.proxy` 把 `/api` 转发到本机 `local-runner.mjs`（127.0.0.1:4173），开发时两个进程独立跑；`build.outDir` 指向 `../web-dist`，不会覆盖现有 `dist/`——满足决策点 4（旧版 `dist/` 保持可用并行跑）
- 新增 `.claude/launch.json`，登记 `autodl-workbench-web` dev server 配置
- **过程中修的两个真实 bug**（都是实测截图发现的，不是纸面设计）：
  1. `job-store.mjs` 的 `getJobDetail()` 原本没有返回 `request-plan.json`（真正发给 AutoDL 的提示词），只返回了 `shot-plan.json` 的编辑字段——导致需求 1"点开任务能看到提示词"这条实际上没做到。已补上 `request_plan` 字段，画布点击镜头节点会显示对应的完整提示词原文。
  2. React Flow 的 MiniMap 渲染成一个不成比例的白色方块——根因是 CSS Grid 子项没有可计算的高度（`.job-canvas` 缺少明确 `height`，父级 grid 也没设 `grid-template-rows`），React Flow 的画布容器需要明确尺寸才能正常布局。已修复。
  3. 顺带修正节点状态显示：原来直接读 `shot-plan.json` 里静态的编辑期 `status`（永远是 `planned`），现在优先读 `run_state`/`run-log` 里真实的生成结果状态（`success`/`failed`/进行中），静态字段仅作兜底。
- 验收（浏览器实测，非纸面）：任务列表显示全部 10 个真实批次；点开 `pair-plush-tvc-10s-20260927` 能看到 S01/S02/S03 三个节点，状态均正确显示"生成完成"；点击节点侧栏显示对应的真实 AutoDL 提示词原文；资产/成片/操作历史三个面板都是真实数据；点开没有 `shot-plan.json` 的旧批次（`canvas1-lulu-20260816`）能优雅降级显示提示文字，不报错、不崩溃

> 已知遗留、不影响本阶段验收：`npm install` 报了一条 esbuild/Vite dev server 的中等严重性安全提示（只影响本地开发服务器读写权限，不影响生产构建产物），`npm audit fix --force` 会强制升级到 Vite 8（破坏性变更），本阶段未处理，留作后续可选项。

### Phase 4 — 形式模板注册机制（验证需求 3 真的可扩展）✅ 已完成 2026-09-27
- 新增 `production/config/formats.json`（登记 `tvc-multi-shot`/`ugc-single-shot`/`nine-grid-storyboard` 三种形式，格式仿照已有的 `categories.json`）+ 三份 profile md（`production/formats/*.md`）
- 后端新增只读 `GET /api/formats`
- 前端 `JobDetail.tsx` 抽出 `layoutPosition()`：按 `layout` 字段（`sequential` 水平顺序 / `grid-3x3` 三列网格）计算节点坐标；`grid-3x3` 不画连接线（空间并列关系，不是播放顺序），其余节点渲染逻辑（`ShotNode.tsx`）完全不变
- **验收标准的一点澄清**：可扩展验证的是"复用已有 layout 类型的新形式，不需要改代码"，而不是"任何新形式都不需要改代码"——`grid-3x3` 是第一个用到网格布局的形式，实现它本身就是本阶段要交付的工作。验证方法：用一个临时 9 镜头 demo job（浏览器截图确认按 3×3 正确渲染、无多余连接线后已删除，未留在 `production/jobs/`）证明了"只改 `formats.json` + `shot-plan.json` 数据，不碰 `ShotNode.tsx`"这条路径确实走得通；同时回归验证了 `pair-plush-tvc-10s-20260927` 的水平顺序布局没有被破坏。

### Phase 5 — 人工编辑 + 手动生成 + 操作历史面板 ✅ 已完成 2026-09-27
- 新增 `PromptEditor.tsx`：镜头提示词可编辑文本框 + "保存修改"（调 Phase 2 `PATCH`）+ "重新生成（调用 AutoDL）"（调 Phase 2 `POST submit`）两个按钮，未保存时禁止提交（避免提交了和显示不一致的提示词）
- 保存/提交成功后自动 `refetch()` 整个任务详情，画布状态、资产、操作历史面板同步刷新，不需要手动刷新页面
- "操作历史"面板在 Phase 3 就已经存在（读 `run_log`），本阶段没有新建，只是现在真正有人工操作数据可展示
- **验收方式的边界，和 Phase 2 一致**：`production/config/autodl.env` 里已经配了真实 Token，点"重新生成"会触发真实的、付费的 AutoDL 生成任务。我在浏览器里用一个临时 job（测完已删除）完整实测了"编辑提示词 → 点保存 → `request-plan.json` 写入 → `run-log.jsonl` 出现 `prompt_edit` 记录 → 侧栏操作历史实时刷新显示"这条链路，全程截图/网络请求确认为 200；**没有点击"重新生成"按钮**，因为那会花你的真钱、占用真实 AutoDL 额度。这一步需要你自己在准备好的时候点一次，验证"手动生成 → 看到新结果"这半条链路。

## 6. 决策点（已于 2026-09-27 确认）

1. **技术栈迁移**：✅ 确认迁移为 React+TS+Vite+React Flow 工程。
2. **AutoDL API 调用路径**：⚠️ **原判断有误，已更正**——`production/tools/autodl_pro.py` 管的是 AutoDL **GPU 实例生命周期**（开机/关机/查状态，`api.autodl.com`，用 `AUTODL_TOKEN`），和镜头生成提交是两套不同的 API。真正的镜头生成提交/轮询逻辑（`submitTask`/`pollTask`，调用 `autodl.art/api/v1/comfyui/...`，用 `AUTODL_COMFYUI_TOKEN`）**已经写在 `local-runner.mjs` 里**，只是写死只服务单个 job。Phase 2 改为：把这两个函数通用化（接受任意 job/shot 的 `plan`/`state` 路径），不引入跨语言调用。
3. **旧数据处理**：✅ `production/jobs/autodl-z0903-canvas-smoke-20260927/` 算进新任务列表，不特殊标记排除。
4. **发布节奏**：✅ Phase 3-5 期间现有 `dist/`（手写版）保持可用，并行跑，不提前下线。

## 7. 本次不做的事

- 不改动 `production/jobs/*/` 里任何已有文件的字段含义，只新增字段/新增文件类型，保证向后兼容
- 不改 DFCine/AutoDL 的实际生成模型、workflow 配置
- 不在这轮引入用户账号/多人协作（当前仍是单机本地工具的定位）

---

确认以上方向和第 6 节的决策点后，我会从 Phase 1 开始动工，每个 Phase 完成后再继续下一个，不会一次性把全部改完再给你看。
