# 电商 UGC 短视频生产项目

Codex 从商品资料出发，原创策划脚本、人物、场景、动作和分镜，制作写实的 9:16 短视频。参考爆款视频是可选输入。项目以类目配置管理产品真实结构和拍摄约束，目前有已启用的安全带护肩套类目，以及待补商品资料的包包挂饰类目。

## 直接提出需求

- “为这款安全带护肩套原创一条 10 秒女车主口播视频，先给我脚本和分镜。”
- “为包包挂饰建立 SKU 和场景设定，使用我提供的产品照片。”
- “为当前批次生成写实人物和产品关键帧，先检查产品比例和物理接触。”
- “对同一套素材分别试 H3 和其他可用视频模型，记录可用率、时间和成本。”
- “上传一条参考视频，提炼镜头节奏，再用我的人物、商品和文案重新创作。”

## 生产入口

- `.agents/skills/ecommerce-video-studio/`：通用原创策划、写实人物、分镜、生成和审核规则。
- `.agents/skills/seatbelt-video-studio/`：安全带护肩套的 SKU、车辆空间、佩戴和 DFCine/H3 细则。
- `.agents/skills/ecommerce-video-edit/`：后期统筹；ClipSkills 决定粗剪节奏、镜头、声音和字幕，主要交付为可编辑剪映专业版草稿。用户在剪映人工精剪并手动导出；HyperFrames 仅作可选预览/旧项目路径。
- `production/config/categories.json` 与 `production/categories/`：类目清单及各自约束。新增类目先建立独立配置。
- `production/config/products.json`：已知 SKU 与批准的产品资产。
- `production/jobs/<批次名>/`：每条或每组视频的 brief、脚本、分镜、素材、运行记录和成片。
- `production/integrations/dfcine-mcp-capabilities.md`：DFCine MCP 工具清单及其在生产链路中的调用顺序。
- `production/integrations/seed-audio-1.0/brief-contract.md`：新项目外部配音交接与导入检查规则。
- `production/integrations/jianying-draft-export-assessment.md`：剪映草稿导出技能评估及接入验证门槛。
- `production/jobs/lulu-commute-10s-20260925/`：历史 10 秒双镜头小样；原有 ElevenLabs/HyperFrames 文件只用于复现，不代表新项目默认工作流。当前重制按用户要求暂停。

新批次示例：

```text
python .agents/skills/ecommerce-video-studio/scripts/init_batch.py --id commute-ugc-01 --category seatbelt-shoulder-pad --mode original
```

`original` 是默认模式，从商品资料独立完成创意。`reference` 分析参考视频的通用镜头结构；`hybrid` 将参考节奏与原创人物、文案和商品结合。

AutoDL 开发者 Token 填入本地 `production/config/autodl.env` 的 `AUTODL_TOKEN=` 后面。该文件已排除在 Git 之外；`production/config/autodl.env.example` 是不含密钥的示例。当前仅建立配置入口，尚未接入实例管理或启动云主机。

## 从创意到成片

1. 确认 SKU、真实商品资料、目标人群、场景和经核实的卖点。
2. 提出几种原创 Hook 与故事角度，选定一条并写口播脚本、人物设定和动作。
3. 写镜头合同，准备人物、场景和产品关键帧；按类目检查产品结构与真实接触。
4. 人工批准素材、确认实际工作流和算力后，通过 DFCine/H3 生成短镜头。自建 H3 Gateway 仍需单独部署验证。
5. 审核镜头并收到用户外部生成的 Seed Audio 后，写 `edit/edit-plan.json`：ClipSkills 负责粗剪判断，生成可编辑剪映专业版草稿，包含分镜片段、配音、字幕等分轨素材。
6. 用户把草稿导入/打开到剪映后人工精剪，核对产品、口型、字幕安全区、声音和时长，并由用户手动导出成片。项目不自动执行剪映导出。

旧版 HyperFrames 样片工程保留在 `production/jobs/lulu-commute-10s-20260925/edit/hyperframes/`，只用于历史复现/按需预览，不作为新批次默认后期路线。剪映 11.5 的草稿生成、播放、字幕轨和关闭重开已通过一次诊断草稿验证；记录见 `production/integrations/jianying-draft-export-assessment.md`。

每个新 H3 镜头必须带与外部 Seed Audio 文案完全一致的原生口播/画外音，以引导表演和口型。Codex 提供逐镜头文案、角色定位、情绪、语气、节奏、时长和停顿提示，用户在 Seed Audio 1.0 外部生成，返回文件后再导入。字幕依据实际音频定时。

历史 HyperFrames 预览工程可以按需重建：

```text
python production/postproduction/build_hyperframes.py production/jobs/lulu-commute-10s-20260925/edit/edit-plan.json --allow-missing-audio --carve
```

这段命令仅供旧 HyperFrames 工程预览，不是新批次交付路线。新项目必须先有用户返回的 Seed Audio，并完成剪映草稿导出器验证。

原始素材保存在 `assets/source/`，不可覆盖；批准素材在 `assets/approved/`。付费 DFCine 或 GPU 运行需要用户明确确认。人物、场景和产品以写实为主，人物皮肤、受力、衣物、光线与镜头行为遵循通用写实人物指南。安全带商品另须遵循正确佩戴和车辆结构规则；这些规则不套用到其他类目。
