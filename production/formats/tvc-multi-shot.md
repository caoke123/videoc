# 多镜头 TVC（tvc-multi-shot）

多个连续镜头组成一条短片，每个镜头独立生成、独立审核，最后硬切拼接（不做转场）。`shot-plan.json` 的 `shots[]` 按时间顺序排列，每个镜头有独立的 `shot_id`、时长、卖点/文案分工；`request-plan.json`（如已生成）里每个镜头对应一条发给 AutoDL 的完整英文 prompt。画布按 `shots[]` 顺序水平排列节点，节点间用直线连接表示播放顺序。

已知实例：`production/jobs/pair-plush-tvc-10s-20260927/`（3 镜头，10 秒）。

约束：镜头数量不限，但总时长和镜头切分需在 brief 阶段定好；镜头之间的人物/产品/场景一致性由 `.agents/skills/ecommerce-video-studio/` 的写实人物与产品规则约束，不在本格式文档内重复。
