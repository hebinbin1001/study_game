# 词力战士（Word Warrior）M1 编码任务列表

> 文档状态：M1 任务规划（v1.0）
> 关联文档：`spec.md`（48 条 REQ）、`design.md`（技术设计）、`docs/词库格式规范.md`（词库规范）
> 拆分原则：按 M1 六大交付垂直切割；任务文件域互不重叠以支持多工程师并行；被依赖者在前。

---

## 一、任务总表

| 任务ID | 标题 | 所属交付 | 依赖 | 关联 REQ | 规模 |
|---|---|---|---|---|---|
| T1 | 搭建小程序前端工程骨架 | 1 工程初始化 | 无 | ENG-1/3, GAME-1, NFR-3/5, DICT 枚举 | L |
| T2 | 搭建后端数据层与部署配置 | 6 后端接口 | 无 | ENG-2, API-1/5, NFR-6 | M |
| T3 | 搭建后端服务入口与路由接口 | 6 后端接口 | T2 | ENG-2, API-1/2/3/4/5 | L |
| T4 | 实现游戏参数配置与状态机 | 2 核心战斗 | T1 | GAME-3/6/7, NFR-5 | S |
| T5 | 实现出题与干扰项生成模块 | 2 核心战斗 | T1, T4 | GAME-4/5, DICT-3, IMP-10 | L |
| T6 | 实现 Canvas 渲染器 | 2 核心战斗 | T1 | GAME-2/6/7/10, NFR-1 | L |
| T7 | 实现游戏主循环引擎与音效占位 | 2 核心战斗 | T1, T4, T5, T6 | GAME-6/7/8/9, NFR-1/2 | L |
| T8 | 编写内置分级词库数据 | 3 内置词库 | 无 | DICT-1/2/3/4, NFR-2 | L |
| T9 | 实现词库装载与抽题 | 3 内置词库 | T8, T5 | DICT-3/4/5 | S |
| T10 | 实现纯文本词库解析器 | 5 词库导入 | T1 | IMP-1 | S |
| T11 | 实现词库校验器与敏感词过滤 | 5 词库导入 | T1, T10 | IMP-2/3/4/5/6/7/8/9 | M |
| T12 | 实现本地存储封装 | 4 昵称 / 2 结算 | T1 | NICK-2, GAME-13/14, NFR-2 | S |
| T13 | 实现后端 HTTP 封装 | 6 后端接口（前端侧） | T1 | API-5, NFR-2 | S |
| T14 | 实现首页与关卡选择页 | 2 核心战斗 | T1, T12, T9 | GAME-1/14, NICK-4, DICT-1 | M |
| T15 | 实现游戏页集成（Canvas + HUD + 选项） | 2 核心战斗 | T1, T4, T5, T6, T7, T9 | GAME-2/3/6~10, NFR-1/3 | L |
| T16 | 实现结算页逻辑 | 2 核心战斗 | T1, T12, T13 | GAME-11/12/13/15, API-4 | M |
| T17 | 实现昵称设置页逻辑 | 4 昵称功能 | T1, T12, T13 | NICK-1/2/3/4 | M |
| T18 | 端到端联调与验收测试 | 全部 | T3, T13, T14, T15, T16, T17 | GAME/NFR 全部验收 | M |

> 覆盖全部六大交付与 48 条 REQ（ENG 3 + GAME 15 + DICT 5 + NICK 4 + IMP 10 + API 5 + NFR 6），无遗漏。

---

## 二、任务详情

### T1 搭建小程序前端工程骨架

- **目标文件**：
  - `miniprogram/app.js`、`miniprogram/app.json`、`miniprogram/app.wxss`
  - `miniprogram/project.config.json`、`miniprogram/sitemap.json`
  - `miniprogram/pages/index/index.{wxml,wxss,js,json}`
  - `miniprogram/pages/level/level.{wxml,wxss,js,json}`
  - `miniprogram/pages/game/game.{wxml,wxss,js,json}`
  - `miniprogram/pages/result/result.{wxml,wxss,js,json}`
  - `miniprogram/pages/nickname/nickname.{wxml,wxss,js,json}`
  - `miniprogram/utils/constants.js`
- **依赖**：无
- **关联 REQ**：REQ-ENG-1、REQ-ENG-3、REQ-GAME-1、REQ-NFR-3、REQ-NFR-5；并预置 REQ-DICT-1/2 所需的学段与类型码枚举
- **验收标准**：
  1. `miniprogram/` 目录导入微信开发者工具后无编译错误，可预览进入首页（占位页）。
  2. `app.json` 注册 index、level、game、result、nickname 五个页面，配置窗口样式与竖屏方向。
  3. `app.js` 提供 `globalData`（用户 openid、昵称、词库缓存字段）及登录态获取占位。
  4. 五个页面各有可用的空壳 `.wxml/.wxss/.js/.json`，页面间可通过占位按钮互跳（导航链路打通）。
  5. `game/`、`data/`、`utils/` 目录均已创建，职责划分与 `README.md` 规划一致（REQ-ENG-3）。
  6. `utils/constants.js` 定义 7 学段枚举、8 类型码枚举（w1/w2/c1/c2/xhy/zc/fill/trans）、星级阈值（90/70/40）、存储 key 名（ww_nickname/ww_avatar/ww_stars/ww_pending_scores）。
  7. `app.json` 目标基础库 ≥ 2.9.0，或 `app.js` 内做 `SDKVersion` 兼容检测（低于阈值提示升级）（REQ-NFR-3）。
- **预估规模**：L

### T2 搭建后端数据层与部署配置

- **目标文件**：
  - `server/package.json`、`server/Dockerfile`、`server/container.config.json`
  - `server/db.js`、`server/models/user.js`、`server/models/score.js`
  - `server/middlewares/openid.js`
- **依赖**：无
- **关联 REQ**：REQ-ENG-2、REQ-API-1、REQ-API-5、REQ-NFR-6
- **验收标准**：
  1. `npm install` 成功安装 `express / cors / morgan / mysql2 / sequelize` 依赖（REQ-ENG-2）。
  2. `db.js` 从环境变量 `MYSQL_USERNAME / MYSQL_PASSWORD / MYSQL_ADDRESS` 读配置，`MYSQL_ADDRESS` 按 `host:port` 拆分，数据库名使用本项目库名（如 `word_warrior`）；导出 `init`、`User`、`Score` 并建立 `User.hasMany(Score, { foreignKey: 'user_id' })` 关联。
  3. `models/user.js` 定义字段：`id(PK)`、`openid(unique,not null)`、`nickname`、`avatar_url`、时间戳；`models/score.js` 定义字段：`id(PK)`、`user_id(FK)`、`grade`、`level`、`score`、`correct_count`、`total_q`、`max_combo`、`stars`、`createdAt`（与 design.md 2.3.2 一致）。
  4. `db.js` 的 `init()` 执行 `sync({ alter: true })`（M1 骨架期建表）。
  5. `middlewares/openid.js` 解析请求头：存在 `x-wx-source` 时取 `x-wx-openid` 注入 `req.openid`，否则 `req.openid` 为 `undefined`（REQ-API-5）。
  6. `Dockerfile` 与 `container.config.json` 可构建，容器监听端口 `80`。
- **预估规模**：M

### T3 搭建后端服务入口与路由接口

- **目标文件**：
  - `server/index.js`
  - `server/routes/health.js`、`server/routes/user.js`、`server/routes/nickname.js`、`server/routes/score.js`
- **依赖**：T2（运行时需使用 T2 提供的 `db.init/User/Score` 与 `middlewares/openid`）
- **关联 REQ**：REQ-ENG-2、REQ-API-1、REQ-API-2、REQ-API-3、REQ-API-4、REQ-API-5
- **验收标准**：
  1. `index.js` 完成 Express 初始化（`express.json/urlencoded + cors + morgan`），`bootstrap()` 先 `initDB()` 再 `listen(process.env.PORT || 80)`（REQ-API-1）；MySQL 连接失败时打印明确错误并终止启动。
  2. 挂载 `openid` 中间件到业务路由（REQ-API-5）。
  3. `GET /api/health` 返回 `{ code: 0, data: { status: "ok", db: "connected" } }`（REQ-API-1）。
  4. `POST /api/user` 缺 openid 返回 `{ code: 1001 }`；正常返回/创建用户（REQ-API-2）。
  5. `GET/POST /api/nickname` 读写昵称，哆称非法返回 `{ code: 2001 }`，用户不存在返回 `{ code: 1001 }`（REQ-API-3）。
  6. `POST /api/score` 校验字段（缺失/非法返回 `{ code: 3001 }`）；`GET /api/score/best?grade=&level=` 返回 `bestStars / bestScore`（REQ-API-4）。
  7. 所有接口统一返回 `{ code, data }` 结构，`code=0` 表示成功。
- **预估规模**：L

### T4 实现游戏参数配置与状态机

- **目标文件**：`miniprogram/game/config.js`、`miniprogram/game/state.js`
- **依赖**：T1
- **关联 REQ**：REQ-GAME-3、REQ-GAME-6、REQ-GAME-7、REQ-NFR-5
- **验收标准**：
  1. `config.js` 集中所有魔法数字：`sinkSpeed`（下沉速度）、`approach`（逼近距离）、`approachTime`（逼近时长）、`totalQ=10`、`initLives=3`、`cannonY`、`dangerY`、`monStartY` 等（REQ-NFR-5、REQ-GAME-3）。
  2. `state.js` 提供状态常量 `IDLE / FLYING / APPROACHING / DYING / FAILED`。
  3. `createInitialState()` 返回全局状态 `G`（含 `state/score/lives/answered/correctCount/combo/question/options/monster/bullet/particles/checkmark` 等字段），`initLives=3`、计分从 0 开始。
  4. `resetGame()` 可复位一局状态。
- **预估规模**：S

### T5 实现出题与干扰项生成模块

- **目标文件**：`miniprogram/game/question.js`
- **依赖**：T1、T4
- **关联 REQ**：REQ-GAME-4、REQ-GAME-5、REQ-DICT-3、REQ-IMP-10
- **验收标准**：
  1. `genQuestion(item)` 返回 `{ blankIdx, correct, options }`，实现挖空规则：英语单词优先挖元音（a/e/i/o/u）、成语挖中间某字（避开首字）、单字/词语随机挖一字、无对应规则随机挖（REQ-GAME-4）。
  2. `genDistractors(item, blankIdx, correct)` 返回 4 个选项（1 正确 + 3 干扰），选项两两不同，正确答案恰好出现一次（REQ-GAME-5）。
  3. 含 `CN_CONFUSE_MAP` 形近字表、英语形近对（b↔d/p↔q/n↔m/f↔t/s↔z）与易混词 `conf` 配对逻辑；不足时兜底补齐 4 选项。
  4. 无 `*` 标注的词条可被 `genQuestion` 默认挖空（REQ-DICT-3）。
  5. 暴露 `ensureDistractors(item)` 供导入词条缺省干扰项补齐复用（REQ-IMP-10）。
- **预估规模**：L

### T6 实现 Canvas 渲染器

- **目标文件**：`miniprogram/game/renderer.js`
- **依赖**：T1
- **关联 REQ**：REQ-GAME-2、REQ-GAME-6、REQ-GAME-7、REQ-GAME-10、REQ-NFR-1
- **验收标准**：
  1. `render(ctx, state, now)` 绘制游戏主体：天空、怪兽（身上挖空题目）、炮台、炮弹、粒子、✓ 反馈（REQ-GAME-2）。
  2. 平移原型 `drawSky / drawMonster / drawCannon / drawBullet / drawParticles / drawCheckmark` 系列绘制逻辑。
  3. 实现答对反馈视觉：绿色 ✓、爆炸粒子、怪兽头顶冒星星（REQ-GAME-6）。
  4. 实现答错反馈视觉：怪兽逼近 + 抖动 + 红色闪光（REQ-GAME-7）。
  5. 实现挖空格「闪烁 + 呼吸缩放」动画，填充后停止并显示填充字符（REQ-GAME-10）。
  6. 绘制坐标以逻辑像素（390×500）为准，粒子数量设上限（如 ≤ 200）以保帧率（REQ-NFR-1）。
- **预估规模**：L

### T7 实现游戏主循环引擎与音效占位

- **目标文件**：`miniprogram/game/engine.js`、`miniprogram/game/audio.js`
- **依赖**：T1、T4、T5、T6
- **关联 REQ**：REQ-GAME-6、REQ-GAME-7、REQ-GAME-8、REQ-GAME-9、REQ-NFR-1、REQ-NFR-2
- **验收标准**：
  1. `engine.start(canvasNode, ctx)` 使用 `canvasNode.requestAnimationFrame` 跑主循环，`update(dt)` → `render(ctx)`（REQ-NFR-1）。
  2. `dt` 钳制 `min(0.05, (now - last)/1000)`，与原型 `loop()` 一致；`engine.stop()` 停止 rAF。
  3. 实现状态流转：`IDLE → FLYING(命中) → DYING(≈0.7s) → 下一题/结算`；`IDLE 选错 → APPROACHING(≈0.6s) → lives-1、combo=0 → 下一题/失败`；`IDLE 怪兽下沉至 dangerY 判负 → 视同答错`（REQ-GAME-6/7/8）。
  4. 计分逻辑：答对 `score +100、combo +1`；答错 `combo 归零、lives -1`（REQ-GAME-6/7）。
  5. 连击 2/3/5 时通过回调触发中心连击提示（REQ-GAME-9）。
  6. `audio.js` 提供统一 `speak(text, lang)` 接口，M1 为空实现（静默降级），保证离线可玩（REQ-NFR-2）。
- **预估规模**：L

### T8 编写内置分级词库数据

- **目标文件**：
  - `miniprogram/data/kindergarten.json`（幼儿园 100）
  - `miniprogram/data/primary12.json`（小学 1-2 150）
  - `miniprogram/data/primary34.json`（小学 3-4 200）
  - `miniprogram/data/primary56.json`（小学 5-6 200）
  - `miniprogram/data/junior.json`（初中 200）
  - `miniprogram/data/senior.json`（高中 200）
  - `miniprogram/data/college.json`（大学 200）
- **依赖**：无
- **关联 REQ**：REQ-DICT-1、REQ-DICT-2、REQ-DICT-3、REQ-DICT-4、REQ-NFR-2
- **验收标准**：
  1. 7 个学段 JSON 文件齐全，规模 100/150/200/200/200/200/200，合计约 1250 条（REQ-DICT-1）。
  2. 每条词条结构为 `{ type, q, a, hint, d? }`（短字段命名），其中 `grade/label` 在每文件顶层说明（REQ-DICT-3）。
  3. 8 种类型码（w1/w2/c1/c2/xhy/zc/fill/trans）均有对应示例词条（REQ-DICT-2）。
  4. 无 `*` 标注词条与显式 `*` 标注词条并存，均能出题（REQ-DICT-3）。
  5. 词库纯本地 JSON 分发，估算包体积 < 100KB；断网可加载出题（REQ-DICT-4、REQ-NFR-2）。
- **预估规模**：L

### T9 实现词库装载与抽题

- **目标文件**：`miniprogram/utils/dict.js`
- **依赖**：T8、T5
- **关联 REQ**：REQ-DICT-3、REQ-DICT-4、REQ-DICT-5
- **验收标准**：
  1. `loadByGrade(grade)` 按学段装载对应 JSON。
  2. `randomItem(grade, exclude?)` 随机抽题并可选排除已出题目。
  3. 内置 JSON 与导入解析产物共用统一 `WordItem` 结构（REQ-DICT-3）。
  4. 新增学段/题型仅改 `data/` JSON，不改 `dict.js` 与出题逻辑（REQ-DICT-5）。
- **预估规模**：S

### T10 实现纯文本词库解析器

- **目标文件**：`miniprogram/utils/parser.js`
- **依赖**：T1
- **关联 REQ**：REQ-IMP-1
- **验收标准**：
  1. `parseText(text)` 预处理：全角 `｜` 替换为半角 `|`；按 `\n`（兼容 `\r\n`）切分；去除空行与 `#` 开头注释行（REQ-IMP-1）。
  2. 逐行按 `|` 切分为 `[type, q, a, hint, d?]`，`d`（干扰项）按 `,` 分隔。
  3. 返回 `{ items, errors }` 结构（错误收集交 T11 校验器，解析器保证字段正确切分）。
- **预估规模**：S

### T11 实现词库校验器与敏感词过滤

- **目标文件**：`miniprogram/utils/validator.js`、`miniprogram/utils/sensitive.js`
- **依赖**：T1、T10
- **关联 REQ**：REQ-IMP-2、REQ-IMP-3、REQ-IMP-4、REQ-IMP-5、REQ-IMP-6、REQ-IMP-7、REQ-IMP-8、REQ-IMP-9
- **验收标准**：
  1. `validateLine(fields, lineNo, seenSet)` 顺序执行 7 项校验，命中即记错并继续下一行（不中断）。
  2. 类型码 ∈ 8 种，否则报「第 N 行：类型码「xx」不认识」（REQ-IMP-2）。
  3. 字段数 ≥ 3，缺「提示/释义」报错；缺「干扰项」可接受（REQ-IMP-3）。
  4. w2/c2 时 `*` 数量 = 答案长度，不符报「挖空数(*)与答案不符」（REQ-IMP-4）。
  5. 答案字符 ∈ 题目（去 `*`）字符集，否则报「答案不在题目中」（REQ-IMP-5）。
  6. 干扰项不含正确答案，否则报「干扰项重复正确答案」（REQ-IMP-6）。
  7. 敏感词命中报「包含敏感内容」（REQ-IMP-8）。
  8. `sensitive.js` 提供 `containsSensitive(text) → boolean`，精简词库命中即停（REQ-IMP-8）。
  9. 重复题目通过 `seenSet` 记录「题目→首次行号」，报「第 N 行：与第 M 行题目重复」（REQ-IMP-7）。
  10. 错误全量汇聚（`{ line, reason }[]`），而非首个即止（REQ-IMP-9）。
- **预估规模**：M

### T12 实现本地存储封装

- **目标文件**：`miniprogram/utils/storage.js`
- **依赖**：T1
- **关联 REQ**：REQ-NICK-2、REQ-GAME-13、REQ-GAME-14、REQ-NFR-2
- **验收标准**：
  1. 封装 `wx.getStorageSync / wx.setStorageSync`，提供统一的 `get/set/remove` 接口。
  2. 存储 key：`ww_nickname`、`ww_avatar`、`ww_stars`、`ww_pending_scores`。
  3. 昵称读写持久化（REQ-NICK-2）。
  4. `getStars(grade, level) / saveStars(grade, level, stars)` 星级按「年级+关卡」存储并取历史最大值（REQ-GAME-13）。
  5. `isLevelUnlocked(grade, level)` 由 `ww_stars` 推导：第 1 关默认解锁，第 N 关需第 N-1 关 ≥1 星（REQ-GAME-14）。
  6. `ww_pending_scores` 待上报成绩队列读写（REQ-NFR-2）。
- **预估规模**：S

### T13 实现后端 HTTP 封装

- **目标文件**：`miniprogram/utils/request.js`
- **依赖**：T1
- **关联 REQ**：REQ-API-5、REQ-NFR-2
- **验收标准**：
  1. 封装 `wx.request`，自动附加 `x-wx-source / x-wx-openid` 请求头（REQ-API-5）。
  2. 统一解包 `{ code, data }`，`code !== 0` 时抛出业务错误供页面 toast 展示。
  3. 网络失败/无网时静默降级，不阻塞主流程（REQ-NFR-2）。
- **预估规模**：S

### T14 实现首页与关卡选择页

- **目标文件**：
  - `miniprogram/pages/index/index.{wxml,wxss,js,json}`
  - `miniprogram/pages/level/level.{wxml,wxss,js,json}`
- **依赖**：T1、T12、T9
- **关联 REQ**：REQ-GAME-1、REQ-GAME-14、REQ-NICK-4、REQ-DICT-1
- **验收标准**：
  1. 首页「开始游戏」跳转关卡选择页；昵称入口显示已存昵称或「未设置昵称」占位，点击进入昵称页（REQ-GAME-1、REQ-NICK-4）。
  2. 关卡选择页提供 7 学段 tab + 关卡卡片网格（`wx:for` 渲染），可按学段切换（REQ-DICT-1）。
  3. 第 1 关默认可选；第 N 关需前一关 ≥1 星解锁，未解锁点击触发抖动提示、不可进入（REQ-GAME-14）。
  4. 关卡卡片显示对应星级（读 `ww_stars`）。
  5. 选中关卡后正确携带「学段 + 关卡」参数进入游戏页。
- **预估规模**：M

### T15 实现游戏页集成（Canvas + HUD + 选项）

- **目标文件**：`miniprogram/pages/game/game.{wxml,wxss,js,json}`
- **依赖**：T1、T4、T5、T6、T7、T9
- **关联 REQ**：REQ-GAME-2、REQ-GAME-3、REQ-GAME-6、REQ-GAME-7、REQ-GAME-8、REQ-GAME-9、REQ-GAME-10、REQ-NFR-1、REQ-NFR-3
- **验收标准**：
  1. 页面 `onReady` 用 `wx.createSelectorQuery().in(this).select('#game-canvas').fields({ node:true, size:true })` 获取 Canvas 节点与逻辑尺寸。
  2. dpr 适配：`node.width = width * dpr`、`node.height = height * dpr`、`ctx.scale(dpr, dpr)`，绘制坐标以逻辑像素为准（REQ-GAME-2、REQ-NFR-3）。
  3. `game.wxml` 采用 `<canvas type="2d" id="game-canvas">` + HUD（命数/得分/题号/提示）与选项按钮（`wx:for`）分层（REQ-GAME-2）。
  4. 开始关卡显示「第 1/10 题」、3 颗心（REQ-GAME-3）；HUD 用 `setData` 且仅在数值实际变化时触发（REQ-NFR-1）。
  5. 选项按钮 `catchtap` 转发 `engine.handleOptionTap(e)`；答对/答错/连击/空格呼吸反馈正确映射到 HUD 与 Canvas（REQ-GAME-6/7/8/9/10）。
  6. `onUnload/onHide` 调用 `engine.stop()` 停止 rAF。
- **预估规模**：L

### T16 实现结算页逻辑

- **目标文件**：`miniprogram/pages/result/result.{wxml,wxss,js,json}`
- **依赖**：T1、T12、T13
- **关联 REQ**：REQ-GAME-11、REQ-GAME-12、REQ-GAME-13、REQ-GAME-15、REQ-API-4
- **验收标准**：
  1. 展示星级（★/☆）、得分、答对题数（x/10）、正确率百分比，提供「再玩一次」「回首页」操作（REQ-GAME-15）。
  2. 生命耗尽进入结算页展示失败态（如「再接再厉！」），不计星、不写星级存档（REQ-GAME-11）。
  3. 答完 10 题按正确率评定星级：≥90% 3 星、≥70% 2 星、≥40% 1 星、<40% 0 星（REQ-GAME-12）。
  4. 通关时按「年级+关卡」写 `ww_stars` 并取历史最大值（REQ-GAME-13）。
  5. 结算后调用 `POST /api/score` 上报成绩，无网时静默降级（REQ-API-4）。
- **预估规模**：M

### T17 实现昵称设置页逻辑

- **目标文件**：`miniprogram/pages/nickname/nickname.{wxml,wxss,js,json}`
- **依赖**：T1、T12、T13
- **关联 REQ**：REQ-NICK-1、REQ-NICK-2、REQ-NICK-3、REQ-NICK-4
- **验收标准**：
  1. 采用新版「头像昵称填写能力」：`chooseAvatar` 按钮 + `nickname` input 双通道（REQ-NICK-1）。
  2. 授权使用微信昵称时正常填充；拒绝授权时引导手动输入自定义昵称，不阻塞（REQ-NICK-1）。
  3. 自定义昵称校验：去首尾空白、非空、长度 ≤12（可配置 2~12），不合规提示且不保存（REQ-NICK-3）。
  4. 保存昵称写入 `storage.ww_nickname`；退出重进可读取并展示已存昵称（REQ-NICK-2）。
  5. 可选调用 `POST /api/nickname` 同步云端，失败静默降级（REQ-API-3）。
- **预估规模**：M

### T18 端到端联调与验收测试

- **目标文件**：无新增源码文件（验证结果记录，视需要更新 `README.md`）
- **依赖**：T3、T13、T14、T15、T16、T17
- **关联 REQ**：M1 全部验收（REQ-GAME-1~15、REQ-NFR-1~6 等）
- **验收标准**：
  1. 前端 `miniprogram/` 导入开发者工具编译通过，iOS/Android 真机竖屏试玩 10 题无卡顿，帧率稳定接近 60（REQ-NFR-1/3）。
  2. 核心战斗四屏流转完整，玩法行为与 HTML 原型一致（REQ-GAME-1~15）。
  3. 断网状态下内置词库加载、选关、游戏、结算、昵称全程可玩（REQ-NFR-2）。
  4. 后端 `npm start` 启动成功，`/api/health` 返回正常；用户/昵称/成绩接口可往返存取（REQ-API-1~5）。
  5. 词库导入：多行错误一次性反馈（行号+原因）；缺干扰项词条可生成 4 选项正常出题（REQ-IMP-9/10）。
  6. 关键算法有注释，模块划分与 `README.md` 规划一致（REQ-NFR-6）。
- **预估规模**：M

---

## 三、建议执行顺序（拓扑排序）

按依赖关系分波次推进，同波次内任务文件域互不重叠、可被多个编码工程师并行领取：

**第 0 波（无前置，最早并行）**
- T1（前端骨架）、T2（后端数据层）、T8（内置词库数据）

**第 1 波（依赖第 0 波，可并行）**
- T4（配置+状态机）、T6（渲染器）、T10（解析器）、T12（本地存储）、T13（HTTP 封装）—— 均依赖 T1
- T3（后端路由）—— 依赖 T2
- T9（词库装载）—— 依赖 T8（+ T5 逻辑约定）

**第 2 波（依赖第 1 波，可并行）**
- T5（出题/干扰项）—— 依赖 T1、T4
- T7（主循环引擎）—— 依赖 T1、T4、T5、T6
- T11（校验器/敏感词）—— 依赖 T1、T10

**第 3 波（页面集成，可并行）**
- T14（首页+关卡选择）—— 依赖 T1、T12、T9
- T15（游戏页）—— 依赖 T1、T4、T5、T6、T7、T9
- T16（结算页）—— 依赖 T1、T12、T13
- T17（昵称页）—— 依赖 T1、T12、T13

**第 4 波（终验，收口）**
- T18（端到端联调与验收）—— 依赖 T3、T13、T14、T15、T16、T17

### 可并行开发分组（文件域不重叠）

| 分组 | 任务 | 说明 |
|---|---|---|
| 前端工程与数据 | T1、T8 | 互不依赖，可同时开工 |
| 后端 | T2 → T3 | 数据层与路由层文件域分离，可流水线并行开发，运行联调在 T3 完成后 |
| 游戏核心模块 | T4、T5、T6、T7 | 分别负责 config/state、question、renderer、engine/audio 四个文件域 |
| 词库解析校验 | T10、T11 | parser 与 validator/sensitive 文件域分离 |
| 公共服务 | T12、T13 | 本地存储与 HTTP 封装独立 |
| 页面层 | T14、T15、T16、T17 | 五个页面各归其组，文件互不重叠 |

> 说明：所有「同文件先后修改」关系均为串行依赖（T1 建页面空壳 → T14~T17 填充逻辑；T2 数据层 → T3 路由层运行时依赖），不存在两个并行任务同时修改同一文件的情况。