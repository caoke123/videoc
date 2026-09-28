# 无限画布接入 AutoDL — 通过本机执行器

分支：`feature/infinite-canvas-integration`。`infinite-canvas/` 是 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) v0.19.0 的快照，前端 `infinite-canvas/web`（`bun run dev`，端口 4400），开发服务器把 `/api` 代理到本机执行器 `127.0.0.1:4173`。

## 结构：两个入口，一个执行器

```text
人工：无限画布（搭节点、换素材、写提示词、点生成） ─┐
                                                    ├─► 本机执行器 ─► AutoDL H3 ─► 任务目录
Codex：读写任务文件、批量提交                        ─┘   （唯一提交者，唯一持有 Token）
```

- **浏览器不接触 AutoDL，也不保存 Token。** 之前把 Token 写进浏览器 localStorage 的直连渠道已经撤销（连同浏览器里的 Token 一起清除）。
- 画布里点生成时，模型脚本只把 `提示词 + 参考图 + 时长` 交给执行器的 `POST /api/canvas/generate`。执行器把它记为任务 **`canvas-<画布id>`** 的一个新镜头（S01、S02…），按 `standard-video-production.md` 的合同提交、轮询、把 MP4 存到 `renders/runs/<镜头>/<task_id>.mp4`，画布再通过 `GET /api/canvas/generate/<任务>/<镜头>` 取结果。
- **一个任务对应唯一一个画布**：任务页的“在我的画布中打开”按钮创建（首次）或打开（之后）画布 `task-<sha256(任务id)前20位>`，节点约定为 `shot-<镜头id>`（视频）与参考图（图片）。在这个画布里生成会写回**原任务**：同一节点再次生成 = 重抽同一镜头（换 seed，旧视频保留，日志 `canvas_shot_updated`）；新增视频节点 = 新镜头。镜头仍在生成时重抽会被拒绝（409）。节点↔镜头映射存于任务目录 `canvas-binding.json`。配音不会带入画布；升级后需重新运行 `merge-channel.mjs`。
- 没有绑定任务的自由画布仍走 `canvas-<画布id>`；绑定的任务被删除后，画布生成会提示“绑定的任务已不存在”。
- 这个任务和 Codex 建的任务在同一个任务历史里，同样有 `run-log.jsonl`、审核记录，人工在画布里做的每次生成都能在任务页看到。

## 两个入口如何不互相踩

| 风险 | 处理 |
|---|---|
| 同时写 `request-plan.json` | 所有读改写（提示词编辑、素材上传、音频发布、画布追加镜头）走同一把按任务的写锁 |
| 重复点击 / 重试 | 画布每次生成带 `client_request_id`；相同 id 直接复用已有镜头，不重复提交 |
| 提交结果丢失（进程崩溃、连接断开） | 先落"提交意图"再调用 AutoDL；没拿到 task_id 的镜头标为"待核对"，**不自动重发**，人工核对后 `resolve-submit`（认领 task_id 或确认丢弃） |
| 同一张图存多份 | 参考图按 sha256：已在资产库就引用 `library:…`，否则任务内按哈希存一份 |
| 轮询失控 | 每个 task 只有一个轮询循环；出错按 5s→60s 退避，连续 12 次失败后停止并记录，可 `resume-poll` 恢复 |

## 在你自己的浏览器里启用

`配置 → 导入配置` 会**整体覆盖**现有配置，所以不要直接导入现成 JSON，而是合并到你自己导出的配置里：

1. 无限画布 `配置 → 导出配置`，得到 `infinite-canvas-config.json`（含你各渠道的 API Key，别提交、别外传；仓库已忽略 `infinite-canvas-config*.json`）。
2. 在仓库里运行：
   ```bash
   node infinite-canvas/autodl-channel/merge-channel.mjs infinite-canvas-config.json
   ```
   它保留你所有其他渠道和设置，只新增渠道 “AutoDL（本机执行器）”（模型 `AutoDL-H3`，脚本见 `infinite-canvas/autodl-channel/video-script.js`），并移除旧的 `autodl.art` 直连渠道。输出文件不含任何 Token。
3. `配置 → 导入配置` 选 `infinite-canvas-config.autodl.json`，视频节点的模型下拉里就会出现 `AutoDL-H3`。
4. 需要执行器在运行：`cd autodl-video-workbench && node local-runner.mjs`（需 `production/config/autodl.env` 里有 `AUTODL_COMFYUI_TOKEN`）。

## 已知限制

- 画布的比例/分辨率设置不会传给 AutoDL：分辨率固定为任务的 `768p竖(768*1376)`，只传时长（1–15 秒）。
- 至少需要 1 张参考图（与批量提交预检规则一致）；参考图最多 9 张，单张 ≤ 15MB，提示词 ≤ 4000 字，请求体 ≤ 160MB。
- 配音使用官方静音参考；画布里挂的音频不会传给 AutoDL（AutoDL 需要可访问的 URL，走任务里的"发布配音"流程）。
- 无限画布通用画布本身的项目数据仍存在浏览器本地；只有点了生成才会在 `production/jobs/canvas-<画布id>/` 产生任务。

## 验证情况

- 用模拟的 AutoDL 服务 + 临时任务目录做了端到端测试（不用真实 Token，不产生费用）：生成、幂等、3 个并发生成不丢镜头、库引用、视频落盘和回传、回放校验、审核记录、试探提交、"待核对"不重发，共 25 项，连续 3 轮全部通过；并用真实的 `video-script.js` 按插件运行方式驱动了一次完整生成。
- **没有点击真实生成。** 真实生成会调用 AutoDL 付费接口，需要你自己在画布里点。
