# Realistic people and photographic behavior

Use this for character portraits, composite keyframes, and video prompts. First satisfy the brief's audience and visual taste, then make the result photographically and physically credible. Do not turn human imperfections into an appearance target.

## 审美优先级

1. 先确定角色的年龄段、气质、脸部审美、发型、妆容与服装，再确定场景和摄影方式。身份可辨、符合目标受众、镜头里有吸引力，比逐项添加“瑕疵关键词”更重要。
2. 写实指真实人体、材质、光照、动作与拍摄质感；不等于素颜、粗糙皮肤、凌乱头发、朴素穿搭或刻意显老。可以有自然修饰、精心打理的发型和轻度影像美化，不能变成假面、塑料皮肤或时装广告棚拍感。
3. 毛孔、绒毛、唇纹、眼下纹理、肤色差异、雀斑、碎发、噪点、色散等只是按景别和光线选择的辅助细节。不要把它们全部写进每条提示词；尤其不要用明显眼袋、粗糙肤质、夸张左右不对称或随机雀斑来证明“真实”。

## 本项目青年女性审美方向

用户提供的五张参考图呈现的是一种审美方向，而不是要复制其中某个人的面孔：年轻成年女性，清秀明媚、五官协调、眼神清澈有神、面部线条柔和，皮肤观感匀净明亮；轻薄但可见的日常妆容，眉眼有适度修饰、自然唇色；深色、有光泽且经过打理的中长发或长发，可根据角色选侧分、轻刘海、顺直层次或自然弧度。服装有女性化和都市时尚感，版型合身、材质可信；可依场景选择针织、衬衫、轻盈上衣、连衣裙等，不固定成西装、牛仔夹克或某一种颜色。

当简报指定 20–24 岁都市女性时，让角色明确呈现这一年龄段的成年气质与审美；不要沿用旧的 28–32 岁人脸再靠磨皮“减龄”，也不要画成未成年人。参考图可能经过日常妆容、手机成像或修饰；取其整体观感，不把皮肤光滑误判为必需的 AI 缺陷，也不复制五官、服装、场景或具体身份。

## 可复用提示词模块

写实、上镜的成年女性角色；按当前简报指定年龄、气质和生活身份。人物首先应有符合目标受众审美的整体吸引力：协调自然的五官、鲜活的眼神、柔和舒展的表情、匀净有生气的肤色、得体的轻妆。发型经过日常打理，有适当层次和光泽；服饰时尚、合身、适合场景，保留真实面料质感与动作褶皱。采用可信的手机或相机拍摄方式，让人物与环境处于一致的光线中。皮肤保留适量自然细节，不磨成蜡像，也不刻意强化瑕疵。姿态、手部、重心、接触阴影和物体互动符合真实人体与空间逻辑。避免身份漂移、畸形五官或手指、假发贴图、塑料服装、漂浮身体和过度锐化。

使用时把年龄、具体发型、妆容、衣着、机位和场景写成角色专属锚点；不要把上面的可选形容词机械地全部堆入一次生成。若已有经用户认可的人物图，以该图锁定身份；仅把其他照片当作经授权的审美、造型或摄影参考，不擅自复刻真人面孔。

## 造型与场景一致性

- 同一角色先固定脸、年龄观感、发色、发型轮廓、妆容强度、服装和配饰。多视图与视频镜头沿用这些锚点；换装或换发型应记录为有意版本，不让模型无声漂移。
- 穿搭根据情境调整。车内主驾可穿适合坐姿和安全带经过肩胸的日常服装；参考图中的露肩、吊带、裙装只是风格选项，不自动成为驾驶镜头的服装要求。不能让服装遮挡或改写产品、安全带等关键关系。
- 场景图仍须遵守相应品类的产品和空间规则。青年女性的审美要求不覆盖实际 SKU、正确安装或安全约束。

## 多视图身份资产

先让用户确认一张身份主图的年龄观感、脸部审美、发型和穿搭，再扩展左右斜侧、必要的 90° 侧面及场景视图；不要在主图不满意时批量生成。每张沿用同一身份与造型，用鼻尖所指的画面方向核对左右视图确实相反。场景图不能仅因人物好看就直接作为正式产品首帧。

## Lighting and optics

- Choose lighting to flatter the intended character and match the actual scene. Window side light, soft outdoor light, practical cabin light, partial light or direct flash are options, not mandatory realism markers.
- Mild grain, exposure variation, chromatic aberration, edge fringing, motion blur or light leak only when justified; never let them spoil facial appeal, product identity or legibility.
- Keep light direction and color coherent on face, hair, clothing, product and environment. For UGC, favor believable distance and framing over rigid studio symmetry, without making the person look neglected.

## Quality review

First ask whether the person meets the selected age, style and aesthetic brief; then inspect identity continuity, face/eyes, hairline, skin rendering, hands, anatomy, balance, fabric, contact shadows and scene geometry. Reject obvious AI artifacts and unattractive drift caused by prompt overconstraint. Do not reject a believable attractive person merely for lacking freckles, visible pores or lens defects. Check product identity and physical interactions separately against the category profile.
