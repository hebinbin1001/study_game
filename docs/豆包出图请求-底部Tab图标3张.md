# 出图请求 · 底部 Tab 图标 3 张（2026-10-18）

## 这一轮只做一件事

为「词力战士」小程序画 **3 张底部 Tab 图标**：首页、学习、我的。
「玩法」Tab 直接复用同目录已有的游戏手柄图，不用重画。

要生成的文件（绝对路径）：

    E:\Code\小程序\study_game\assets-src\ui-icons\tabs\tab_home.png
    E:\Code\小程序\study_game\assets-src\ui-icons\tabs\tab_study.png
    E:\Code\小程序\study_game\assets-src\ui-icons\tabs\tab_me.png

**除此之外不要动、不要重新导出、不要改动任何已有文件**（尤其不要碰 `miniprogram\` 和 `art\` 两个目录）。

## 先看参考（只读，不要修改）

    E:\Code\小程序\study_game\art\ui-icons\tabs\sec_line.png
    E:\Code\小程序\study_game\art\ui-icons\tabs\cat_all.png
    E:\Code\小程序\study_game\art\ui-icons\tabs\sec_casual.png

这批要和它们**同一套风格**：卡通拟物、圆润厚实、厚白描边、小面积高光、主色饱满。
最终显示只有约 24px，所以主体必须简单、粗壮、剪影清楚。

## 3 张分别画什么

| 文件名 | 画面主体（不要文字/字母/数字） | 主色 |
|---|---|---|
| `tab_home.png` | 一座圆润的小房子，屋顶右侧一颗小星星（代表首页） | `#4285F4` |
| `tab_study.png` | 一本摊开的书，书页中间一颗小星星/书签（代表学习） | `#22C55E` |
| `tab_me.png` | 一个可爱的 Q 版战士头像（圆脸、蓝色短发、披风领口，不要画身体），代表「我的」 | `#8B5CF6` |

## 硬性约束

- **512×512、PNG 真透明底**（alpha 通道；不要棋盘格模拟底、不要白底、不要地面阴影）；
- **图上不要任何文字 / 数字 / 字母 / 水印**；
- **不留任何外框、卡片边框、底板、圆形背景、渐变背景**；
- 每个图标外围一圈约 8~12px 的白色描边（512 尺寸下），保证放在白色 Tab 栏上也清楚；
- 主体居中，四周留 8% 安全边距；
- 不要细线、不要复杂纹理（缩小到 24px 会糊）。

## 交付规格

- 3 张分别独立导出，不要拼成一张集合图；
- 文件名与上表**完全一致**；
- 保存到：`E:\Code\小程序\study_game\assets-src\ui-icons\tabs\`。

## 做完回报什么

只回报每个文件的**路径 + 尺寸 + 是否真透明底**，不需要做其它任何事。
