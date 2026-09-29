# Infinite Canvas 生产任务工作台

## 目标与数据归属

`production/jobs/<job-id>/` 是唯一任务记录，本机执行器是唯一生成执行入口。Infinite Canvas 只可作为任务历史、素材关系和镜头人工编辑的可选查看页；浏览器本地画布库仅服务自由创作，不作为生产任务或生成结果的唯一存储。DFCine 不参与本工作台生成链路。

开发访问地址为 `http://localhost:4400/production`，Vite 将 `/api` 代理至 `http://127.0.0.1:4173` 的本机执行器。执行器保管 AutoDL ComfyUI Token，浏览器不会接触 Token。TVC 与 UGC 视频镜头只可经执行器统一提交；画布通用生成节点不属于生产执行链路。

所有新视频任务共同遵循 [标准视频制作流程](../workflows/standard-video-production.md)：先定 brief 和剧本，再准备镜头实际需要的参考图与分镜；复用资产图可标记不适用。画布从任务文件自动投影当前入参、镜头和已生成结果，不要求人工摆放占位节点。创建空任务接口只是存储骨架，不代表前期制作已完成。提交前一次预检全部待生成镜头，再由用户一次确认批量提交。

## 任务记录

任务目录记录 `brief.json`、`shot-plan.json`、`request-plan.json`、`<job-id>-run-state.json`、`canvas-layout.json`、`run-log.jsonl`、`assets/` 和 `renders/`。布局只保存画布节点位置和连接；镜头内容、提示词、状态和资产路径从任务文件读取。

- `GET /api/jobs`、`GET /api/jobs/:jobId`、`GET /api/jobs/:jobId/run-log` 读取历史和完整事件日志。
- `POST /api/jobs` 按 `production/config/formats.json` 和 `categories.json` 建立任务模板。
- `POST /api/jobs/:jobId/assets` 保存图片、视频和音频资产；每个镜头的 `request-plan.json` 明确记录实际使用的图片与音频。音频需要先获得 AutoDL 可读取的 URL，才可通过预检。
- `PATCH /api/jobs/:jobId/shots/:shotId` 保存人工提示词修改并追加审计事件。
- `PATCH /api/jobs/:jobId/canvas` 保存节点布局/连线并记录布局变更。
- `POST /api/jobs/:jobId/shots/:shotId/submit` 提交单镜头；`POST /api/jobs/:jobId/submit-batch` 用 `dry_run: true` 预检，确认后一次提交全部未生成镜头。已有任务编号的镜头跳过，不自动重试。每次结果保存在 `renders/runs/<shot-id>/<task-id>.mp4`；`run-log.jsonl` 保存提示词快照、任务 ID、状态和结果路径，新的重抽不会覆盖既有生成版本。
- `GET /api/jobs/:jobId/files/:path` 在任务目录范围内读取素材和结果，视频支持 Range 播放。

开发环境须同时运行 Infinite Canvas Web 和本机执行器。执行器绑定回环地址 `127.0.0.1`；当前为单机本地工具，没有用户登录、远端部署、云端任务同步或跨机器共享。

## 形式扩展

UGC 与 TVC 注册为 AutoDL 视频形式并使用 H3 工作流。默认 H3 音画融合执行器以多图、多音频工作流为目标，输入上限为 9 图、3 音频、15 秒。九宫格注册为 3×3 图像分镜规划形式；尚无已验证的 AutoDL 图像工作流时，前端禁用提交按钮，避免误把图像分镜送入视频工作流。

## 验证边界

接口冒烟验证使用临时任务确认了任务创建、提示词更新、图片上传与镜头引用、画布布局、完整日志和受限文件读取。AutoDL 视频接入实测只提交一个 3 秒镜头；任务和结果仅用于接口验证，必须由人工检查后才能作为正式素材使用。服务端重启会恢复本机任务目录里仍处于排队/运行中的 AutoDL 轮询。
