# 项目优化方案（制作流程 · 素材库 · 执行器 · 画布）

状态：**方案稿，尚未实施**。依据：对 `standard-video-production.md`、执行器代码、6 个近期批次（2026-09-26 至 09-28）的 `run-log.jsonl`、文件时间戳的只读审查。耗时数字来自日志/文件时间推算；"优化后"的数字是**估算**，不是实测，实施后需用同一方法复测。

## 一、总览

| # | 问题 | 优化方向 | 主要收益 |
|---|---|---|---|
| 1 | 出片只占总时长 10–15%，其余是准备、等人、调画布 | 精简素材包默认化、画布自动布局、并行准备 | 单任务省 25–60 分钟 |
| 2 | 材质失真导致整批驳回重跑 | 先单镜头验材质再批量；材质约束固化 | 问题任务省约 100 分钟、少约 10 次重复生成 |
| 3 | 同一张 SKU 原图被复制 5–6 份，id 漂移 | 资产库引用而非复制，内容哈希做 id | 消除映射纠错，省 ≈41MB，节点稳定 |
| 4 | 镜头 id 不统一，三份文件重复记录同一信息 | 统一 id 规范，`request-plan` 由 `shot-plan` 生成，预检校验 | 消除隐性不一致 |
| 5 | 提交非幂等、`request-plan` 无写锁、轮询无退避 | 先写提交意图再调用；加锁；退避与上限 | 避免重复计费和孤儿任务 |
| 6 | 执行器职责混杂，旧路由与新路由并存 | 拆模块；删除旧写死逻辑 | 可维护、少出错 |
| 7 | 多条并行链路（浏览器直连、DFCine/AutoDL、多个前端） | 收敛为"唯一提交者 = 本机执行器" | 只有一条可信链路 |
| 8 | run-log 96% 是布局快照，格式不统一 | 布局不入 log；统一事件结构并校验 | log 可读、页面刷新变轻 |
| 9 | 测试批次混在正式任务里 | 独立 `_test` 区 | 任务历史干净 |
| 10 | 无限画布通用画布默认走 grok，人工搭建的节点无法用 AutoDL 生成；此前的浏览器直连方案又违反"唯一提交者" | 画布只把提示词和参考图交给本机执行器，执行器落到任务 `canvas-<画布id>` 并提交；人工（画布）与 Codex（任务文件）双入口共用同一套任务数据、写锁与幂等 | 人工可自由搭节点/换素材/改提示词，且与自动化同一条可审计链路，Token 不进浏览器 |

## 二、逐项方案

### 1. 制作流程耗时（准备与等待占大头）

**问题**
- 出片实际 7–9 分钟，整批却用 45–93 分钟；同样 14 秒，精简路线（`car-handheld`）15 分钟，分镜图路线（`shoulderpad`）93 分钟。
- `shoulderpad`：准备约 32 分钟（3 张分镜图 + 安装态参考图），出片 9 分钟，之后约 50 分钟花在画布布局上。
- `pink-lulu-real-driver`：配音文件在简报后 74 分钟才出现，request-plan 又晚 61 分钟，3 小时后仍未提交。
- 新流程文档已把"分镜图不是必做"写入，但两个 skill 里仍有旧写法，实际执行会回到重路线。

**优化**
- 精简素材包设为默认：只用 SKU 原图，仅在安装/佩戴、物理交互、特定人物/场景连续性、复杂构图、事实宣称时才补图。
- 对齐 `ecommerce-video-studio`、`seatbelt-video-studio` 两个 skill 与 `standard-video-production.md`，删去旧的强制分镜/多次审批表述。
- 人工确认合并为一次（提交前一次性看本批次创意和有争议的候选）。
- 配音与视频准备并行：脚本定稿即交给 Seed Audio，其他素材同时准备。**是否允许先出无配音视频，需你决定**（见第五节）。

**好处**：单任务准备时间约从 30 分钟降到 5–10 分钟；配音类任务不再串行卡住。

### 2. 材质失真引发的整批重跑

**问题**
- `weekday-commute-five-outfits`：174 分钟，约 21 次提交，其中前 11 条成片被人工驳回，理由反复是黑色护肩套纹理偏平、偏糊、偏离原图；提示词改了 5 版共 25 个文件。
- 每版都是 5 镜头同时提交，材质问题要等 5 条全出完才发现。

**优化**
- 批量前先**只提交 1 个镜头**验材质，通过后再提交其余镜头（新流程"一次授权"保留，改成"先 1 后 N"两步）。
- 材质约束固化为提示词条款，并固定挂同一张 `production/assets/material-references/black-pad-material-4k.png`。
- 驳回原因结构化记录（材质/一致性/口型/其他），复盘时统计最常见失败点。

**好处**：材质有问题的任务，避免重复 4 轮 × 5 镜头；估算从 174 分钟降到 60–80 分钟。

### 3. SKU 原图被复制多份 / id 漂移

**问题**
- `uploadJobAsset` 每次上传都存成 `assets/source/<毫秒时间戳>-<原名>`，不查哈希、不查 SKU 库，并同时追加进 `request-plan.json` 和 `shot-plan.json`。
- 智能体建批次时也会手工拷贝。结果：粉色款原图存在 6 份、6 个文件名；黄色款 5 份；13.7MB 材质图 2 份，重复合计约 41MB。
- 画布节点 id 由路径生成（`asset:<path>`、`render:<path>`），改名/重传/重抽卡都会产生新节点，旧布局变孤儿（`shoulderpad` 曾有 41 节点）。
- `production/assets/products/<sku_id>/` 和 `products.json` 已存在，但批次不引用。
- 音频每次发布用新的 `Date.now()` 对象名，无内容哈希；只发布 1 个镜头的音频就把整个任务标成 `ready_for_submission`。

**优化**：任务只引用、不复制。

```text
production/assets/                       # 资产库：唯一真值，只读、版本化、入 git
  products/<sku_id>/source|approved/
  materials/  characters/
production/jobs/<job_id>/
  request-plan.json                      # ref_images 写 asset_id
  assets/refs.json                       # 本任务用到的库资产清单（角色 → asset_id）
  assets/uploads/<sha8>-name             # 仅限库里没有的一次性上传，哈希命名
  assets/generated/                      # 本任务生成的候选
  renders/runs/<shot>/<task_id>.mp4
```

- 上传先算 sha256：已存在就复用已有 `asset_id`，不落新文件；新文件按类型进库（SKU/材质）或进 `uploads/`。
- `asset_id = sha256 前 12 位`；画布节点 id、连线 id 一律由 `(kind, shot_id/asset_id, run_id)` 确定，不含路径和时间戳。
- 提交时把每个入参的 sha256 写进 run-log，保证"当时用了哪张图"可复现。
- 预检增加：批次内出现与库相同内容的文件、引用解析不到，直接拦截。
- 库资产不可覆盖，改版只能新增 `-v2`。
- 现有重复素材用一次性迁移脚本处理：先出报告，你确认后再替换副本。
- 音频发布按内容哈希去重；"就绪"状态按所有镜头汇总，不再由单个镜头触发。

**好处**：一张图只有一个 id；不再需要手工纠正参考图映射（`粉裤噜妹` 前期 23 分钟里有相当一部分花在这上面）；节点和布局稳定；省磁盘。

### 4. 镜头 id 与多份记录不一致

**问题**
- 镜头 id 混用 `S01`、`G1`、`MAIN`、`undefined`；`pink-lulu-real-driver` 的 `shot-plan` 三个镜头没有 id，`request-plan` 却是单个 `MAIN`。
- 同一份提示词/参考图/对白同时写在 `brief`、`shot-plan`、`request-plan` 三个文件，靠人工同步。

**优化**
- 统一 id 规范：视频镜头 `S01…`，九宫格 `G1…G9`，单镜头 `S01`（弃用 `MAIN`）。
- `shot-plan` 为编辑源；`request-plan` 由它生成，不手工双写。
- 预检增加 schema 校验：id 唯一且一致、参考图存在、时长在 1–15 秒、音频 URL 为 https。

**好处**：这类不一致在提交前被机械发现，而不是等出问题后排查。

### 5. 重复提交与重试风险

**问题**
- `shoulderpad` 三镜头同时提交时，S02 因固定 `.tmp` 文件名竞争报 `ENOENT`，日志记成 `error`，但 AutoDL 实际已成功。（该竞争已被后续修改修复，写队列与 UUID 临时名已在。）
- 目前仍是先向 AutoDL 发 POST、拿到 task_id 后才落盘：进程崩溃或超时会产生孤儿任务，重试会重复计费。提交锁只在内存中，重启失效。
- `request-plan.json` 的读改写没有加锁，提示词编辑与音频发布并发会丢更新。
- 轮询出错每 5 秒无限重试并追加 `poll_error`，没有退避和上限。

**优化**
- 提交前先落"提交意图"（生成 `client_request_id`），拿到 task_id 后补全；重启后对账，未补全的意图人工确认，不自动重发。
- `request-plan.json` 与 run-state 使用同一套写队列。
- 轮询指数退避（如 5s→60s），设置最大错误次数，超限标记"需人工"，不再刷日志。

**好处**：不重复计费、不产生假失败、不丢编辑。

### 6. 执行器职责混杂

**问题**
- `job-actions.mjs`（417 行）同时负责建任务、上传素材、保存布局、发布音频到 R2、提交、轮询下载。
- `local-runner.mjs` 仍保留写死路径的旧逻辑（冒烟/TVC 两个任务、`/api/tvc/assets/yellow` 等路由、约 60 行与 `job-actions.mjs` 重复的提交/轮询代码），另有第三份脚本 `run-tvc.mjs`。
- 状态文件有 4 种命名（`run-state.json`、`tvc-run-state.json`、`<job>-run-state.json`、`autodl-run-state.json`），靠 `endsWith` 猜。

**优化**
- 拆为：`job-store`（读）、`asset-store`（上传/哈希/引用）、`autodl-client`（提交/轮询/下载，唯一持有 Token）、`audio-publisher`（R2）、`job-authoring`（建任务/布局）。
- 删除旧写死路由、`submitTask/pollTask` 重复代码和 `run-tvc.mjs`。
- 状态文件统一为 `run-state.json`，状态枚举统一为 `PLANNED/QUEUED/RUNNING/SUCCESS/FAILED`（对应 run-log 事件）。

**好处**：职责单一，改一处不牵动其他；新增视频形式时不必再碰提交逻辑。

### 7. 多条并行链路

**问题**
- 我此前配置的"无限画布 → 浏览器 → 本地代理 → AutoDL"直连通道，Token 存在浏览器 localStorage，与执行器是两条独立提交路径，且违反 `standard-video-production.md`（"浏览器和无限画布不直接调用模型接口、不保存 Token"）。
- DFCine（`h3.ref.cloud.accelerate`）与 AutoDL（`minimax_h3_z0903`）在文档和 skill 中各出现在 12 个文件；`AGENTS.md` 仍写 "Paid DFCine"。
- 前端有 4 个：手写 `dist/`、`autodl-video-workbench/web`、无限画布生产页、无限画布通用画布（数据存浏览器本地，不是任务文件）。

**优化**
- 撤掉浏览器直连通道，清除浏览器里的 Token；建议顺带轮换该 Token（它曾在会话输出中出现）。
- 明确"唯一提交者 = 本机执行器"；`AGENTS.md`、两个 skill、`categories`/`dfcine-mcp-capabilities.md` 中 DFCine 改为"仅旧任务兼容"。
- 前端保留一个：无限画布生产页。`dist/` 与 `web/` 归档；通用画布不再承担任务功能。

**好处**：只有一条可信、可审计的链路；Token 不出本机。

### 8. run-log 与画布布局

**问题**
- `shoulderpad` 的 run-log 225KB，其中 96% 是 `canvas_layout_edit`（每次保存完整 before/after）；`粉裤噜妹` 165KB；精简批次仅约 7KB。任务页每 5 秒拉取含这些内容的详情。
- 事件结构不统一：有的用 `event`、有的 `type`/`status`；早期 7 条无 `time`；存在空行；`succeeded` 与 `success` 混用；人工驳回会把成功记录改记为 `failed`。
- 布局手工调整占用大量时间（`shoulderpad` 约 50 分钟，`粉裤噜妹` 约 15 分钟）。

**优化**
- 布局只保存到 `canvas-layout.json`，不写 run-log；保存做防抖，只存变更后的结果。
- run-log 统一：`{time, actor, type, job_id, shot_id?, run_id?, ...}`，`time` 必填，写入时校验，不合规直接拒绝；人工驳回写新事件 `review_rejected`，不改旧记录。
- 布局自动生成且确定性（同一任务始终同一布局），手工拖动只是可选微调，不属于制作工序。

**好处**：日志可读、任务页刷新变轻；布局这一项每任务省 15–50 分钟。

### 9. 测试批次混入正式任务

**问题**：`production/jobs/` 中混有 `autodl-z0903-canvas-smoke`、`canvas-integration-smoke`、`pair-plush-tvc`、`demo-canvas-preview`。

**优化**：测试批次统一放 `production/jobs/_test/` 或 `scratch/`，任务列表默认不显示。

**好处**：任务历史只有真实批次。

## 三、视频制作时间提升（估算）

| 场景 | 现状 | 优化后（估算） | 主要来源 |
|---|---|---|---|
| 14 秒 3 镜头，走分镜图路线（`shoulderpad`） | 约 93 分钟 | 约 15–25 分钟 | 精简素材包（-25）、自动布局（-45）、映射预检（-5） |
| 12 秒 4 镜头主图视频（`粉裤噜妹`） | 约 45 分钟 | 约 15–20 分钟 | 引用替代复制/映射纠错（-10~15）、自动布局（-12） |
| 14 秒 3 镜头精简路线（`car-handheld`） | 约 15 分钟 | 约 12–15 分钟 | 基线已接近最优，主要是稳定性提升 |
| 5 镜头、材质有争议（`weekday`） | 约 174 分钟 | 约 60–80 分钟 | 先 1 镜头验材质、材质条款固化 |
| 配音驱动的 12 秒任务（`pink-lulu`） | 3 小时以上未提交 | 视你对配音策略的决定 | 配音与准备并行，最多可省约 1–2 小时 |

整体目标：常规 12–14 秒任务 **稳定在 15–25 分钟**（现在是 15–93 分钟，波动主要来自流程选择而非生成速度）；出片时间本身（7–9 分钟）由 AutoDL 决定，不在本方案范围内。

除时间外的收益：不重复计费、不出现假失败、任务可复现（每个入参有哈希）、历史可读。

## 四、实施顺序

| 阶段 | 内容 | 预计工作量 | 风险 |
|---|---|---|---|
| P0（当天） | 撤浏览器直连通道并清 Token；删旧写死路由与 `run-tvc.mjs`；`AGENTS.md`/skill 中 DFCine 措辞对齐；布局不再写 run-log | 小 | 低 |
| P1（本周） | run-log 统一结构与校验；id 规范与预检；提交意图落盘与对账；`request-plan` 写锁；轮询退避 | 中 | 中（触及提交主链路，需在测试任务上验证，不用真实付费任务测） |
| P2（本周） | 资产库引用机制：上传哈希去重、`refs.json`、预检查重；迁移脚本（先报告后执行） | 中 | 中（迁移需你确认） |
| P3 | 先 1 后 N 的提交流程；驳回原因结构化；自动布局；执行器拆模块；测试批次隔离 | 中 | 低 |

## 五、需要你决定的事项

1. **配音策略**：是否允许在配音未到位时先提交（用空白音频或原生对白）出草稿？还是必须等 Seed Audio 文件到位后再提交？这决定配音类任务能省多少时间。
2. **Token 轮换**：`AUTODL_COMFYUI_TOKEN` 是否现在轮换。
3. **旧前端**：`dist/` 和 `autodl-video-workbench/web` 是否归档。
4. **迁移**：重复素材迁移是否同意"先出报告、再按你确认执行"的方式。
5. **"先 1 后 N"**：是否接受作为默认流程（会多一次人工确认，但换来避免整批重跑）。

## 六、不确定与未验证

- 前期未打时间戳的批次，准备耗时是用文件修改时间推算的，可能偏差。
- AutoDL 排队/生成时间我没有独立测量，只使用了日志里的提交与完成时间。
- "优化后"数字是按已观察到的精简路线（`car-handheld` 15 分钟）和各环节实际占比推算，未在改造后实测。
- 第 3 项写的"重复合计约 41MB"是当时的粗算；改造后新增的只读报告把"与资产库同内容的副本"也算进去，实际是 **30 组重复、约 111MB**。

## 七、执行记录（2026-09-28）

测试方式：临时任务目录 + 模拟 AutoDL 服务，端到端 25 项检查连续 3 轮全部通过；另用真实的画布脚本驱动了一次完整生成。**没有触发任何真实付费生成，没有动真实任务的数据。**

| 项 | 状态 | 说明 |
|---|---|---|
| 1 流程耗时 | 部分完成 | 工作流文档、两个 skill、README、AGENTS.md 已对齐（精简包、先 1 后 N、执行器为唯一提交者）。**配音并行策略等你决定，未改。** |
| 2 材质重跑 | 部分完成 | 已做：`submit-batch` 的 `mode: "probe"`（只提交 1 个镜头，其余 `deferred`）；驳回原因结构化（`POST …/review`，`review_rejected` 必带 `material/consistency/lipsync/composition/audio/other`，只追加不改旧记录）。**未做**：把材质约束写成固定提示词条款（需要你确认措辞）。 |
| 3 资产库引用 | 大部分完成 | **2026-09-28 已执行迁移**：在用的执行器任务（`car-handheld`、`shoulderpad`、`pair-plush-tvc`、`pink-lulu-real-driver`、`粉裤噜妹主图视频`）里 12 份与资产库同内容的副本（45.9MB）已改为 `library:` 引用（重复素材由 111MB 降到 65MB）。做法：逐份校验 sha256 与库文件一致、同步改写 `request-plan/shot-plan/brief/canvas-layout` 里的引用、副本移到 `production/jobs/_migrated-duplicates/`（不直接删除）、每个任务的 run-log 记一条 `asset_migrated`；先在真实任务的副本上演练了“迁移→校验→回滚”，回滚后 127 个文件与原件逐一一致。可用 `node autodl-video-workbench/scripts/migrate-duplicate-assets.mjs --rollback` 一键回滚，确认无误后 `--purge --yes` 才会永久删除隔离区（44MB，在此之前磁盘并没有真正释放）。**有意保留未迁移的**：旧版 DFCine 任务（`afterwork`、`lulu-tutu`、`third-passenger`、`weekday`、`watercapybara`，已结束且不走执行器）、被 `dfcine/*.json` 等不可改写文件引用的副本、没有任何计划文件引用的副本（迁移后任务里会凭空少一份素材）、`assets/generated/` 下的候选图（保留出处）。同时修了任务详情接口：库引用不在任务目录里，之前会让资产节点从画布上消失，现在详情接口会把被引用的库资产列进 `asset_files`。另外已做：上传按 sha256（库内已有→引用 `library:…`；任务内同内容只存一份，不再带时间戳）；提交/预检/校验/文件路由都支持 `library:`；画布生成同样去重；只读重复报告 `scripts/report-duplicate-assets.mjs`；音频"就绪"状态改为所有需配音镜头都发布后才置位。**未做**：剩余 28 组重复（主要是旧任务里 approved 与 generated 的同内容副本，库中没有对应资产）；音频对象名仍带时间戳；任务页画布节点 id 仍由路径生成（前端未改，但新上传已是哈希名、库资产是固定引用，漂移面已缩小）。 |
| 4 id 与多份记录 | 部分完成 | 已做：`GET /api/jobs/<id>/validate`，并在批量提交预检前执行（镜头 id 规范/重复、shot-plan 与 request-plan 一致、参考图存在、时长 1–15、配音 https）。它已查出 `pink-lulu-real-driver`：shot-plan 3 个镜头无 id，而 request-plan 是单个 `MAIN`——**该任务我没有改，需要你决定按 3 镜头还是单镜头处理**。**未做**：`request-plan` 由 `shot-plan` 自动生成。 |
| 5 提交幂等等 | 已完成 | 先落“提交意图”再调用；连接中断或进程重启后无 task_id 的镜头标为“待核对”，禁止自动重发，可 `resolve-submit`（认领 task_id 或确认丢弃）；`request-plan.json` 加写锁；轮询每个 task 只有一个循环，出错 5s→60s 退避、连续 12 次停止并可 `resume-poll`。**测试中还发现并修复了一个真实问题**：Windows 下重命名 run-state 文件时若别的请求正在读它会报 `EPERM`（与之前 `ENOENT` 同类），现在读写都对瞬时文件错误重试。 |
| 6 执行器职责 | 部分完成 | 已删除写死路径的旧路由、`submitTask/pollTask` 重复代码、静态页托管；`run-tvc.mjs`、手写 `dist/`、React Flow `web/` 归档到 `autodl-video-workbench/legacy/`（`git mv`，可从历史恢复）；资产库拆为 `asset-library.mjs`。**未做**：`job-actions.mjs` 进一步拆分；状态文件命名统一（仍靠 `endsWith('run-state.json')`）。 |
| 7 双链路 | 已完成 | 浏览器直连渠道已撤销，浏览器里的 Token 已清除；旧路由/脚本已退役；DFCine 措辞对齐为“仅旧任务兼容”。**Token 轮换是你的决定，未做。** |
| 8 run-log | 部分完成 | 布局改动不再写 run-log；写入时强制 `time`+`actor`+`type/status`。**历史日志没有改写**（例如 `shoulderpad` 的 225KB 仍在，校验只给出警告）。 |
| 9 测试批次 | 已完成 | `autodl-z0903-canvas-smoke`、`canvas-integration-smoke`、`demo-canvas-preview` 移到 `production/jobs/_test/`，任务历史默认不显示 `_` 开头目录。 |
| 10 画布双入口 | 已完成 | `POST /api/canvas/generate` → 任务 `canvas-<画布id>`；`client_request_id` 幂等；配置合并工具 `infinite-canvas/autodl-channel/merge-channel.mjs`（不覆盖你现有渠道，输出无 Token）。详见 `infinite-canvas-autodl-integration.md`。**真实生成需要你自己点。** |

后续（2026-09-28）：`pink-lulu-real-driver-ugc-12s-20260928` 已按你的要求整体删除（任务目录 + 画布 `public/production-assets/` 下的对应资产目录），上文涉及它的记录仅作历史。

新增的边界值（需要你确认是否合适）：画布请求体上限 160MB、普通请求体 32MB、参考图最多 9 张且单张 ≤15MB、提示词 ≤4000 字、轮询连续错误上限 12 次。

所有改动目前**都在工作区、未提交**；工作区里还有其他会话留下的未提交改动，我没有替你提交。
