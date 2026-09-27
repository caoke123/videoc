# H3 Ref2VA 参考图接线与五镜头连续性（v3）

工作流：`h3.ref.cloud`，标准版；每个镜头各生成一段 4 秒、9:16 的无对白驾驶画面，剪辑时各取 3.6 秒。只保留轻微车内环境声，不生成司机对白或旁白；最终旁白在剪辑阶段完整加入。v3 将输出调整为 1 MP，以增加护肩纹理的画面像素；实际输入标签已逐节点核实。

DFCine 实际接线：五段的 `<Picture 1>` 均为 `assets/source/pink-product-front-2048.png`，是用户指定的 2048×2048 商品真值，拥有玩偶、黑色护肩套的材质、纹理、颜色、比例与缝接关系优先级。各段的 `<Picture 2>` 为当前已通过的造型图；S02–S05 的 `<Picture 3>` 统一接 `assets/approved/driver-character-master.png`，锁定同一女主面孔、车厢、机位及佩戴位置。图像只作参考，不当作 0.00 秒强制首帧。

| 镜头 | `<Picture 2>` 当前造型 | `<Picture 3>` 统一基准 | 提示词 |
|---|---|---|---|
| S01 | `assets/approved/driver-character-master.png` | 无，基准已在 Picture 2 | `H3-S01-v3.txt` |
| S02 | `assets/generated/01-yellow-floral.png` | `assets/approved/driver-character-master.png` | `H3-S02-v3.txt` |
| S03 | `assets/generated/02-blue-white.png` | `assets/approved/driver-character-master.png` | `H3-S03-v3.txt` |
| S04 | `assets/generated/03-white-blue-floral.png` | `assets/approved/driver-character-master.png` | `H3-S04-v3.txt` |
| S05 | `assets/generated/04-red-polka.png` | `assets/approved/driver-character-master.png` | `H3-S05-v3.txt` |

连续性定义：五个不同工作日走同一条有树影的城市通勤路；同一司机、同一辆左舵车、同一副驾侧固定中景机位和相近晨光。女主面孔、头部画面位置、方向盘和商品在画面中的位置及大小统一；每段开头与结尾让双手、视线、方向盘角度和身体姿态匹配，服装变化成为硬切时唯一显著跳变。S02、S04 只在镜头中段短暂看镜头，其余时间专心驾驶。

产品锁定：2K 商品图显示护肩布面为哑光黑色，带不规则交织的凸起细小环状纱线与卷曲脊纹，并非规整重复花纹；上下端有黑色缝制包边。粉色玩偶的短绒、墨镜、橙果绿叶、蓝围巾、红白格纹、四肢、缝接结构与商品图一致。安全带从护套中心上下连续通过，玩偶与黑色套体始终作为一个整体。文字、旁白和配乐只在后期加入。

用户已拒收 v1 全部镜头；v2 的前四段经人工查验也不通过，原因是镜头间缺乏联系、商品纹理仍失真。v3 的首段先做测试并复核；其余四段在新基准下生成后仍须逐段人工查验。
