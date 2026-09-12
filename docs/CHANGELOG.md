# 变更日志（CHANGELOG）

> 记录项目迭代过程中的关键修复与功能进展，便于回顾与追溯。
> 关联文档：`README.md`、`.codeartsdoer/specs/`、`docs/需求对齐-6合1.md`、`docs/规划-UI对齐与落地草案.md`。

---

## 2026-09-12（大批收尾：皮肤上线 · 2048 挑战模式 · 老玩法页视觉统一 · 死代码清理）

### 需求⑤ 皮肤：24 套战士皮肤真图上线

- `utils/skins.js` 成为「avatarId → 图片 + emoji + 主色」唯一映射：新增 15 套美术 id，
  旧 id（`warrior_01~04`、`milestone_30~365`）**原样保留并指向对应的新美术图**（已拥有皮肤的玩家不丢皮肤）；
  图片优先、emoji 兜底（缺图不空白）。
- 头像页卡片改为图片优先（`<image>` + `binderror` 回退 emoji）；对局里用 `canvas.createImage()` 预加载战士真图，
  `drawCannon` 有图就画图（96px 展示区、脚底贴底座，比原来的 56px emoji 更精致），加载完成主动补一帧。
- 后端：`seeders/avatar-seed.js` 补 15 套新皮肤（共 24 战士 + 4 怪兽）；生产环境也会跑一次目录同步。
- 测试：`skins.test.js` 扩到 15 用例 / 607 断言 —— 包含两条硬护栏：
  **① 每张图必须在包内真实存在**（防「写了路径没进包」真机白块）；**② 前后端皮肤目录与解锁条件必须一一对齐**。

### 线上踩坑与修复（皮肤上架为什么没生效）

现象：代码上架 24 套、线上仍只有 8 条，且容器日志本地看不到。
排查路径：给 `/api/health` 加「皮肤目录自检」→ 一眼看到真实报错
`Data truncated for column 'unlockType'` → 生产库 `avatars.unlockType` 是**早期 ENUM，缺 `milestone`**。

- 修复 1：`seedAvatars` 改为**逐行容错**（失败记录 id 与原因、继续插其余行）——原来一处抛错整批中断。
- 修复 2：`ensureAvatarRoster` 幂等自愈（进程内缓存成功结果、失败不缓存以便重试），列表接口与健康检查都会触发。
- 修复 3：健康检查回报 `{ avatars, roster:{ok,total,created,failed} }`，以后这类问题本地一句话就能确认。
- 结果：线上 `avatars` **8 → 23 条**（战士 19 套），只剩 5 套里程碑皮肤等一条 DDL（见交接单「待执行线上 DDL」）。

### 2048 挑战模式（用户认可「保留打到 2048 的成就感」）

- 选关页新增「🏆 挑战模式」入口：目标 2048、**不限步数**（只有无路可走才失败）、
  **只记最少步数**、不写星级存档（关卡体系仍到 512），回选关页显示最佳步数。
- 新增端到端 `verify-g2048.js`（20 条断言）：入口渲染 → 进入挑战（目标 2048 / 步数上限 999999）→ 滑动计步且不判负 →
  通关只记最佳步数、`ww_stars` 里没有 `g2048_*` → 再通一次用更多步时最佳值不被改差。

### 需求⑥ 老玩法页视觉统一（头部 + HUD）

- `app.wxss` 抽出共享外壳：`.g-head/.g-title/.g-chip`（顶栏）与 `.hud/.hud-chip`（胶囊型 HUD）。
- 数独 / 2048 / 24 点 / 连连看 / 贪吃蛇 / 消消乐 六个页面统一改用共享类，并**删掉各自重复的定义**
  （此前六个页面各写一份，字号/内边距/圆角差 1~2rpx，看起来像不同游戏）。

### 待办 F 死代码清理

- 删除 `utils/rank.js`（旧「按胜场算段位」）与其单测、`server/seeders/rank-seed.js`，
  `db.js` 不再 seed `ranks`（段位自 2026-09 起由 `server/rank-ladder.js` 按星星现算；表结构保留、数据不动）。

---

## 2026-09-12（字母射击：把战士放大）

> 用户反馈：「现在的字母射击战士太小了吧」。

- **实测原因**：战士是画在 canvas 上的 emoji，字号只有 **30px**（画布逻辑尺寸 390×500，占高约 6%），
  而它对面的怪兽卡片是 **250×118** —— 视觉分量完全不成比例，皮肤再好看也看不清。
- **调整**（`game/renderer.js`）：
  - 战士字号 30 → **56px**（约占画布高的 11%）；底座 60×18 → **104×22**，并加了硬阴影层；
  - 战士「脚底」精确踩在底座顶面（站位由纯函数 `warriorLayout()` 统一算，不再散在绘制代码里）；
  - 新增**皮肤主色脚底光圈**（用 `state.warriorSkin.color`），让「当前用哪套皮肤」一眼可辨；
  - 新增**待机呼吸**（±2.5px 正弦浮动，约 1.6s 一个来回），站姿不再像贴纸。
  - 兼容性：光圈用「缩放 + arc」画椭圆，避开 `ctx.ellipse` 在部分老版本小程序 canvas 上的可用性风险。
- **护栏**：新增 `renderer-warrior.test.js`（4 用例 / 57 断言）守三件事 ——
  ① 尺寸下限（字号 ≥48px 且 ≥画布高 9%、底座宽 ≥ 怪兽宽 35%）；② 站位（脚踩底座、不越出画布）；
  ③ 呼吸幅度 ≤4px 且连续（防被改成"抖动"）。以后谁再把它改小，流水线会红。

> 后续（已记入待办）：等**战士皮肤图**接入后，对局里会直接画真图（比 emoji 更大更精致），
> 到时候这套尺寸参数会作为「图片展示区」的基准（见需求⑤ 皮肤扩充）。

验证：`node e2e/run-all.js` 全量 14/14 通过。

---

## 2026-09-12（新玩法「华容道」上线 —— 数字智力 · A 类固定关卡 30 关）

> 用户：「把这个华容道玩法也按我们现在数字游戏的玩法放进去吧，主题风格按我们的来」→ 参考实现 `../huarongdao`（单文件网页，30 关全部穷举校验过）。
> 规划见 `docs/华容道玩法规划-待确认.md`；用户「按你的建议来」后已落地。

- **引擎** `game/klotski.js`（纯逻辑可单测）：5×4 标准 10 子、滑动到尽头、**一次连续滑动算 1 步**、
  曹操到下方 2×2 出口判胜、局面打包（10×5bit 整数）、BFS 求最优解、走法回放、星级折算（≤1.15→3★、≤1.5→2★、否则 1★）。
  走法用「棋子左上角格位 + 方向 + 格数」标识 —— 因为局面打包会按格位重排同类棋子，用「棋子下标」回放会串位（实现中踩到并修掉）。
- **关卡库** `data/klotski-levels.js`（30 关，构建产物）+ 生成器 `e2e/gen-klotski-levels.js`：
  从参考实现读关卡，**用我们自己的引擎重算最优解并交叉校验**（标注步数 = 求解步数、解路径独立回放可通关、棋形合法、局面唯一、难度不回落），
  同时产出每关最优解供「演示」使用；实测 30 关全部通过，单关最慢 106ms。
- **页面** `pages/klotski/`：选关（5 档 30 关，锁/星）+ HUD（步数/最少步/关卡）+ 深色棋盘 + 暖色棋子（曹操红金 / 竖将蓝紫 / 横将青蓝 / 兵绿）
  + 操作区（提示 / 撤销 / 重来 / 演示）+ 方向键兜底 + 通关结算（复用 `settle-pop`）。**零图片素材**，包体几乎无增量。
  - 拖拽为主：`touchstart/move/end` 判主轴与位移量 → 滑到该方向尽头（一次滑动记 1 步）；棋盘尺寸按需测量，首次拖拽也不会丢。
  - 提示：从**当前局面**现算最优下一步（支持走偏后再问）；演示：按最优解自动走完，**但不计星、不写进度**。
- **接入**：`app.json` 注册页面；玩法 tab 新增「🧩 华容道」（智力分组，13 → 14 款）；`structure-check` 同步断言。
- **测试**：`klotski.test.js`（14 用例/66 断言，含「同型棋子互换后局面 key 相同」的编码不变量）、
  `klotski-levels.test.js`（7 用例/663 断言，全量回放 + 抽样 BFS 复算）、`verify-klotski.js`（39 条端到端断言）。

**顺带修掉**：通关时把 `playing` 置 false 会让挂在同一分支里的结算弹层被卸载（现在通关保持 playing=true）；
星级比较加浮点容差（免得「恰好 1.15 倍」因误差掉档）。

---

## 2026-09-12（修 UI：按钮里的文字贴顶）

> 用户反馈：「发现一个 UI 界面按钮里面的字展示问题，很多都靠上」。

**根因（两件事叠加）**

1. 小程序原生 `<button>` 自带 `line-height: 2.55555556`（≈46px），比多数按钮的 height 还高；
2. `app.wxss` 里那条重置写的是 `button.btn { line-height: inherit }` —— 父容器没设行高时它会退化成 `normal`。

于是**凡是「设了 height 但没写 line-height」的按钮**就会文字贴顶，涉及各页的
`.btn-back`（checkin / wrong-review / avatar）、`.btn-use` / `.btn-unlock`（avatar）、
`.check-pill`（achievement）、`.btn-save` / `.btn-submit`（level-editor）、`.btn-copy` / `.btn-import` / `.btn-start`（level-share）等。

**修复**

- `app.wxss` 增加全局按钮重置：`button { display:flex; align-items:center; justify-content:center; line-height:1.2; }`
  —— 不论按钮多高、字号多大，文字都在正中；页面里已经写了 `line-height = height` 的按钮不受影响（两者等效）。
- 去掉 `button.btn` 的 `line-height: inherit`；`::after` 边框一次性全局去掉（原来每个页面各写一遍）。

**回归护栏**（`e2e/check-wxss.js` 新增两项，属于静态阶段）

1. 任何 `button` 规则里出现 `line-height: inherit|normal` → 直接失败（已用旧写法验证过「会被拦下」）；
2. `app.wxss` 必须保留全局按钮居中规则（缺 `display:flex` 或 `align-items:center` 即失败）。

另用脚本全量扫过一遍「圆角 + 居中文字 + 固定高度但没垂直居中」的规则：修复后**0 处**。

> 说明：本机的模拟器截图接口会挂（多次尝试都超时），所以这次没能附上前后对比图；
> 请你在开发者工具里过一眼确认观感（重点看：各页返回按钮、头像页的「使用/解锁」、成就页「检查」、关卡编辑器底部两个按钮）。

验证：`node e2e/run-all.js` 全量 13/13 通过（409.3s）。

---

## 2026-09-12（素材方案①落地：展示尺寸压缩 + 原图移出包，整包 32.5MB → 1.47MB）

> 用户拍板选方案①：端上只留展示尺寸，原图移出包不参与打包。

- 新增 `e2e/compress-assets.py`：把 `assets-src/` 的原图批量压成端上展示尺寸（可反复重跑）。
  - 成就图标 38 张 → 128px / 96 色调色板 PNG（~2-3KB/张）
  - 段位小级徽章 72 张 → 128px / 96 色调色板（文件名保持 `rank-<段>-<级>-256.png`，端上代码不用改）
  - 战士皮肤 24 张 → 256px / 128 色调色板（供后续接入对局立绘）
  - 实测：**原图 28.3MB → 端上 580.8KB**，透明通道保留（角像素 alpha=0 已抽查）
- 原图移入仓库根 `assets-src/`（**不参与打包，已加入 .gitignore**）。
- `miniprogram/project.config.json` 的 `packOptions.ignore` 增加 `utils/__tests__` 与 `assets-src`
  —— 单测目录本来也被打进包（~150KB 纯浪费），现在排除。
- `e2e/check-assets.js` 升级并**转为阻断**：
  - 按**整包体积**判定（代码+模板+样式+词库+图片）≤ 1.8MB（微信主包 2MB 硬限，留 0.2MB 余量）；
  - 单张图片 ≤ 60KB；超限直接让流水线红。
  - 与 `packOptions.ignore` 对齐，跳过 `utils/__tests__` 与 `assets-src`。
- 结果：整包从 **32.5MB → 1.47MB**（其中图片 0.61MB），回到主包限制内。

---

## 2026-09-12（素材到货：成就清单对齐 + 72 级段位徽章接入 + 包体护栏）

> 用户交付了第二批美术：成就图标 38 张、段位小级徽章 72 级（各含 -256 版）、战士皮肤 24 套。

### 成就清单按到货图标反向对齐（36 条）

- 到货图标是按**早前草稿清单**出的，与定稿的成就 id 有出入 → 现在以**已交付的文件名为准**反向对齐定义
  （id 只是取图用的键，玩家看到的名称/描述由我们决定）。
- 顺带修掉两个自己埋的问题：
  1. **combo 类死成就**：原来写了「单局连击 15」，但一局只有 10 题、单局连击上限就是 10 —— 永远解不开。
     改成 `combo_10`（单局 10 连）+ `combo_20`/`combo_master`（**累计连击** 20/50，可达且分档合理）；
  2. 新增 `maxScore`（单局满分）、`perfectLevels`（三星关卡去重）、`perfectStreak`（连续全对）三个指标，
     支撑 `boss_slayer`「单局满分 100」、`grade_all_3star`「30 个关卡三星」、`no_mistake_run`「连续 3 局全对」。
- 单测新增/加强：指标必须被使用且都存在、满级样本必须全部可解锁、阈值阶梯不重复不倒挂
  （`achievements.test.js` 18 用例 / 404 断言）。

### 72 级段位徽章接入

- `server/rank-ladder.js`：`rankOf()` 的 `icon` 改为按**小级**拼路径 `/assets/ranks/rank-<段key>-<级>-256.png`
  （原来只有 8 张大段位图，中间小级看不到差别 —— 这正是「爬到中间级没收益」的观感来源）；
  同时返回 `iconBig`（大段位图）作为兜底。
- 「我的」页：徽章图加载失败时自动回退大段位图（`onRankIconError`），72 张里缺某张也不会裂图。
- 单测：72 级图路径全不重复、级号 1~9、兜底路径存在（`rank-ladder.test.js` 10 用例 / 816 断言）。

### ⚠️ 包体红线（需要你决策，见 `docs/美术素材需求与豆包提示词.md` 开头的「先读」）

- 实测 `miniprogram/` 图片共 **222 张 / 31.4 MB**，而**微信主包上限 2MB** —— 现在这份包上传会失败。
- 新增 `e2e/check-assets.js` 把包体做成红绿灯（单张 > 60KB、总量 > 1.5MB 即报问题），
  已接进 `run-all.js`；**素材方案落地前跑在 `--warn-only`（不阻断）**，方案定了再去掉该参数恢复阻断。
- 建议：端上只留展示尺寸（图标 ≤128px、皮肤 ≤256px），原图移入 `miniprogram/assets-src/`（不参与打包）。

---

## 2026-09-12（需求④ 成就扩充：6 → 37 条 + 分类筛选 + 进度）

> 用户原始需求：「成就主页可以在丰富一些，多搞一些成就」。

### 关键决策：成就定义进代码，不动数据库

- 原实现把定义写进 `achievements` 表，且 `conditionType` 是 **MySQL ENUM（只有 5 个取值）**——
  每加一类条件都要改生产库表结构，扩到 30+ 会反复 DDL。
- 现按段位（`server/rank-ladder.js`）同一思路：**新增 `server/achievements.js` 作为唯一口径**，
  定义 + 判定 + 进度全是纯函数（可单测）；用户解锁记录仍落 `user_achievements`
  （openid + achievementId + createdAt），**本次改动零表结构变更、零生产 DDL**。

### 服务端

- `server/achievements.js`：7 个分类（答题/关卡/玩法/习惯/错题/段位/自定义）× 共 **37 条**成就；
  15 个可判定指标（累计答对、最高连击、单局全对、连续三星、通关数、三星数、累计星、对局数、
  连续/累计签到、错题总数、已掌握数、复习过的错题数、段位、自定义关卡数）。
- `GET /api/achievement/list`：顺手做一次判定并落库（幂等），返回**数组**（与改造前同形状，
  老客户端不受影响），每条额外带 `category / current / threshold / progress / unlockedAt`。
- `POST /api/achievement/check`：只返回本次新解锁的成就（幂等，`findOrCreate`），
  并给出 `totalUnlocked / total`。
- 新增 `GET /api/achievement/categories`（分类元数据，前端也可自行由列表归组）。

### 小程序端

- 新增 `miniprogram/utils/achievement-view.js`（纯逻辑）：卡片装饰（进度文案/解锁日期/emoji 兜底）、
  由数据推导分类 tab（后端加分类前端自动出现）、分类筛选、分组行、汇总。
- 成就页：分类 chips（全部/已解锁/7 个分类，带 x/y 角标）+ 每条成就的**进度条**与「已达成/当前/目标」
  文案 + 解锁日期；「全部」视图按分类插分组标题；新增「只看已解锁」筛选。
- 图标策略：`<image src="/assets/achievements/<id>.png">` 失败时自动回退分类 emoji
  （图标由美术产出，未到位不裂图，可分批交付）；检查解锁换成弹窗展示新成就名。

### 测试

- `miniprogram/utils/__tests__/achievements.test.js`（17 用例 / 407 断言）：
  规模与结构、分类齐全、**无死成就护栏**（每个 metric 都要实现且被使用；满级样本必须全部可解锁；
  空样本一条都不许白送）、阈值阶梯不重复不倒挂、statsFrom 各口径边界、evaluate 阈值边界与进度封顶、
  列表保持数组形状且已解锁时间不被覆盖、段位类阈值落在合法段位区间。
- `miniprogram/utils/__tests__/achievement-view.test.js`（11 用例 / 47 断言）：
  进度文案与日期格式化、分类推导（含未知分类追加）、筛选、分组标题只插一次、汇总不除零。
- `e2e/smoke-api.js` 新增**成就契约链路**（对真实部署跑）：列表 ≥30 条且新字段齐备、
  分类 ≥6 个、unlocked 必带 unlockedAt、进度不越界、check 幂等。

---

## 2026-09-12（需求② 错题本优化：分页 + 复习答对后可删除/保留）

> 用户原始需求：「错题本的展示可以优化下，比如分页展示，错题再次做完正确就可以删除，也可以选择继续保留错题」。

### 服务端

- 新增 `server/wrong-book.js`（纯逻辑，不依赖 Sequelize/express，可单测）：
  艾宾浩斯算法（与前端 `utils/ebbinghaus.js` 同一实现）、分页参数校验、scope 切分、分页切片、返回体组装。
- `GET /api/wrong/list` 支持 **`scope` + `page` + `pageSize`**：
  - **不传任何参数 → 完全保持改造前的返回形状** `{ pending, mastered, total }`（老客户端不受影响）；
  - 传参 → `{ items, page, pageSize, total, hasMore, scope, counts:{total,pending,mastered} }`
    （`total` 是该 scope 的总数，`counts` 供统计卡与 tab 角标）；
  - 参数非法（page<1、pageSize 不在 1~100、scope 非枚举）→ `4000` 参数错误，**不悄悄纠正**；
  - 越界页返回空 `items` + 正确 `total`，让端上自行纠正页码。
- 新增 `POST /api/wrong/remove`（删除错题，**幂等**）：校验记录属于当前 openid；记录不存在也返回 `code=0, removed=0`；
  删除成功返回 `removed=1`。已掌握但选择「保留」的题目也能用它清掉（否则错题本永远清不干净）。
- 路由里的算法与分页逻辑改为调用 `server/wrong-book.js`，删除 `routes/wrong.js` 里重复的 `calculateNextReview`。

### 小程序端

- 新增 `miniprogram/utils/wrong-book-view.js`（列表页纯逻辑）：请求地址拼装、展示字段装饰、
  分组行生成（相同到期文案只插一个标题）、分页合并、老协议兼容、移除后的计数调整。
- `pages/wrong-book`：改为**服务端分页**（每页 20 条，「加载更多」取下一页并追加），
  待复习/已掌握两个 tab 各自分页；顶部统计与 tab 角标用服务端 `counts`；
  每条错题新增「移除」入口（二次确认，走幂等删除接口）；
  兼容老服务端（拿到旧的 `{pending,mastered,total}` 形状时自动退回全量渲染）。
- `pages/wrong-review`：**答对后弹出选择**「移出错题本 / 先保留」——
  移出则调用删除接口并把该项从本局列表剔除；保留则继续按艾宾浩斯间隔复习（熟练度已提升）。
  答错仍是看 1.5 秒正确答案后自动进入下一题。
  ⚠️ 剔除当前项时下标要回退一格，否则会跳过下一题（已修 + 用例盯住）。

### 测试

- `miniprogram/utils/__tests__/wrong-book.test.js`（15 用例 / 102 断言）：分页参数边界、
  切片与越界、scope 99/100 边界、新旧返回形状、**前后端艾宾浩斯算法一致性**。
- `miniprogram/utils/__tests__/wrong-book-view.test.js`（11 用例 / 58 断言）：分页追加不重复分组标题、
  reset 替换而非拼接、老协议兼容、移除后计数不为负。
- `e2e/smoke-api.js` 新增 **错题本完整链路**（对真实部署跑）：新增 → 分页列表（含结构校验）→
  复习上报 → `page=0` 应 4000 → 删除 `removed=1` → 重复删除 `removed=0` → 老协议里已不存在。

> 说明：小程序模拟器是游客态（没有 openid），UI 层拿不到真实错题数据，
> 且 `miniprogram-automator` 不支持 mock `wx.cloud.callContainer`（已实测报 `not exists`），
> 因此错题本的端到端放在冒烟脚本里对着真实部署跑；页面渲染由 `verify-m2m4` 覆盖。

---

## 2026-09-12（挑战主线 P1 落地：题库类玩法纳入「继续挑战」）

> 用户拍板「按你建议的来」→ 见 `docs/挑战关卡规划-待确认.md` 第 3/4 节。

### 新增

- `miniprogram/utils/rng.js`：可复现随机源（FNV-1a 种子 + mulberry32）。同一 `grade+level` 永远得到同一串随机数，
  跨 Node/小程序一致 —— 这是「同一关每次题面一样」与「E2E 能用 Node 独立复算期望值」的地基。
- `miniprogram/utils/challenge.js`：挑战主线关卡表（每学段 30 关，一关 = 玩法 + 本学段题库 + 参数）、
  玩法元数据、按学段实例化参数、种子、按种子取题、星级折算（答对率 90/70/60、剩余命 3/2/1）、
  星级可达性自检、老存档迁移。
- `e2e/verify-challenge.js`：挑战主线端到端（48 条断言），已注册为 `run-all.js` 的 `challenge` 阶段。
- `miniprogram/utils/__tests__/challenge.test.js`：19 条用例 / 368 条断言。

### 改

- 首页「继续挑战」：从「字母射击的 10 关」升级为**挑战主线** —— 卡片显示「玩法 · 学段 · 第 N/30 关」，
  点击按该关玩法跳对应页面（`challenge=1` + 关卡种子）；推导仍走 `storage.findContinueLevel`（新增可选 `levelCount` 参数）。
- 关卡页：默认视图改为「挑战主线」30 关（每行带玩法标签与参数，第 1 关固定字母射击做新手关）；
  原题型分类保留为**自由练**（10 关，存档键不变）；顶部第一个芯片显示「挑战主线」。
- 字母射击：挑战模式按种子预取固定题目（走「固定题源」通路），并在结算页写挑战星级；
  `game/question.js` 新增 `setRandom()`，让挖空位置与选项顺序也随种子固定（离开对局页复位，避免泄漏到自由练）。
- 字母拼词 / 词语连连看：新增挑战模式（按学段参数与种子开局、结算写挑战星级 + 同步段位）。
  连连看「换局」= 题不变、牌面重排（避免无解牌面把玩家卡死）。
- 老存档迁移：旧的字母射击 10 关星级一次性搬到主线的对应字母射击关（幂等，写入标记位）。

### 顺带修掉一个同类老缺陷

字母拼词原本 **3 命 + 90/70/40**：8 题局通关最低正确率 75% → **1 星档数学上不可达**（与 R1 修掉的星级死区同类），
且「命耗尽判负」也会按答对率发星。现统一为 **5 命 + 90/70/60，且只有答完全部题目才计星**；
`challenge.test.js` 增加星级可达性护栏，P2 扩玩法时不允许再引入死区。

### 有意未做（避免半成品）

- **终关 Boss 参数**：加题量/减命数会破坏星级可达性（如 15 题 5 命 → 最低正确率 73%，1 星档不可达），
  需与阈值重算一起做，留 P2；
- **消消乐 / 成语拼字 / 单词贪吃蛇进主线**：需先支持「按关卡参数开局 + 固定种子」；
  在支持前不写进模板（单测有断言拦截，防止玩家点进半成品关卡卡住）。

验证：`node e2e/run-all.js` 全量 12 阶段通过（含 challenge 48/48、贪吃蛇 52/52、24 点 29/29、连连看 26/26）。

---

## 2026-09-12（贪吃蛇改为相对转向 + 两份待确认文档）

### 贪吃蛇：点方向改为「相对转向」（用户拍板：以蛇头为中心线，点左右 = 转 90°）

- `pages/snake/snake.js` 的 `onCellTap` 重写：把「蛇头 → 被点格子」的向量投影到**蛇头朝向轴**上，
  用 `atan2(cross, dot)` 得到点击相对朝向的夹角，再判定：
  - 前方 ±45° 内 → 直行（不改朝向）
  - 前/后 ±45°~135° → 朝**被点的那一侧拐 90°**（新朝向 = 点的那一侧；左拐 `(d+3)%4`、右拐 `(d+1)%4`）
  - 正后方 ±135° 以外 → 不掉头（保持朝向，避免一步撞上自己的身体）
  - 点蛇头自己 → 忽略
- 与旧版「主轴绝对方向」的差别：点击只看**方向**不看**距离**（点远处和点相邻格一个样），
  语义从「指哪走哪」变成「转向操控」；连点同一侧两次仍可掉头（与改造前一致）。
- 文案同步：网格提示与页脚提示改成「点蛇头轴线哪一侧，就朝那一侧拐 90°」。

### E2E 同步（`e2e/verify-snake.js`，50 → 52 条断言）

- 转向助手改成相对转向语义：`tapStep(stepDir)`（点蛇头朝 stepDir 的相邻格 = 拐 90°）、
  `tapDir(targetDir)`（按差值拆成 1~2 次点击，`delta=2` 用连点同侧两次掉头）；
  `resetAndFreeze` 不再依赖可能残留/为空的 `data.dir`，改用「startGame 后内部朝向恒为右 → 点正下方一格」确定性归位。
- 新增断言：点正前方直行、点轴线两侧各拐 90°、点远处正前方仍直行（只看方向不看距离）、
  点正后方不掉头、斜着点前侧仍按侧向判定、点蛇头自己忽略、连点可把朝向转回目标方向。

### 新增两份待确认文档（本轮交付物）

- `docs/美术素材需求与豆包提示词.md`：段位徽章 72 枚 / 战士皮肤 24 套 / 成就图标 32 张的
  **交付规格（尺寸·格式·命名·目录）**＋**可直接复制给豆包的四段提示词**＋色板与主题清单。
  备注：现有 6 个成就的图标文件本来就是缺的（后端给路径、前端目前用 emoji），这批一并做掉。
- `docs/挑战关卡规划-待确认.md`：把「继续挑战」从「字母射击 10 关」升级为
  **每学段 30 关的主线关卡带（一关 = 玩法 + 学段题库 + 参数）**，含关卡表样例、按年级生成规则、
  每关固定题面（种子）、星级折算表、存档与解锁迁移、三期落地顺序，以及 5 条待用户拍板的问题。

验证：`node e2e/run-all.js` 全量 **11/11 通过**（325s），含贪吃蛇 52/52。

---

## 2026-09-12（贪吃蛇操控收敛：去掉滑动转向，只留「点方向」）

> 用户反馈：滑动没啥用就去掉（上一轮同时保留了点击与滑动两套操控）。

- **移除滑动转向**：删掉 `onTouchStart/onTouchEnd` 与 wxml 上的 `bindtouchstart/bindtouchend`，网格只保留 `catchtap="onCellTap"`。
  - 理由：有了「点蛇头上/下/左/右哪一侧就往哪边走」之后，滑动既多余又容易误触（点一下不小心划到就转向）。
  - 文案同步：网格上方提示改为「点蛇头四周的格子转向」，页脚去掉「也可滑动」。
  - 样式类 `.swipe-hint` 顺带改名 `.tap-hint`，避免名字与行为不符。
- **E2E 用例同步重写**（`e2e/verify-snake.js`，33 条 → 50 条断言）：
  - 删除全部 touchstart/touchend 注入，转向改走真实 `onCellTap`。
  - 新增点方向断言 6 条：点正右方 → 右；点正后方（180° 反向）被拒绝；竖向更远取竖向；横向更远取横向；点蛇头自己忽略；点出来的朝向能真实驱动移动。
  - 新增**穿墙回归** 5 条：清空蛇头向右的跑道后连走 7 步，断言蛇头从同排最左侧穿出（53 → 50）、**不扣命**、不结算、且能继续沿原朝向前进。

验证：`node e2e/run-all.js --no-e2e` 全绿；`node e2e/run-all.js` 全量 **11/11 通过**（含贪吃蛇 50/50、24 点 29/29、连连看 26/26、18 页 + 8 页渲染回归），总耗时 297s。

---

## 2026-09-10（总体规划落地 B1–B6 + 登录/合规/玩法成熟化 + 回归）

> 本轮把拍板后的「8+ 款玩法合集」规划分批全部落地真实小程序（详见 `docs/规划-UI对齐与落地草案.md`）。
> 全部代码已推送 `origin/main`；`docs/*` 按约定仅本地更新不入 git。

### B1 · 4 Tab 架构 + O1 全机型自适应（commit 4fa2074）
- app.json 加 tabBar（🏠首页 / 🎮玩法 / 📊学习 / 👤我的），4 组纯色占位 PNG 图标（`e2e/gen-tab-icons.js` 生成）。
- 首页去「功能宫格」→ demo 大厅：Hero / 游客引导条 / 资产条 / 排行榜行 / 今日目标 / 每日一题 / 继续挑战 / 推荐玩法。
- 新增玩法 tab（8 款合集 + 分类筛选）、学习 tab（周概览+报告+错题+每日一题·签到+签到日历+自定义题库）。
- me 页对齐 demo（资料卡两态/游客说明卡/统计/菜单/危险区，注销/退出改 switchTab）。
- O1：对局 Canvas `flex:1` 占剩余高 + `scale=min(宽比,高比)` 居中缩放（先 translate 后 scale）；关卡地图行距/节点按可用高动态收缩。

### B2 · 每日一题 = 签到（双轨）（2e66b0a）
- 后端：`milestone_claims` 表 + avatars 支持 `unlockType='milestone'` + 5 里程碑皮肤种子（30/60/100/250/365 天）；`routes/daily.js`（status/answer 幂等：答对→轨道A签到送星 + 轨道B皮肤发放）。
- 前端：每日一题页（看词选义，每人随机 1 题，本地词库）；移除 result 任意闯关自动打卡；checkin 页改**只读签到日历**；avatar 里程碑皮肤禁手动解锁。

### B3 · 排行榜双榜真实（97d4bdb）
- scores 加 `game_type`/`type_key`；`/api/ranklist/progress` 玩法进度榜（按玩法/学段/题型聚合 MAX 进度）；rank 页重做 demo 双榜 UI（⭐总榜·星星 / 🎮按玩法·进度，学段+题型筛选 + 我的名次）。

### B4 · 自定义题库 10 个一组 + 打通游玩 + 公开广场（8d81810）
- `/api/level/submit` 服务端强校验 totalQ===10；`/api/level/public` approved 全量列表；game 消费 `customLevel`（断链修复，固定 items 出题）；result 自定义关不写系统星级/不入字词榜；custom-levels 中心页（我的题库/公开广场/新建/输码导入）。

### B6 · demo 8 款玩法全覆盖（83ccd5c / e183686 / b17c8d3 / bcbf0ab / 0994415 / 2107e54 / 344e311）
- 新增独立玩法页：数独（20 关 4×4→9×9）、词义消消乐、2048（7 关目标递增）、算24点、词语连连看、单词贪吃蛇、单词弹弹球；引擎模块 `game/{sudoku,tw2048,math24,link}.js`。玩法 tab 逐一点亮「已解锁」。

### B5 · 公共对局外壳抽取（31f1868）
- 组件 `components/game-hud`（生命/分数/附加）、`components/settle-pop`（结算弹层+插槽+retry 事件）；数独/消消乐试点迁移。

### 登录 / 合规 / 体验收尾（06e47e8 / 8f9e59a / 0b76732 / 2d7fb00 / 02bdc3d 等）
- O2 登录规范化：**首次=游客主页不弹协议**；点「登录/注册」才先弹《用户协议》，同意后 wx.login 建档；拒绝保持游客（`auth.ensureAgreement`、app.js 移除 onLaunch 自动登录）。
- 完整《用户协议与隐私政策》文本页 `pages/agreement`（首页/我的可进）。
- 游客有本地成绩 → 温和提醒一次「登录同步」。
- 修复登录无反应/卡死：登录 Promise 卡死（_loginPromise 悬挂）改 `_loggingIn` 防重入 + wx.login 5s 超时；loading 后置防遮弹窗；nudge 弹窗顶掉协议弹窗（modal 互顶 → agreed=false）已修（点击登录先取消 nudge + busy 标志 + 延时 900ms + onHide 清理）。
- 首页「游客引导条」加 `wx:if !loggedIn`——登录后不再残留游客条（4b loggedIn=true 仍见游客的根因）。

### 玩法成熟化重做（699dabf / 355679d）
- 单词贪吃蛇 → 成熟玩法（对齐《单词贪吃蛇》）：给目标词+释义，蛇按顺序吃到字母拼完该词过关换词；触屏滑动控制（去方向键）。
- 算 24 点 → 成熟交互（对齐经典）：点数字牌+运算符/括号构造带括号算式，`＝校验24`；引擎新增 `evaluateExpr`（递归下降、精确分数）；四张牌各用一次校验。
- 单词弹弹球：无成熟先例，玩法页下线为占位（代码保留）。

### 回归工具（4edc712）
- `e2e/syntax-check-all.js`（全量 JS 语法）、`e2e/structure-check.js`（app.json/组件/tabBar/玩法一致性/登录链痕迹 50+ 断言）。本次全绿：npm test、check-wxss 29/29、103 js 0 失败、结构 50+ 全过。

### 生产环境需人工执行（部署注意）
- 新增表 `milestone_claims`；`scores` 加列 `game_type`、`type_key`；`avatars` 插 5 条里程碑皮肤（非生产 sync({alter:true}) 自动完成，生产需手动 SQL/seed）。
- O1 机型矩阵（320×568→430×932）逐机型人工验收待真机执行。

---

## 2026-09-06

### 修复：小程序 UI 布局溢出与底部安全区适配

**现象**：游戏画面最下方内容超出界面、选项按钮被推出屏幕；全面屏底部内容被 Home 指示条遮挡。

**根因**：
1. 游戏页 Canvas 使用固定 `px`（`390px × 500px`），不随屏宽缩放，小屏机型超宽超高；
2. 游戏页 `disableScroll: true`，内容超出后无法滚动，底部按钮不可见；
3. 渲染坐标系（390×500）与画布 CSS 尺寸未做等比缩放，画面会拉伸/留白；
4. 各页面缺少底部安全区（`env(safe-area-inset-bottom)`）适配。

**改动**（commit `34e2344`）：
- `miniprogram/pages/game/game.wxss`：Canvas 改为响应式（`width: 100%; height: 900rpx`，保持 390:500 比例）；页面底部加安全区 padding。
- `miniprogram/pages/game/game.json`：移除 `disableScroll`，内容超屏时可滚动兜底。
- `miniprogram/pages/game/game.js`：`onReady` 增加 `ctx.scale(dpr * scale)` 等比缩放，让 390×500 渲染坐标系精确填充响应式画布。
- `miniprogram/app.wxss`：`page` 全局加底部安全区 padding。
- `miniprogram/pages/level/level.wxss`、`miniprogram/pages/index/index.wxss`：页面底部加安全区 padding。

### 修复：`x-wx-source` 前后端取值不一致导致的接口批量 1003 拒绝

**现象**：控制台反复出现「未取得 openid，请求不携带 x-wx-openid 头」warning，用户维度接口（成绩/昵称/形象/排行/错题/签到/成就）被后端拒绝。

**根因**：
1. 前端 `request.js` 的 `SOURCE_HEADER = 'miniprogram'`，与后端 `middlewares/openid.js` 可信白名单（默认 `weixin,wechat`）不一致，所有非健康检查请求被后端以 `code=1003「不受信任的请求来源」`拒绝；
2. 「无 openid」在云托管方案下属正常降级（openid 由微信网关自动注入），却被当成 warning 反复打印。

**改动**（commit `40f475b`，文件 `miniprogram/utils/request.js`）：
- `SOURCE_HEADER` 由 `miniprogram` → `weixin`，对齐后端白名单。
- 仅在「已取得 openid」时才附带 `x-wx-source` + `x-wx-openid`；无 openid 时不带身份头，走后端「匿名放行」路径（业务返回 `code=1001` 由前端本地降级），而非被 `1003` 拒绝。
- 移除 openid 误报 warning 及 `_warnedNoOpenid` 防刷屏变量。

> 备注：若后端仍返回 `code=1001`（未识别用户），需检查云托管控制台是否开启「微信登录 / openid 注入」能力，属部署侧配置。

---

## 2026-09-06（同日 · M5 微信登录注册 + 游客限制）

规划与设计文档：`.codeartsdoer/specs/m5-login-guest/`（spec.md / design.md / tasks.md）
已确认决策：标准登录（wx.login + code2session + token）；手机号仅预留字段/接口；范围 P1~P4（P4 部分完成）。

### P1 登录闭环
- 后端：`models/user.js` 扩展 `token/phone`；新增 `routes/login.js`（code → code2session → findOrCreate → 签发 token，含 `dev_` 测试码降级）；`middlewares/openid.js` 支持 `Authorization: Bearer <token>`（优先于 x-wx-openid）；`routes/user.js` 新增 `/me` `/profile` `/logout`；`constants.js` 新增 4010/4011。
- 前端：新增 `utils/auth.js`（静默登录/登录态判定/登出/promptLogin）；`utils/storage.js` + `constants.js` 增 token/user 缓存；`utils/request.js` 自动附带 Bearer token；`app.js` onLaunch 静默登录（失败降级游客）。
- 配置：云托管需注入 `WX_APPID / WX_SECRET`（缺省时仅 `dev_` 测试码可登录，真实登录返回 `code=4011`）。

### P2 游客限制
- 未登录游客：首页「游客模式」登录条（微信登录入口）；关卡页仅第 1 关可玩，第 2+ 关锁定点击引导登录 + 游客横幅；形象/排行/错题/签到/成就入口未登录先引导登录（REQ-GUEST-1/2）。
- TODO：受限页自身 onLoad 直入守卫、结算页游客「登录保存成绩」提示。

### P3 资料完善 + 合规
- 昵称/头像登录后云端保存（POST /api/user/profile），本地镜像兜底（离线可保存）；首登 needProfile=true 自动引导设昵称；`isProfileComplete` 判定注册完成。
- 隐私协议：首页首次进入 modal 同意（`ww_agreed` 持久化，最小实现）；完整协议文本页 TODO（提审前补）。

### P4 增强（部分）
- 分享：index / level 页 `onShareAppMessage`；退出登录（nickname 页入口 → auth.logout()）。
- TODO：result/错题/形象/排行等页分享、星级云同步、受限页 URL 守卫。

> 部署注意：云托管环境变量需新增 `WX_APPID`、`WX_SECRET`（小程序 AppID 与 AppSecret），否则真实登录返回 `code=4011`。

---

## 2026-09-06（同日 · M6 打磨：合规 · 学习闭环 · 留存 · 体验）

规划与任务清单：`.codeartsdoer/specs/m6-polish/`（spec.md / tasks.md）。范围：P0 注销+内容安全；P1 全做；P2 除好友榜/对战；P3 除商业化。

### P0 合规
- **账号注销**：`POST /api/user/delete`（事务删除成绩/形象/段位/关卡/错题/签到/成就后删用户，幂等）；nickname 页「注销账号」双重确认 + 清空本地。
- **内容安全**：`server/utils/wechat.js`（access_token 缓存 + msgSecCheck v2，未配置 secret 自动放行）；昵称与自定义关卡保存接入检测。

### P1 学习闭环
- **发音 TTS**：`game/audio.js` 接微信同声传译插件（app.json 声明 WechatSI；未授权静默降级），答对/答错回执朗读。
- **合成音效**：WebAudio 合成 答对/答错/连击/通关音（engine 钩子接入）。
- **学习报告**：`GET /api/report/range` 按天聚合 + `pages/report`（学习天数/闯关/答题/正确率/每日趋势/薄弱题型/错题掌握）；首页「报告」入口。
- **每日目标自动打卡**：通关后 `POST /api/checkin/auto` 自动签到（今日有成绩才打卡）；重构公共 doCheckin。
- **多形态复习**：wrong-review 增加 原题/听音选义/看中文选词（选项动态构造，hint 剧透抑制）。
- 遗忘曲线可视化：报告页错题掌握 + 错题列表到期展示（覆盖）。

### P2 留存
- 新手引导（game 首次 3 步蒙层）、分享激励入口、学习提醒订阅引导（模板 ID 占位）、**战绩分享卡**（`pages/share-card` Canvas 海报 → 保存/转发，成就页入口）。
- TODO：订阅推送需后台模板+定时；分享奖励需邀请链路（微信无可靠回调）。

### P3 体验
- **词库例句**：导入格式支持可选第 6 段 `ex`（parser/validator 向后兼容；渲染展示后续做）。
- **个人中心**：`pages/me`（资料卡/聚合菜单/退出/注销危险区），首页登录条已登录改跳 me。
- **深色模式基础**：darkmode + theme.json + 全局/index 暗色覆盖（其余页按需）。

> 部署/配置注意：TTS 需在小程序后台添加「同声传译」插件；订阅消息需申请模板 ID；深色跟随系统设置生效。

---

## 2026-09-06（会话收工记录）

### 当日交付汇总（已全部提交并推送 origin/main）
- 历史修复：UI 布局（Canvas 响应式/安全区）、openid 请求链、x-wx-source 对齐。
- M5 登录注册：登录闭环（code2session+token）、游客限制（仅第 1 关）、昵称云端化、隐私协议（最小）。
- M6 打磨（14 模块全交付）：见上方 M6 段；末尾补充 TTS 降级修复（commit `ead8123`）。
- 全部验证：`npm test` 全绿、`node e2e/check-wxss.js` 通过（17 wxss）、逐模块语法检查。

### 收工时的已知 TODO / 上线前配置（供后续会话接续）
1. **TTS 恢复**：app.json 已移除 WechatSI 声明（后台未授权会报错）。需在小程序后台「设置→第三方设置→插件管理」添加「微信同声传译」后，恢复 app.json 的 plugins 声明（见 game/audio.js 注释）。
2. **订阅消息推送**：申请模板 ID 替换 utils 调用占位；定时/后端推送未做。
3. **分享奖励**：需自建邀请链路（微信分享无可靠成功回调），当前仅入口引导。
4. **词库例句渲染**：导入已支持 `ex` 字段，题目/答案区展示例句待做。
5. **受限页 URL 直入守卫**：avatar/rank/wrong-book/checkin/achievement 页自身 onLoad 登录校验（当前仅入口拦截）。
6. **深色模式**：仅全局/index 适配，其余页面按需补充。
7. **云托管部署**：环境变量 `WX_APPID`/`WX_SECRET`；小程序后台：同声传译插件、订阅模板、类目（教育/学习）与提审材料。
8. **协议合规**：完整「用户协议/隐私政策」文本页待补（当前为首页 modal 摘要）。

### 工作区状态
- git：`main` 与 `origin/main` 同步，工作区干净。
- 待办细节见 `.codeartsdoer/specs/m5-login-guest/tasks.md`、`m6-polish/tasks.md`（均已完成并勾选，TODO 已在文档内标注）。

---

## 2026-09-08（体验优化批 + 云托管通道切换）

### 部署通道与登录链路（生产问题修复）
- **callContainer 迁移**：前端从 `wx.request + 裸域名` 切到 `wx.cloud.callContainer`（`utils/request.js` + `app.js wx.cloud.init`），根治「request 合法域名」白名单报错；无需配服务器域名。
- **envId 修正**：`CLOUD_CONFIG.envId = prod-d6gnifjoe28cfd96f`（原误填 cloud1-… 致 INVALID_HOST）；serviceName=`express-g0hk`。
- **login 多来源**：`/api/login` 优先取云托管网关注入的 `x-wx-openid`（免 secret/免证书）；其次 `dev_` 测试码；再次 code2session（需 `WX_SECRET`）。日志曾出现 `4011` 与 `DEPTH_ZERO_SELF_SIGNED_CERT`（云托管开放接口服务容器内自签证书）——临时以 env `NODE_TLS_REJECT_UNAUTHORIZED=0` 打通，正规化方向见 TODO。

### 用户体验优化（产品拍板，2026-09-08）
- **① 默认解锁前 3 关**：1~3 关游客同享默认开放；第 4 关起逐关解锁（需上一关 ≥1 星），游客第 4 关起需登录（commit `3a84b19`）。
- **⑤ 声音开关**：`audio.js` 增加总开关（音效+TTS 统一受控），游戏 HUD 🔊/🔇 切换并持久化（`7f87cb5`）。
- **④ 排版可读性**：英文整词展示改「首字母大写」（题面/选项词/词级空槽/回执，判定仍用小写）；关键字号放大（怪兽/词级提示 13→15px、游戏提示 26→30rpx）（`1887951`，同步 question.test 断言）。
- **② 题型分类关卡**：学段下加题型 chips（综合/单词/填空/词语/成语/歇后语），分类独立抽题与存档（`grade@type@level`，综合兼容旧 key）、空分类隐藏、1~9 题提示不可进（`237ef11`）。
- **③ 小程序码（后端）**：`GET /api/wxcode` 生成 getwxacodeunlimit（云调用内网 http 免 token）→ base64 data-url（`1ce83da`）。前端分享卡叠加码待做。

### 交互 Demo（三版 HTML，供挑选交互方向）
- 子代理产出 `study_game/demo/01-duolingo-style.html / 02-boss-rush.html / 03-speed-arena.html`，见该目录；选定方向后再落地小程序。

### 待办/上线前配置（承接上文，新增）
9. **③ 前端**：`pages/share-card` 海报叠加小程序码（drawImage data-url）。
10. **云托管配置**：开放接口服务白名单加 `/wxa/getwxacodeunlimit`；小程序码发布/体验版方可扫；env `NODE_TLS_REJECT_UNAUTHORIZED=0` 为临时项，正规化=关闭开放接口服务或信任其容器 CA。
11. 低优先：关卡卡语义化（第 N 关·分类名）、game/level 深色补全、大字模式。

---

## 2026-09-08（会话收尾 · lazyCodeLoading 与终态）

- **组件按需注入**：`miniprogram/app.json` 加 `"lazyCodeLoading":"requiredComponents"`（消除开发者工具告警、优化冷启动）（commit `de0b631`）。
- 工作区与 `origin/main` 完全同步，无未提交改动；本会话全部功能与文档已归档。
- 已知待办见上文 09-08「待办/上线前配置」与 `.codeartsdoer/specs/*/tasks.md`（接续会话从此处继续）。


---

## 2026-09-08（收尾批：计分调整 · 数据链路修复 · M7 形态/地图）

### 计分与数值
- **每题得分 100→10**：每关 10 题满分 100；前端 `config.SCORE_PER_CORRECT` 与后端 `constants.SCORE_PER_QUESTION` 同步（服务端答对数×10 推导，防伪口径不变），新手引导文案同步（`07ae4f9`）。

### 数据链路修复（实测缺漏）
- **错题本空**：根因=前端从未调用 `/api/wrong/add`。修复：engine 答错触发 `onWrong` → game 注入 → 登录用户上报（`1952341`）；另后端 `wrong list/stats` 待复习口径改为「未掌握（含今日新错，当天可见）」。
- **排行榜无人**：根因=前端从未调用 `/api/rank/sync`。修复：结算通关后（登录）自动同步胜场+1/星累加（`1952341`）。
- **解锁条件提示**：avatar 页显示「累计 N 星 / 达到段位 X（还差…），达标变可解锁」，level 锁定卡显示「登录解锁 / 通关上一关解锁」（`80cd76f`）。

### Demo 打磨
- `demo/01-duolingo-style.html` 去半成品观感：顶栏真实统计（进度/今日通关/总星，跨天重置）、移除占位返回、加进度重置与 Demo2/3 切换（`edfe12c`）。

### M7 玩法形态化 + 关卡地图（spec：`.codeartsdoer/specs/m7-gameplay-modes/`）
- **Phase B 关卡蛇形路径地图**（`d443fd5`）：level 页网格→蛇形路径节点（金✔重玩 / 呼吸"继续" / 灰🔒+条件，连线随通关点亮）；学段/题型分类/游客/默认解锁3+逐关/分类存档/徽标全保留。
- **Phase A 对局三形态·玩家自选**（`aa1437c`）：经典 / Boss 狂潮（10 格血条+受击顿帧+暴怒+击破）/ 极速竞技（每题 8s+惩罚锁）；**判定/计分/星级/上报零改动**（score 恒 答对数×10，表现不进分；超时与答错同走 `_failQuestion`）。

### 接口体检（2026-09-08 线上网关）
- `e2e/smoke-api.js`：12 组路由 **全部 PASS**（authed 走 x-wx-source 通道为 1003 属预期——真实小程序走 Bearer token 不受影响；若需 smoke source 通道通，检查云托管 env `WX_TRUSTED_SOURCES` 未被清空）。
- 真实调用链探测（login 拿 token → Bearer 调 user/me、score、rank/sync、wrong/add·list、checkin/auto、report、ranklist/world、achievement、avatar）：**全部 code=0**。
