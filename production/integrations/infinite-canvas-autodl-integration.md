# infinite-canvas 接入 AutoDL API — 评估分支记录

分支：`feature/infinite-canvas-integration`（`main` 分支的 `autodl-video-workbench` 未受影响）。

## 现状

- `infinite-canvas/` 是 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas) v0.19.0 的 vendored 快照（去掉了内嵌 `.git`，按普通文件纳入本仓库版本控制，不是 submodule）。
- `infinite-canvas/web/`：`bun install` 装好依赖，`bun run dev` 跑在 `http://localhost:4400`（原本 3000/3001 被本机其他进程占用，改了端口，见 `web/package.json`）。
- AutoDL 接入方式：**不改它的源码**，用它自带的"模型脚本"机制（`web/src/services/api/model-plugin.ts` 的 `runModelPlugin`）——给一个模型配一段用户自己写的异步 JS 脚本，运行时注入 `prompt`/`images`/`params`/`request()`/`poll()`/`apiKey` 等变量，脚本自己决定怎么调用第三方接口、怎么解析结果，最后 `return {url}` 或 `Blob`。这是它官方文档里"自定义接口调用：可自定义生图/视频接口的调用方式，灵活适配各类中转站与自建服务"这条能力的具体实现。

## 已完成的配置

1. **本地 CORS 代理**：`npx @basketikun/canvas-proxy@latest`，监听 `127.0.0.1:23210`。浏览器直连 AutoDL 会被 CORS 拦截，这个代理负责转发（不改请求体、不记录日志）。已启动并测试连通（`curl http://127.0.0.1:23210/https://autodl.art` → 200）。
2. **AutoDL 渠道**：在 配置 → 渠道 里新增了 "AutoDL H3"（`baseUrl: https://autodl.art`，`apiKey` 用的是 `production/config/autodl.env` 里的 `AUTODL_COMFYUI_TOKEN`），下面挂了一个视频模型 `AutoDL-H3-MiniMax`，绑定了下面这段脚本。
3. **本地代理开关**：已在配置里打开，指向 `127.0.0.1:23210`。

配置是直接写浏览器 `localStorage`（key: `infinite-canvas:ai_config_store`）注入的，不是通过 UI 一步步点出来的——比在网页的 CodeMirror 编辑器里模拟打字更快更可靠。**这个配置只存在当前浏览器的本地存储里，换一台机器/清浏览器数据需要重新导入**（配置弹窗右上角其实有"导入配置/导出配置"按钮，可以导出成 JSON 文件长期保存，建议之后手动导出一份）。

## AutoDL 视频生成脚本（绑定在 `AutoDL-H3-MiniMax` 模型上）

```js
/**
 * AutoDL ComfyUI workflow (H3) video generation.
 * POST /api/v1/comfyui/comfyui_workflow/{workflow}, then poll .../result/{taskId}.
 * images[] are already data URLs, matching AutoDL's ref_image_N shape directly.
 */
async function generateVideo({ prompt, images, params, request, poll, apiKey }) {
  const workflow = "minimax_h3_z0903";
  const payload = {
    duration: Number(params.seconds) || 3,
    resolution: "768p竖(768*1376)",
    seed: Math.floor(Date.now() / 1000),
    prompt: prompt,
    ref_audio_0: "https://codewithgpu.ks3-cn-beijing.ksyuncs.com/comfyui_api/blank/blank.wav",
  };
  images.forEach((dataUrl, index) => {
    payload["ref_image_" + index] = dataUrl;
  });

  const headers = { Authorization: apiKey, "Content-Type": "application/json" };
  const submitted = await request({
    method: "post",
    url: "https://autodl.art/api/v1/comfyui/comfyui_workflow/" + workflow,
    headers,
    data: payload,
  });
  const taskId = submitted && submitted.data && submitted.data.task_id;
  if (!taskId) throw new Error((submitted && submitted.msg) || "AutoDL did not return a task_id");

  function findUrl(value) {
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
    if (Array.isArray(value)) { for (const item of value) { const found = findUrl(item); if (found) return found; } return null; }
    if (value && typeof value === "object") { for (const v of Object.values(value)) { const found = findUrl(v); if (found) return found; } return null; }
    return null;
  }

  return await poll(
    () => request({ method: "get", url: "https://autodl.art/api/v1/comfyui/comfyui_workflow/result/" + taskId, headers }),
    (response) => {
      const data = response && response.data;
      if (!data) return null;
      if (data.status === "FAILED") throw new Error(data.message || "AutoDL generation failed");
      if (data.status !== "SUCCESS") return null;
      const url = findUrl(data.results);
      if (!url) throw new Error("AutoDL task succeeded but returned no video URL");
      return { url };
    },
    { intervalMs: 5000, timeoutMs: 480000 },
  );
}

return await generateVideo({ prompt, images, params, request, poll, apiKey });
```

**已知简化，不是完整实现**：
- `workflow` 硬编码 `minimax_h3_z0903`，`resolution` 硬编码竖版 768p——目前项目里实际用的就是这一个 workflow，先跑通用最简单的方式接，没有做成可配置。
- `ref_audio_0` 固定用官方静音参考音频 URL，没有支持把 infinite-canvas 里用户挂的参考音频文件转成 AutoDL 能拉取的 URL（AutoDL 要的是可访问的 URL，不是 base64；用户传的音频是本地文件，需要先上传到某个可访问的地方才能对接，这一步没做）。
- `seed` 用当前时间戳生成，不支持指定固定 seed 复现。

这几个简化如果要补齐，工作量都不大，但目前只是为了验证"这条接入路径走得通"，没有做成生产可用版本。

## 验证情况

- ✅ 打开 `http://localhost:4400`，新建画布，加了一个文本节点，输入了真实的中文提示词，节点自带"生图"操作按钮，确认了生成入口的位置。
- ✅ 渠道、模型、脚本、本地代理全部配置完成，且实测确认：代理进程在跑、代理到 `autodl.art` 的转发连通、`proxyEnabled` 在 localStorage 里确实是 `true`。
- ⛔ **没有实际点击生成**——这个模型一旦触发会调用真实的、付费的 AutoDL 接口，产生真实费用。这一步需要你自己在浏览器里点，我不会替你做。

## 怎么继续验证

1. 打开 `http://localhost:4400/canvas`，确认 `npx @basketikun/canvas-proxy@latest` 还在本机跑着（代理进程不是持久服务，重启电脑/关终端会断）。
2. 新建或打开一个画布，加一个文本节点，写提示词。
3. 选中节点，找视频生成相关操作，确认模型选的是 "AutoDL-H3-MiniMax"（配置里已设为默认视频模型）。
4. 点生成，实际观察是否能拿到 AutoDL 返回的视频。

如果失败，最可能的排查点：token 是否还有效、`canvas-proxy` 是否还在跑、AutoDL 账号余额/额度。
