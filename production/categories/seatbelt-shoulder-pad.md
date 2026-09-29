# 安全带护肩套类目

商品身份以 `production/config/products.json` 中选定 SKU 的原始产品图为准；镜头表现已安装或佩戴状态时，以该 SKU 的批准参考图和用户提供的佩戴参考为准。镜头出现车辆时按可见内容核对车辆空间；只有表现安全带与商品的关系时才应用安全带路径、比例和遮挡规则。禁用安装动作及安全宣称规则，读取 `.agents/skills/seatbelt-video-studio/SKILL.md` 和其 `references/product-safety.md`、`references/vehicle-spatial-rules.md`。

原创脚本可从通勤、停车后分享、乘车体验、礼物展示等真实情境出发。镜头和人物不必重复同一个模板；产品物理结构必须始终保持正确。只有经核实的舒适度或材质等卖点才能写成事实性宣称。

## 材质参考（黑色护肩垫，类目级共享）

黑色护肩垫的权威材质参考图为 `production/assets/material-references/black-pad-material-4k.png`（3840×5760，AI 增强 4K）。该图锁定黑色护肩垫的材质真值：密集不规则凸起圈纹、哑光质感与上下缝制包边。生成或合成涉及黑色护肩垫的画面时，应引用此图作为材质参考；自检时逐帧核对纹理连续性，禁止被生成为平绒面、规整花纹或灰补片。
