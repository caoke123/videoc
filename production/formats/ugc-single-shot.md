# 单镜头口播 UGC（ugc-single-shot）

制作阶段顺序统一遵循 [标准视频制作流程](../workflows/standard-video-production.md)；本文件只补充单镜头 UGC 的表达与时长规则。

单一镜头，通常是人物对镜口播或产品近景展示，`shot-plan.json.shots[]` 只有一个条目。画布按单节点渲染，不需要顺序连接线。

约束：单镜头时长一般 3-15 秒；口播文案与画面动作需在同一条 `request-plan.json` prompt 内完整表达（无法像多镜头 TVC 那样分镜头拆分节奏）。
