# 分镜场景图统一合同 v3

- 人物身份与服饰：`male-lead-look-v2.png`、`female-lead-look-v2.png`，均已人工通过。
- 产品身份：`product-front-white-background.png`；安装和比例：`installed-passenger-reference.png`。
- 车辆：中国左舵轿车，主驾车身左、副驾车身右。
- 每张图必须明确 `camera_origin`、`camera_facing`、`software_mirror=no` 与画面左右映射。
- 未限定的第三人称均指人物前方朝车尾的第三人称正面。
- 主驾第三人称正面：左门/左B柱/左肩在画面右，中控/右髋锁扣在画面左，肩带右上至左下。
- 副驾第三人称正面：右门/右B柱/右肩在画面左，中控/左髋锁扣在画面右，肩带左上至右下。
- 只生成已经安装的产品状态，不展示安装、调整、拉扯或移除。
- 每张生成图先进行车辆空间、安全带拓扑、锁扣、产品身份、人体和车内穿帮自检，再交人工审核。
