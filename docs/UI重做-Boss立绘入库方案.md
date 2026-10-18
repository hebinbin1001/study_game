# Boss 立绘入库方案（2026-10-17 · 8 款新图已到货）

> 本文是**交接文档**：图已核验、已压好、**代码已接入**（见 §八实施记录），
> 唯一剩下的是**部署**——`art/skins/` 里的 8 个文件还没上 CDN（curl 仍 404），
> 所以本地预览看到的是 emoji 兜底，部署后才是真图。
> 另外：本机装不上 Pillow（pip 无网络），所以官方 `e2e/compress-assets.py` 跑不了，
> 已用纯 Node 的替代工具完成压缩，见 §二。

## 一、交付核验（已完成，有数据）

8 个文件均在 `E:\Code\小程序\study_game\assets-src\skins\`，规格全部达标：

| 文件名 | 中文名 | 镇守学段 | 尺寸 | 通道 | 四角 alpha | 全透明像素 | 原图大小 |
|---|---|---|---|---|---|---|---|
| `boss_mallow_king.png` | 棉花糖大魔王 | 幼儿园 | 512×512 | RGBA | 0/0/0/0 | 62.2% | 186KB |
| `boss_block_overlord.png` | 积木魔王 | 一年级 | 512×512 | RGBA | 0/0/0/0 | 61.9% | 220KB |
| `boss_candy_witch.png` | 糖果女巫 | 二年级 | 512×512 | RGBA | 0/0/0/0 | 61.5% | 249KB |
| `boss_puppet_mage.png` | 木偶戏法师 | 三年级 | 512×512 | RGBA | 0/0/0/0 | 67.0% | 217KB |
| `boss_sand_pharaoh.png` | 沙尘法老 | 五年级 | 512×512 | RGBA | 0/0/0/0 | 50.1% | 357KB |
| `boss_storm_eagle.png` | 雷霆巨鹰 | 初二 | 512×512 | RGBA | 0/0/0/0 | 39.5% | 341KB |
| `boss_void_weaver.png` | 虚空织梦者 | 高二 | 512×512 | RGBA | 0/0/0/0 | 69.9% | 181KB |
| `boss_dark_sage.png` | 暗蚀大贤者 | 大学（终极） | 512×512 | RGBA | 0/0/0/0 | 51.6% | 298KB |

核验方式：解析 PNG IHDR（512×512、8bit、colorType 6）+ 解压 IDAT 后逐像素统计 alpha
（四角全 0、半透明边缘约 2.7~3.3%）。**是真透明底，没有白底/棋盘格**。

## 二、已经做完的处理

1. **压缩入库到 CDN 目录**：`art/skins/boss_*.png`，320×320，94~190KB/张。
   - 为什么压：首页 Boss 卡只显示 110rpx（约 55px），不压的话每张 200~350KB 全是浪费。
   - 为什么是 320：与现有 6 款 Boss（约 460px）同一量级，3x 屏下 55px 显示仍有 5 倍余量。
2. **新增工具 `tools/art/resize-png.js`**（纯 Node，无依赖）：
   ```bash
   node tools/art/resize-png.js "E:/Code/小程序/study_game/assets-src/skins" art/skins 320 boss_
   ```
   解码 PNG → 预乘 alpha 双线性缩放 → 重编码。以后美术批次到货、又没有 Pillow 时都能用。
3. **既有 6 款 Boss 已 `git checkout` 还原**，没有被这次批量处理覆盖。

> 顺带提醒：`e2e/compress-assets.py` 仍是官方管线，凡是有 Pillow 的机器优先用它
> （它会把图量化到调色板，体积更小）；这次的 Node 工具是「无 Pillow 时的降级方案」，
> 输出为 RGBA，体积比调色板版大一些。

## 三、还没做的（照抄即可）

### 3.1 前端渲染表 `miniprogram/utils/skins.js`

**① `SKIN_RENDER` 里加 8 行**（放在现有 `boss_magma_titan` 之后）：

```js
  // —— 2026-10-17 新增：Boss 立绘 8 款（幼儿园→大学，与 utils/boss-ladder.js 的学段映射一一对应）——
  boss_mallow_king:    { emoji: '🍬', color: '#FFB3D1', image: '/assets/skins/boss_mallow_king.png' },
  boss_block_overlord: { emoji: '🧱', color: '#FFCF3D', image: '/assets/skins/boss_block_overlord.png' },
  boss_candy_witch:    { emoji: '🍭', color: '#C98AF2', image: '/assets/skins/boss_candy_witch.png' },
  boss_puppet_mage:    { emoji: '🎭', color: '#C08A5A', image: '/assets/skins/boss_puppet_mage.png' },
  boss_sand_pharaoh:   { emoji: '🏺', color: '#E8C56B', image: '/assets/skins/boss_sand_pharaoh.png' },
  boss_storm_eagle:    { emoji: '🦅', color: '#5A9BF2', image: '/assets/skins/boss_storm_eagle.png' },
  boss_void_weaver:    { emoji: '🌌', color: '#8A6BF2', image: '/assets/skins/boss_void_weaver.png' },
  boss_dark_sage:      { emoji: '📕', color: '#4A4A6E', image: '/assets/skins/boss_dark_sage.png' },
```

**② `LOCAL_SKINS` 里加 8 行**（放在现有 6 款 boss 之后；`unlockValue` 见 §四）：

```js
  { avatarId: 'boss_mallow_king',    name: '棉花糖大魔王', type: 'monster', rarity: 'common', unlockType: 'stars', unlockValue: 60,  emoji: '🍬', color: '#FFB3D1', image: '/assets/skins/boss_mallow_king.png' },
  { avatarId: 'boss_block_overlord', name: '积木魔王',     type: 'monster', rarity: 'rare',   unlockType: 'stars', unlockValue: 100, emoji: '🧱', color: '#FFCF3D', image: '/assets/skins/boss_block_overlord.png' },
  { avatarId: 'boss_candy_witch',    name: '糖果女巫',     type: 'monster', rarity: 'rare',   unlockType: 'stars', unlockValue: 140, emoji: '🍭', color: '#C98AF2', image: '/assets/skins/boss_candy_witch.png' },
  { avatarId: 'boss_puppet_mage',    name: '木偶戏法师',   type: 'monster', rarity: 'epic',   unlockType: 'stars', unlockValue: 220, emoji: '🎭', color: '#C08A5A', image: '/assets/skins/boss_puppet_mage.png' },
  { avatarId: 'boss_sand_pharaoh',   name: '沙尘法老',     type: 'monster', rarity: 'epic',   unlockType: 'rank',  unlockValue: 4,   emoji: '🏺', color: '#E8C56B', image: '/assets/skins/boss_sand_pharaoh.png' },
  { avatarId: 'boss_storm_eagle',    name: '雷霆巨鹰',     type: 'monster', rarity: 'epic',   unlockType: 'rank',  unlockValue: 6,   emoji: '🦅', color: '#5A9BF2', image: '/assets/skins/boss_storm_eagle.png' },
  { avatarId: 'boss_void_weaver',    name: '虚空织梦者',   type: 'monster', rarity: 'legend', unlockType: 'rank',  unlockValue: 8,   emoji: '🌌', color: '#8A6BF2', image: '/assets/skins/boss_void_weaver.png' },
  { avatarId: 'boss_dark_sage',      name: '暗蚀大贤者',   type: 'monster', rarity: 'legend', unlockType: 'rank',  unlockValue: 9,   emoji: '📕', color: '#4A4A6E', image: '/assets/skins/boss_dark_sage.png' },
```

> 注意：两张表的 `avatarId` 必须一一对应、`image` 必须一致（`tests/unit/skins.test.js` 会逐条比对）；
> `image` 写 `/assets/...` 即可，`skins.js` 底部的 `toCdnPath()` 会自动转成 CDN 地址。

### 3.2 后端 `server/seeders/avatar-seed.js`

同一个位置加 8 条（字段比前端少 emoji/color，多 `icon`）：

```js
  // ===== 2026-10-17 新增：Boss 立绘 8 款（幼儿园→大学）=====
  { avatarId: "boss_mallow_king",    name: "棉花糖大魔王", type: "monster", rarity: "common", icon: "/assets/skins/boss_mallow_king.png",    unlockType: "stars", unlockValue: 60 },
  { avatarId: "boss_block_overlord", name: "积木魔王",     type: "monster", rarity: "rare",   icon: "/assets/skins/boss_block_overlord.png", unlockType: "stars", unlockValue: 100 },
  { avatarId: "boss_candy_witch",    name: "糖果女巫",     type: "monster", rarity: "rare",   icon: "/assets/skins/boss_candy_witch.png",    unlockType: "stars", unlockValue: 140 },
  { avatarId: "boss_puppet_mage",    name: "木偶戏法师",   type: "monster", rarity: "epic",   icon: "/assets/skins/boss_puppet_mage.png",    unlockType: "stars", unlockValue: 220 },
  { avatarId: "boss_sand_pharaoh",   name: "沙尘法老",     type: "monster", rarity: "epic",   icon: "/assets/skins/boss_sand_pharaoh.png",   unlockType: "rank",  unlockValue: 4 },
  { avatarId: "boss_storm_eagle",    name: "雷霆巨鹰",     type: "monster", rarity: "epic",   icon: "/assets/skins/boss_storm_eagle.png",    unlockType: "rank",  unlockValue: 6 },
  { avatarId: "boss_void_weaver",    name: "虚空织梦者",   type: "monster", rarity: "legend", icon: "/assets/skins/boss_void_weaver.png",    unlockType: "rank",  unlockValue: 8 },
  { avatarId: "boss_dark_sage",      name: "暗蚀大贤者",   type: "monster", rarity: "legend", icon: "/assets/skins/boss_dark_sage.png",      unlockType: "rank",  unlockValue: 9 },
```

**不需要写 DDL**：`server/db.js` 启动时会调 `seedAvatars()`，它是幂等 upsert（只写 `avatars` 表行），
新增条目在下次容器启动/部署时自动入库；`/api/avatar/ensure` 里还有一次兜底。

### 3.3 对局页按学段取 Boss（当前没接，重点）

现状：`miniprogram/pages/game/game.js:181`

```js
monster: skins.getMonsterSkin(storage.getBossSkin())
```

即**Boss 关画的是玩家自己装备的怪兽皮肤**，不是该学段的镇守 Boss —— 和首页预告卡会对不上。
建议改成（`grade` 与 `isBoss` 在文件上部已有上下文）：

```js
var bossLadder = require('../../utils/boss-ladder');
var gradeKey = (this._challengeCtx && this._challengeCtx.grade) || grade;
var bossSkin = (isBossLevel)
  ? skins.getMonsterSkin(bossLadder.bossOf(gradeKey).id)
  : skins.getMonsterSkin(storage.getBossSkin());

this._skins = { warrior: skins.getWarriorSkin(storage.getWarriorSkin()), monster: bossSkin };
```

> 变量名以实际上下文为准；关键是「Boss 关用 boss-ladder 的 id，普通关仍用玩家装备」。
> 这样 `utils/boss-ladder.js` 里已经写好的 14 学段映射（含 `hasArt` 兜底）就真正生效了。

### 3.4 首页与关卡页：无需额外改

- 首页 Boss 预告卡读 `bossLadder.bossOf(grade)` → `skins.getSkinImage()`，注册后自动出图；
- 关卡页第 30 关行读同一映射，同样自动生效。

## 四、解锁阈值建议（需要你拍板）

现有 6 款的节奏是：早期用星星（120/180/300），后期用段位（5/7/8）。
下面这套是照这个节奏排的，让每一档都有「下一只」可追：

| Boss | 稀有度 | 建议解锁 | 理由 |
|---|---|---|---|
| 棉花糖大魔王 | common | 60⭐ | 幼儿园期就能摸到，作为第一只收集目标 |
| 积木魔王 | rare | 100⭐ | 一年级 |
| 糖果女巫 | rare | 140⭐ | 与现有「鹰羽弓手 140⭐」同档 |
| 木偶戏法师 | epic | 220⭐ | 三年级，介于 180 与 300 之间 |
| 沙尘法老 | epic | 铂金（rank 4） | 五年级，开始转段位线 |
| 雷霆巨鹰 | epic | 钻石（rank 6） | 初二 |
| 虚空织梦者 | legend | 荣耀王者（rank 8） | 高二 |
| 暗蚀大贤者 | legend | 学神（rank 9） | 大学终极 Boss，最高段位 |

如果希望「Boss 只作为关卡敌人、不允许玩家装备」，那就**只加 `SKIN_RENDER`、不加 `LOCAL_SKINS`**
（渲染表用于取图，皮肤清单才决定能不能装备/进图鉴）——这两种做法要选一个，见 §六。

## 五、接入后的验收清单

```bash
# 1. 静态 + 单测（皮肤两张表一致性、CDN 路径、尺寸上限都在这）
node e2e/run-all.js --module=user --no-e2e     # skins / avatar-unlock / rank 相关
node e2e/check-assets.js                       # art/skins 图片尺寸与包体红线

# 2. 页面回归
node e2e/run-all.js --module=pages --no-e2e

# 3. 截图确认（重点看三处）
node e2e/shot-pages.js --only=index,level      # 首页 Boss 预告卡 + 关卡页第 30 关
node e2e/shot-pages.js --only=game             # Boss 关立绘（需带 grade 参数进第 30 关）
```

预期：
- 首页 Boss 卡按当前学段显示对应立绘；
- 关卡页第 30 关行左侧出现该学段 Boss 立绘（暗紫卡）；
- 皮肤图鉴里 8 只新 Boss 可见，未达阈值显示锁定条件。

## 六、风险与回滚

1. **体积**：新 8 张 320px RGBA 共约 1.1MB（CDN，不进包，不影响 200KB 红线）。
   若嫌大，在有 Pillow 的机器上跑 `python e2e/compress-assets.py`（会量化到 128 色，通常小 3~5 倍），
   或把本文 §二 的命令改成 `... 256 boss_` 重跑。
2. **装备 vs 敌人**：若不想让玩家装备 Boss，别加 `LOCAL_SKINS`，只加 `SKIN_RENDER` + 后端 seed
   （图鉴里就不会出现这 8 只）。
3. **回滚**：删除 `art/skins/` 下这 8 个文件 + 撤销 `skins.js` / `avatar-seed.js` 的 8 条即可；
   数据库里多出的 8 条 avatars 记录不影响功能（前端不引用就不会显示）。

## 七、当前状态一句话

图：已核验、已压缩入库（`art/skins/`）；工具：已补（`tools/art/resize-png.js`）；
代码：**已接入**（`skins.js` / `avatar-seed.js` / `game.js` 三处，见 §八）；
**待部署**：`art/skins/` 的 8 个文件上 CDN 后才会显示真图。

---

## 八、实施记录（2026-10-17 已完成接入）

### 8.1 实际改了什么

| 文件 | 改动 |
|---|---|
| `miniprogram/utils/skins.js` | `SKIN_RENDER` +8 条；`LOCAL_SKINS` +8 条（monster，含 emoji/color/rarity/解锁条件） |
| `server/seeders/avatar-seed.js` | +8 条，字段与前端逐项对齐（`icon` 代替 `image`） |
| `miniprogram/pages/game/game.js` | Boss 关改用 `bossLadder.bossOf(ctx.grade)` 的 id 取图；普通关仍用玩家装备的怪兽 |
| `tests/unit/skins.test.js` | 怪兽套数断言 10 → 18（前后端两处） |
| `e2e/shot-pages.js` | 新增 `game-boss` 截图目标（`grade=kg&level=30`），方便复查 Boss 立绘 |
| `tools/art/resize-png.js` | 新增 `--trim`：裁掉四周透明边（留 6% 安全边）再缩放 |

### 8.2 解锁阈值（按 §四 的建议值落地）

60/100/140/220⭐ + 铂金 4 / 钻石 6 / 荣耀王者 8 / 学神 9。
要调整只改两张表同一条的 `unlockValue`，单测会拦住「前后端不一致」。

### 8.3 验证结果

- `node tests/unit/skins.test.js` → 16/16 PASS（两张表一致、18 套怪兽、图片文件存在）
- `node tests/unit/skins-cdn.test.js` → PASS（CDN 目录备齐全部立绘，尺寸 ≤512）
- `node e2e/check-assets.js` → 包体 1.60MB / 图片总量 0.02MB，全部在阈值内
- `node e2e/run-all.js --module=user,pages --no-e2e` → 6/6 PASS
- 截图：Boss 关（kg 第 30 关）已走「学段 Boss」分支，当前显示 🍬 兜底（CDN 未部署）

### 8.4 部署注意

`art/` 由云托管以 `/assets/**` 静态托管，**push 到 main 即自动部署**（用户 2026-09-13 确认的机制）。
部署前后可以用这条命令判断图到底上没上：

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  https://express-g0hk-309012-5-1304586666.sh.run.tcloudbase.com/assets/skins/boss_mallow_king.png
# 404 = 还没部署；200 = 已生效
```

数据库不用手动迁移：`seedAvatars()` 在容器启动时幂等 upsert，新增的 8 条会自动进 `avatars` 表。
