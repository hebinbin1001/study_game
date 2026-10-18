# 玩法页界面统一（2026-10-17 · 第一批）

> 目标：16 个玩法页此前各自长一套皮，最明显的是「原生导航栏 + 页内返回/标题」双头部，
> 以及 fixed 悬浮的战士徽章压住题目卡。本批先把**外壳**统一，玩法本身（棋盘/题面）不动。

## 一、审计到的问题（截图取证）

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| 1 | **双头部**：原生导航栏已有「返回 + 页面名」，页内又画一遍 | match/link/snake/math24/sudoku/g2048/klotski/bounce/quiz 的 `g-head` / `k-head` / `bn-head` | 白吃约 90px 首屏，且出现两个返回键 |
| 2 | **战士徽章 fixed 悬浮**，`top:110rpx` 固定定位，必压后续卡片 | 13 个玩法页 `<warrior-badge fixed>`；snake 截图里正压目标词卡右上角 | 内容被遮、看着像没对齐 |
| 3 | **底色三套并存** | `#8fd0ff→#eaf8ff`（9 页）/ `#5aa9e6`（word-build）/ 各玩法主题色（idiom 橙、sprint 橙红、balance 青、memory 深蓝、klotski 深紫、one-stroke 青） | 页面之间跳变，与首页天空底不连戏 |
| 4 | **底部重复「返回」** | math-sprint / memory-grid / one-stroke / word-build / math-balance / idiom-build | 与原生返回重复，挤占操作区 |
| 5 | **长单词断字** | 消消乐/连连看 4 列格子，`blackboard` 折成 `blackboar d` | 可读性差 |
| 6 | **数独锁标压住关卡号** | `.lv-lock { position:absolute }` 没写 top/right，退回文档流位置 | 3/4/5… 全被 🔒 盖住 |

## 二、本批改动

### 1. 删掉页内重复头部（9 页）
- `match / link / snake / math24 / sudoku / g2048 / klotski / bounce / quiz`
- 保留原生导航栏的返回与标题；有功能的胶囊不丢：
  - link 的「换局」并进 HUD 行；
  - quiz 的倒计时/得分行直接成为顶部；
  - math24/g2048/klotski 的「关卡列表」在页面底部本来就有。

### 2. 战士徽章并入 HUD（13 页）
- `game-hud` 组件新增徽章位：胶囊居中、徽章贴 HUD 行右端（`position:absolute; right:0; top:50%`）。
- 使用 `game-hud` 的 7 页（match/word-build/idiom-build/math-sprint/math-balance/memory-grid/sudoku）自动获得。
- 自定义 HUD 的 4 页（link/snake/math24/one-stroke）在 `.hud` 行内加 `<warrior-badge size="sm" />`。
- g2048（4 格 HUD）与 quiz（计时条）结构特殊，本批不塞徽章，避免挤压。

### 3. 天空背景统一（9 页）
`game / match / link / snake / quiz / math24 / sudoku / g2048 / bounce` 改用与首页同一套：
`linear-gradient(180deg, #4a9fe8 0%, #7dbdf2 32%, #b9e0ff 64%, #d8efff 100%)`。
`app.json` 原生导航栏底色同步从 `#5aa9e6` 改为 `#4a9fe8`，与页面顶部无缝。

### 4. 底部重复「返回」清理（6 页）
- 整行占位的（math-sprint / memory-grid / one-stroke / word-build）连容器一起删；
- 与次要操作并排的（math-balance 的「重开」、idiom-build 的「提示首字」）只删返回，保留主操作。
- **结算弹窗里的「返回」保留**（bounce/snake 的「再来一局 / 返回」），那是弹窗内动作，不是导航。

### 5. 细节修复
- 消消乐/连连看：`lab.length >= 8` 的格子加 `long` 类，字号 26→20rpx，单行显示。
- 数独：锁标移到右上角，不再压住关卡号。
- `game.json` 标题从「闯关」改为「字母射击」（与其它玩法页同名规则一致）。

## 三、未做（下一批）

1. **主题色玩法页**（idiom 橙 / klotski 深紫 / memory 深蓝 / sprint 橙红 / balance 与 one-stroke 青）
   是否统一到天空底：保留各自气质 vs 全站一致，需要你拍板。
2. **game（字母射击）HUD** 仍是自绘的 `gs-hud`（X / 金币 / 火 / 题号 / 生命 / 音量 / 暂停），
   与 game-hud 组件的胶囊风格不一致，下一批可合并。
3. **结算页/结算弹窗**统一（result 与 settle-pop 两套）。
4. 各页中部留白（消消乐、24 点、拼词）——棋盘受宽度限制，纵向留白属正常，若要在视觉上填满，
   需要加装饰或底部进度，属设计取舍，未擅自加。

## 四、校验

- `node e2e/run-all.js --module=pages --no-e2e` → 5/5 PASS。
- `tests/unit/index-entries.test.js` 增至 13 条：新增
  「玩法页不再有页内返回/标题」「战士徽章不再 fixed 悬浮」两条护栏。
- 截图：`e2e/reports/shots/play1~play5-*.png`（临时产物，gitignore）。
