# AutoDL 默认生成执行

## 唯一路径

所有正式视频生成从 `production/jobs/<job-id>/request-plan.json` 发起，经本机执行器调用 AutoDL API。无限画布不参与请求组装、提交、轮询或合成。

```text
assets/source + assets/generated + audio/source
  → request-plan.json
  → 本机执行器预检
  → AutoDL API
  → task ID
  → 轮询与下载
  → renders/runs/<shot-id>/<task-id>.mp4
```

## H3 音画融合请求

每个镜头记录：

- `workflow_id`
- `prompt`
- `duration`：1–15 秒
- `resolution`
- `ref_images`：`minimax_h3_z0903` 最多 6 张，按角色顺序固定
- `ref_audio`：最多 3 段。每段先上传为 AutoDL 可访问 URL，再映射为 `ref_audio_0...ref_audio_2`

执行器将图片转换为 API 所需的引用形式，组装音频 URL，提交任务并把任务 ID、参数快照和结果写回任务目录。没有成功写入 task ID 时，状态为未提交。

## 配音发布

本机执行器读取 `production/config/media-store.env`，将镜头 `ref_audio[]` 中的本地文件上传到 R2，并将公开地址写入 `ref_audio_urls[]`。预检未得到 URL 时阻止提交并报告“音频未发布”；已发布后，执行器将 URL 映射为 `ref_audio_0...ref_audio_2`。

配置模板见 `production/config/media-store.env.example`。生产媒体桶为 `nv315-video-media`，公开域名为 `https://media.nv315.top`。通过 R2 控制台创建的 Object Read & Write 凭据中的 `Access Key ID` 和 `Secret Access Key` 只能保存在本机私密配置中。
