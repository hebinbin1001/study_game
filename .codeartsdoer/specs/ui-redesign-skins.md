# 词力战士 · UI 重设计 + 皮肤系统规划

> 状态：规划（待实施）
> 目标：全 13 页专业卡通可爱风重设计；新增「战士皮肤」与「boss 皮肤」两套皮肤系统（emoji 占位）；改造后必须用微信开发者工具自动化实测。

---

## 一、目标与边界

### 目标
1. 全 13 页视觉升级：统一「原创卡通可爱风」（圆润、大圆角、鲜艳低饱和配色、柔和阴影），覆盖各年龄段。
2. 新增皮肤系统：战士（炮台）皮肤 + boss（怪兽）皮肤，emoji 占位 + 名称 + 解锁条件。
3. 全量实测：单测全绿 + 微信开发者工具自动化逐页验证不崩溃。

### 边界（禁止触碰，除非本次明确说明）
- 词库数据 `data/*.js`、`server/**`（除确需新增皮肤相关接口外）、`utils/validator.js`、`utils/question.js`、`utils/request.js`、`utils/parser.js`、`utils/ebbinghaus.js`、`utils/rank.js`、`utils/sensitive.js`、`utils/dict.js`、`game/engine.js`（玩法逻辑）、`game/state.js`、`game/audio.js`。
- 已上线数据契约、接口路径、`API_BASE_URL` 不变。

---

## 二、设计系统（Design System）

### 2.1 配色（在现有暖色天空基础上精修）
| 变量 | 现值 | 建议值 | 用途 |
| --- | --- | --- | --- |
| --sky1 | #7ec8ff | 保持 | 天空蓝 |
| --sky2 | #d8efff | 保持 | 浅蓝 |
| --pink | #ff5d8f | #ff6b9d | 卡通粉（微调更柔） |
| --orange | #ffb703 | #ffc24d | 主按钮橙（更柔） |
| --blue | #4cc9f0 | 保持 | 次按钮蓝 |
| --green | #7bd389 | #7fd8a0 | 卡通绿 |
| --purple | #b388ff | #b79bff | 卡通紫 |
| --ink | #3a3a5c | #3b3b5f | 主文字 |

新增辅助 token：`--bg-soft`（卡片底 #ffffff）、`--text-sub`（次要文字 #8a9bb5）、`--danger`（#ff5a5a）、`--gold`（#ffd166，星星/成就用）。

### 2.2 排版
- 标题：48rpx / 900，letter-spacing 8rpx（保留）。
- 正文：28rpx；次要 24rpx；强调 32rpx。
- 统一 `font-family: "PingFang SC","Microsoft YaHei",system-ui,sans-serif`。

### 2.3 形状与阴影
- 大圆角卡片：40rpx；按钮 44rpx；标签/徽章 24rpx。
- 阴影：底部硬阴影（`box-shadow: 0 8rpx 0 rgba(0,0,0,.10), 0 16rpx 32rpx rgba(0,0,0,.10)`）+ 按下位移（`:active` translateY(4rpx)），营造卡通「按压感」。

### 2.4 组件规范（app.wxss 统一提供，页面复用）
- `.btn` / `.btn-primary` / `.btn-secondary` + 配色变体（保留并微调）。
- `.card` / `.card--soft`。
- `.tag` / `.badge`（皮肤稀有度、成就、签到天数用）。
- `.emoji-avatar`（大 emoji 头像容器，皮肤展示用）。
- `.empty-state`（空态占位，统一风格）。
- `.progress-bar`（进度条，通用）。

---

## 三、皮肤系统设计

### 3.1 数据模型
新增 `miniprogram/utils/skins.js`（纯数据 + 纯函数，可单测）：

```js
// 每条皮肤：{ id, name, emoji, color, unlock: { type, value }, desc }
// unlock.type ∈ { 'default' | 'passLevels' | 'totalStars' | 'maxCombo' | 'checkinDays' }
```

**战士皮肤（战士 = 炮台/player）**
| id | name | emoji | color | unlock |
| --- | --- | --- | --- | --- |
| classic | 经典战士 | 🔫 | #4cc9f0 | default |
| cat | 猫咪战士 | 🐱 | #ff6b9d | passLevels: 1 |
| dino | 恐龙战士 | 🦖 | #7fd8a0 | passLevels: 3 |
| rocket | 火箭战士 | 🚀 | #ffc24d | maxCombo: 5 |
| unicorn | 独角兽 | 🦄 | #b79bff | totalStars: 15 |
| robot | 机器人 | 🤖 | #8a9bb5 | checkinDays: 3 |
| dragon | 神龙战士 | 🐲 | #ff5a5a | totalStars: 30 |

**boss 皮肤（boss = 怪兽/题目卡片）**
| id | name | emoji | color | unlock |
| --- | --- | --- | --- | --- |
| classic | 经典怪兽 | 👾 | #ff8fae | default |
| slime | 史莱姆 | 🟢 | #7fd8a0 | passLevels: 1 |
| ghost | 幽灵 | 👻 | #b79bff | passLevels: 3 |
| alien | 外星人 | 👽 | #7ec4ff | totalStars: 10 |
| devil | 小恶魔 | 😈 | #ff5a5a | maxCombo: 8 |
| octopus | 章鱼怪 | 🐙 | #ffc24d | totalStars: 20 |
| robot | 机械兽 | 🤖 | #8a9bb5 | checkinDays: 7 |

（emoji 为占位素材，后续可替换正式美术图；id 与 color 保证 Canvas 可回退绘制。）

### 3.2 存储
- `constants.js` 新增 `STORAGE_KEYS`：
  - `warriorSkin: 'ww_warrior_skin'`（当前选择）
  - `bossSkin: 'ww_boss_skin'`（当前选择）
  - `unlockedSkins: 'ww_unlocked_skins'`（已解锁 id 列表）
- `storage.js` 新增：`getWarriorSkin/setWarriorSkin`、`getBossSkin/setBossSkin`、`getUnlockedSkins/unlockSkin`、`isSkinUnlocked(skinId)`。

### 3.3 解锁判定（纯函数，可单测）
`skins.js` 提供 `checkUnlock(skin, stats)`，`stats` = `{ passLevels, totalStars, maxCombo, checkinDays }`；`default` 恒 true。每局结束 / 签到 / 过关时调用 `unlockSkin` 解锁并记录。

### 3.4 渲染集成
- `renderer.js` 的 `drawCannon(ctx)`：读取当前战士皮肤，用 `ctx.fillText(emoji, ...)` 绘制皮肤角色（替代固定炮管/炮口），保留炮口方向提示；`ctx` 无 emoji 渲染能力时回退 `color` 色块 + 原炮台。
- `renderer.js` 的 `drawMonster(ctx, state, now)`：卡片 `m.color` 改为当前 boss 皮肤 `color`；头顶角 + 眼睛区叠加皮肤 emoji 徽章；词级/逐字题目渲染逻辑不变（题目仍显示在卡片上）。
- 皮肤 id → emoji/color 由 `skins.js` 提供 `getWarriorSkin(id)` / `getBossSkin(id)`，未匹配回退 `classic`。

### 3.5 皮肤选择 UI
- 扩展 `pages/avatar/avatar` 或新增 `pages/skin/skin`（推荐新增，与「头像/昵称」解耦）：
  - 顶部两个 tab：战士皮肤 / boss 皮肤。
  - 每个皮肤卡片：大 emoji + 名称 + 稀有度/解锁条件；未解锁置灰 + 条件文案。
  - 点击已解锁皮肤即保存并高亮「使用中」。
- 入口：首页 + avatar 页各加一个「皮肤」入口。

---

## 四、13 页重设计清单

| 页面 | 现状 | 重设计要点 |
| --- | --- | --- |
| index 首页 | 标题+开始按钮 | 加入 emoji 主角吉祥物、皮肤入口、数据概览 |
| level 关卡 | 学段+关卡网格 | 卡片化关卡、星级展示、进度 |
| game 游戏 | Canvas | 皮肤渲染 + HUD 配色统一 |
| result 结算 | 星级/得分 | 卡片化、皮肤解锁提示、连击数据 |
| nickname 昵称 | 输入 | 卡通输入卡 |
| avatar 头像 | 头像选择 | 统一皮肤入口 + 头像卡片 |
| rank 排行 | 榜单 | 卡片化榜单、空态优化 |
| wrong-book 错题本 | 列表 | 标签/卡片化、进度条 |
| wrong-review 错题复习 | 答题 | 统一配色、进度 |
| level-editor 关卡编辑 | 表单 | 修复非法 WXML、卡片化表单 |
| level-share 分享导入 | 表单 | 统一卡片化 |
| checkin 签到 | 签到 | 日历卡片化、连续天数徽章 |
| achievement 成就 | 列表 | 勋章卡片化、进度 |

---

## 五、实施顺序

1. **基础层**：`app.wxss` 设计系统升级 + `skins.js` + `constants.js`/`storage.js` 皮肤存储 + 单测。
2. **渲染层**：`renderer.js` 战士/boss 皮肤渲染（含回退）+ 单测。
3. **皮肤 UI**：新增 `pages/skin` 页 + 注册 + 入口。
4. **页面重设计**：index → level → result → avatar → rank → wrong-book → wrong-review → checkin → achievement → nickname → level-editor → level-share（每页改造后即验证）。
5. **验证**：`node miniprogram/utils/__tests__/run-all.js` 全绿 + `node e2e/verify-m2m4.js` 全页 PASS。

## 六、验证标准
- 单测退出码 0。
- e2e 逐页：`reLaunch` 成功、`currentPage().path` 匹配、关键元素可选中。
- 皮肤切换后 `renderer` 回退/emoji 绘制不抛错（单测覆盖）。