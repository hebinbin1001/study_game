# 词力战士（Word Warrior）M1 核心技术设计文档

> 文档状态：M1 技术设计（v1.0）
> 适用阶段：M1（MVP 核心）
> 关联文档：`spec.md`（需求）、`README.md`（工程规划）、`docs/词库格式规范.md`（词库规范）、HTML 试玩原型 `../prototype/index.html`（玩法基准）、微信云托管模板 `wxcloudrun-express-main/`（后端骨架参考）
> 设计原则：本设计只回答「如何实现」，不重复需求内容；每个设计点以 `(REQ-xxx)` 标注追溯至 spec.md 需求编号。

---

# 一、需求与存量功能关系分析

本章节明确：M1 需求与现有资产（HTML 原型、wxcloudrun-express 模板）之间的关系，是增量设计的基础。本项目为**全新工程**，存量「代码」仅有两份可复用资产：

- **HTML 试玩原型**（`../prototype/index.html`）：核心战斗玩法的完整参考实现，包含状态机、出题/挖空、干扰项生成、计分、连击、答错逼近、星级评定、Canvas 渲染循环等已被验证的逻辑。
- **微信云托管 Express 模板**（`wxcloudrun-express-main/`）：后端工程骨架，提供 Express 启动、Sequelize 连接 MySQL、`x-wx-openid` 请求头透传约定。

## 1.1 需求功能与存量功能对比

### 1.1.1 已实现功能（逻辑可直接平移复用）

以下需求对应的**业务逻辑**在 HTML 原型中已完整实现且行为已验证，平移时核心算法（挖空规则、干扰项生成、计分公式、星级阈值、状态流转）可原样保留，仅需替换渲染/存储/事件层 API。

| 需求功能 | 存量功能 | 代码位置 | 匹配度 |
|---------|---------|---------|--------|
| 出题挖空规则：英语挖元音/成语挖中间字/单字随机挖 | `newQuestion()` 中 `idiom`/`cn`/`en` 三分支挖空逻辑 | prototype/index.html:444-480 | 100%（逻辑层） |
| 干扰项生成：元音/辅音形近/易混词/形近字 + 兜底补齐 4 选项 | `genDistractors()` 及 `CN_CONFUSE_MAP` 形近字表、`conf` 易混词 | index.html:483-550、288-320 | 100%（逻辑层） |
| 计分与连击：+100、combo+1、答错归零 | `onBulletHit()` / `failQuestion()` | index.html:597-682 | 100% |
| 星级评定：正确率 ≥90/70/40% → 3/2/1 星 | `endLevel()` 中的 `rate>=90?3:...` | index.html:713-724 | 100% |
| 怪兽自然下沉判负 + 答错逼近动画参数 | `update()` 中 `sinkSpeed` 下沉、`approach`/`approachTime` 逼近 | index.html:737-747、CONFIG:195-204 | 100% |
| 状态机（idle/flying/approaching/dying/failed）流转语义 | `fire()`/`onBulletHit()`/`failQuestion()` 状态切换 | index.html:570-682 | 100%（逻辑层） |
| 结算数据计算（得分/答对/正确率/星级） | `endLevel()` | index.html:713-724 | 100% |
| wxcloudrun 后端的 `x-wx-source`/`x-wx-openid` 透传机制 | `/api/wx_openid` 路由 | wxcloudrun-express-main/index.js:46-50 | 100% |
| Express 启动 + Sequelize 连接 MySQL 骨架 | `index.js` bootstrap、`db.js` init/sync | wxcloudrun-express-main/index.js:52-61、db.js | 100% |

### 1.1.2 需要扩展的功能（浏览器 API 需替换为小程序 API）

以下需求算法已实现，但其**宿主 API** 依赖浏览器环境，需逐项替换为微信小程序等价 API（详见二、2.1.3.1 Canvas 平移方案）。

| 需求功能 | 存量功能 | 差异说明 | 扩展方向 |
|---------|---------|---------|---------|
| Canvas 游戏渲染 | `document.getElementById().getContext('2d')` + 固定宽高 390×500 | 小程序无 DOM，Canvas 2D 节点需通过 `createSelectorQuery` 获取，且需 dpr 适配 | `game/page` 中节点获取 + `node.getContext('2d')` + scale |
| 游戏主循环 | `requestAnimationFrame`（window 全局） | 小程序需使用 Canvas 节点自带 `node.requestAnimationFrame` | `game/engine.js` 主循环挂在 canvas 节点上 |
| HUD/选项动态渲染 | `innerHTML`/`createElement`/`classList` 操作 DOM | 小程序页面层用 WXML 数据绑定 + `setData` 更新 | 游戏页 HUD/选项区用 WXML + `wx:for` |
| 屏幕切换 | `.screen.active` class 切换（单页 SPA） | 小程序为多页面，四屏映射为 4 个独立 page + 页面导航 | `pages/` 下 index/level/game/result/nickname 5 页 |
| 发音 | `window.speechSynthesis` | 小程序无 Web Speech API | `game/audio.js` 占位 + `wx.createInnerAudioContext` 预录音 / TTS 插件，M1 静默降级 |
| 本地存档 | `localStorage.getItem/setItem` | 小程序用 `wx.setStorageSync/getStorageSync` | `utils/storage.js` 统一封装 |
| 事件绑定 | `onclick` 属性 | WXML `bindtap`/`catchtap` | 页面 WXML + js handler |
| 提示浮层 | 自绘 `.toast` div | 小程序可用 `wx.showToast` 或自绘 | `utils/toast.js` 封装 |

### 1.1.3 需要新增的功能或接口

以下需求在存量资产中**无对应实现**，需全新开发。

**（A）后端服务与数据层**（对应 REQ-API-1~5、REQ-ENG-2）
- Express 应用骨架（routes 目录化），在模板基础上拆分 `routes/`。
- 用户表、成绩表 Sequelize 模型设计。
- 用户/昵称/成绩接口桩（详见二、2.2 接口设计）。

**（B）内置分级词库数据**（对应 REQ-DICT-1~5、REQ-ENG-3）
- 7 学段 JSON 数据文件，8 题型覆盖，约 1250 条，本地加载离线可玩。
- 内部统一词条运行时结构（替代原型 `{w,zh,type:en/cn/idiom,conf}`）。

**（C）词库导入解析/校验**（对应 REQ-IMP-1~10）
- 纯文本 → 解析器 → 校验器 → 内部词条结构的完整链路（详见二、2.1.3.3）。
- 7 项校验规则 + 行级错误汇聚 + 敏感词过滤 + 缺省干扰项自动生成。

**（D）昵称设置页**（对应 REQ-NICK-1~4）
- 新版「头像昵称填写能力」（`chooseAvatar` 按钮 + `nickname` input）接入。
- 昵称校验（2~12 字符）与本地持久化。

**（E）工程配置**（对应 REQ-ENG-1、REQ-ENG-3）
- `app.json`/`app.js`/`app.wxss`、5 个页面骨架、`project.config.json` 等。

## 1.2 存量功能详细分析

### 1.2.1 HTML 原型核心逻辑（平移基准）

**接口契约（内部函数与数据结构）**
- 全局状态 `G = { state, score, lives, answered, correctCount, combo, question, options, monster, bullet, particles, popups, checkmark, over }`；`state` 取值集合为 `idle / flying / approaching / dying / failed`（其中 `failed` 为防御性状态，实际答错走 `approaching`）。
- 题目对象 `question = { item, w, blankIdx, correct, letters, filled, filledColor }`；词条对象 `item = { w, zh, type: en|cn|idiom, conf? }`。
- 配置 `CONFIG = { sinkSpeed:13, approach:58, approachTime:0.6, totalQ:10, initLives:3, cannonY, dangerY, monStartY }`。

**业务规则（平移时保持不变）**
- 挖空：`idiom` 挖 `[1, len-1]` 随机位（避开首字）；`cn` 挖 `[0, len-1]` 随机位；`en` 优先挖元音（a/e/i/o/u），无元音随机挖。
- 干扰项：英语元音题从其余元音选；辅音题用形近对（b↔d/p↔q/n↔m/f↔t/s↔z）；易混词用 `conf` 配对字；汉字用 `CN_CONFUSE_MAP` 形近字；不足时从同年级词库补字或兜底字符，最终 4 选项。
- 计分：答对 score+100、combo+1；答错 combo 归零、lives-1；连击 2/3/5 触发中心提示。
- 星级：`correctCount/totalQ` ≥90/70/40% → 3/2/1 星。

**约束与需改造点**
- 原型所有游戏渲染在一个 `game-canvas`（390×500）内完成，HUD 与选项按钮在 Canvas **之外**用 DOM 渲染；平移后这两部分（HUD、选项）建议改用 WXML（减少 Canvas 文本绘制、便于点击），游戏主体（怪兽、炮台、粒子）仍走 Canvas。
- 原型单页 SPA 的屏幕切换，需在 M1 改为 5 个独立 page + 路由导航。
- 原型词条 `type: en/cn/idiom` 需统一映射到 `docs/词库格式规范.md` 的 8 种类型码（映射关系见二、2.3.2 模型实现）。

### 1.2.2 wxcloudrun-express 模板（后端骨架基准）

**接口契约**
- `index.js`：Express 初始化（`express.json/urlencoded` + `cors` + `morgan`），`bootstrap()` 先 `initDB()` 再 `listen(port)`。
- `db.js`：从环境变量 `MYSQL_USERNAME / MYSQL_PASSWORD / MYSQL_ADDRESS` 读配置，`MYSQL_ADDRESS` 形如 `host:port`，数据库名 `nodejs_demo`（M1 重命名为本项目库名），`Sequelize.define` 定义模型，`init()` 执行 `sync({ alter:true })`。
- `index.js` 的 `/api/wx_openid`：当携带 `x-wx-source` 头时，把 `x-wx-openid` 头值原样返回。

**约束**
- 统一响应结构 `{ code, data }`（模板 `/api/count` 已如此），M1 所有接口沿用。
- `sync({ alter:true })` 仅适合骨架期建表；M1 保留该方式，M2 起应引入迁移（migration）。
- 端口 `process.env.PORT || 80`，容器内监听 80（`container.config.json` 的 `containerPort:80`）。

---

# 二、增量设计方案

## 2.1 实现模型

### 2.1.1 上下文视图（总体架构与数据流）

```
┌───────────────────────────────  微信小程序（前端 miniprogram/）  ───────────────────────────────┐
│                                                                                                  │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐                     │
│  │  index   │──▶│  level   │──▶│   game   │──▶│  result  │   │nickname  │   （5 个 page）        │
│  │ (首页)   │   │(关卡选择)│   │(Canvas游戏)│   │ (结算)   │   │(昵称设置)│                      │
│  └──────────┘   └──────────┘   └────┬─────┘   └──────────┘   └──────────┘                     │
│                                      │ Canvas 2D 渲染核心                                        │
│         ┌────────────────────────────┼─────────────────────────────┐                            │
│         │ game/ 目录（平移原型逻辑）                              │                            │
│         │  engine.js(主循环) state.js(状态机) question.js(出题)   │                            │
│         │  renderer.js(绘制) config.js(参数) audio.js(音效占位)   │                            │
│         └────────────────────────────┼─────────────────────────────┘                            │
│                                      │                                                          │
│  ┌────────────────────┐  ┌───────────▼───────────┐  ┌──────────────────────┐                     │
│  │ data/ 内置词库JSON │─▶│ utils/dict.js(装载)   │  │ utils/parser+validator│◀── 词库导入(粘贴)   │
│  │ 7 学段/8题型       │  │ utils/storage.js(存档)│  │ utils/request.js(HTTP)│                     │
│  └────────────────────┘  └───────────┬───────────┘  └──────────┬───────────┘                     │
└──────────────────────────────────────┼──────────────────────────┼────────────────────────────────┘
                                       │  wx.request (HTTPS)      │
                     ┌─────────────────▼──────────────────────────▼──────────────────┐
                     │                  云托管后端（server/ Express）                │
                     │   index.js → routes/ (user.js nickname.js score.js health.js) │
                     │   db.js (Sequelize)        请求头: x-wx-source / x-wx-openid  │
                     └─────────────────────────────────┬──────────────────────────────┘
                                                       │ Sequelize (mysql2)
                                             ┌─────────▼─────────┐
                                             │  MySQL（云托管数据库）│
                                             │  users 表  scores 表 │
                                             └─────────────────────┘
```

**数据流说明**
1. **游戏主链路（离线可玩）**：`index → level → game → result`，全程依赖 `data/` 内置词库 JSON 与 `utils/storage.js` 本地存档，无网络也成立 `(REQ-NFR-2)`。
2. **昵称链路**：`nickname` 页写入本地 `storage`（主要），并可选调用后端 `POST /api/nickname` 同步云端 `(REQ-NICK-2, REQ-API-3)`。
3. **成绩上报链路（可降级）**：`result` 结算后调用 `POST /api/score`，无网时本地暂存、不阻塞游戏 `(REQ-API-4, REQ-NFR-2)`。

**通信协议与频次**
- 前端 → 后端：HTTPS `wx.request`，仅昵称/用户/成绩接口，低频（结算/设置时调用）。
- 后端 → MySQL：Sequelize 连接池，短查询。
- 无消息队列、无缓存中间件（M1 不需要）。

> 对应 REQ：总体架构落地满足 `REQ-ENG-1/2/3`、`REQ-NFR-2`。

### 2.1.2 服务/组件总体架构（目录结构与模块职责）

#### 前端目录结构（miniprogram/）

```
miniprogram/
├── app.js                    # 入口：globalData（用户 openid、昵称、词库缓存）、登录态获取
├── app.json                  # 全局配置：注册 5 个页面、窗口样式、Canvas 组件无需注册
├── app.wxss                  # 全局样式（配色变量、按钮基线样式）
├── project.config.json       # 开发者工具工程配置
├── sitemap.json              # 索引配置
├── pages/
│   ├── index/                # 首页（REQ-GAME-1 入口）
│   │   ├── index.wxml        #   开始游戏、昵称入口、排行榜/错题本占位按钮
│   │   ├── index.wxss
│   │   ├── index.js          #   读取昵称占位、按钮跳转
│   │   └── index.json
│   ├── level/                # 关卡选择（REQ-GAME-14 解锁）
│   │   ├── level.wxml        #   学段 tab + 关卡卡片网格（wx:for）
│   │   ├── level.wxss
│   │   ├── level.js          #   pickGrade / 解锁推导 / 星级渲染
│   │   └── level.json
│   ├── game/                 # 游戏页（REQ-GAME-2）
│   │   ├── game.wxml         #   <canvas type="2d"> + HUD(wxml) + 选项按钮(wxml)
│   │   ├── game.wxss
│   │   ├── game.js           #   页面生命周期：onLoad 初始化 canvas + engine、onUnload 销毁
│   │   └── game.json
│   ├── result/               # 结算（REQ-GAME-11/12/15）
│   │   ├── result.wxml
│   │   ├── result.wxss
│   │   ├── result.js         #   读结算数据、写星级存档、上报成绩
│   │   └── result.json
│   └── nickname/             # 昵称设置（REQ-NICK-1~4）
│       ├── nickname.wxml     #   chooseAvatar 按钮 + nickname 输入框
│       ├── nickname.wxss
│       ├── nickname.js       #   授权容错 + 自定义输入 + 校验 + 保存
│       └── nickname.json
├── game/                     # Canvas 游戏核心（纯逻辑，无 WXML 依赖）
│   ├── config.js             #   CONFIG 集中配置（下沉速度等魔法数字）(REQ-NFR-5)
│   ├── state.js              #   全局状态 G 工厂 + 状态常量（idle/flying/...）
│   ├── question.js           #   出题：挖空规则 + 干扰项生成（平移 genDistractors/newQuestion）
│   ├── renderer.js           #   Canvas 绘制：怪兽/炮台/粒子/弹字/✓（平移 drawXxx 系列）
│   ├── engine.js             #   主循环：update(dt) + render()，挂在 canvas.requestAnimationFrame
│   └── audio.js              #   音效/TTS 占位接口 speak(text,lang)，M1 静默降级
├── data/                     # 内置分级词库 JSON（REQ-DICT-1/2/4）
│   ├── kindergarten.json     #   幼儿园 100
│   ├── primary12.json        #   小学 1-2  150
│   ├── primary34.json        #   小学 3-4  200
│   ├── primary56.json        #   小学 5-6  200
│   ├── junior.json           #   初中     200
│   ├── senior.json           #   高中     200
│   └── college.json          #   大学     200
└── utils/
    ├── constants.js          #   学段枚举、8 类型码枚举、星级阈值、存储 key 名
    ├── dict.js               #   内置词库装载 + 按学段获取 + 随机抽题（REQ-DICT-3/5）
    ├── parser.js             #   纯文本词库解析（REQ-IMP-1）
    ├── validator.js          #   词库 7 项校验（REQ-IMP-2~8）
    ├── sensitive.js          #   敏感词库 + 过滤（REQ-IMP-8）
    ├── storage.js            #   本地存储封装：昵称、星级存档（REQ-NICK-2, GAME-13）
    ├── request.js            #   wx.request 封装 + openid 头透传（REQ-API-5）
    └── toast.js              #   wx.showToast 封装（占位提示）
```

#### 后端目录结构（server/）

```
server/
├── index.js                  # Express 启动 + bootstrap（initDB → listen）
├── db.js                     # Sequelize 实例 + 模型定义 + init/sync（参考模板）
├── models/
│   ├── user.js               #   用户模型
│   └── score.js              #   成绩模型
├── routes/
│   ├── health.js             #   GET /api/health 健康检查（REQ-API-1 验收）
│   ├── user.js               #   POST /api/user 获取/创建用户（REQ-API-2）
│   ├── nickname.js           #   GET/POST /api/nickname（REQ-API-3）
│   └── score.js              #   POST /api/score、GET /api/score/best（REQ-API-4）
├── middlewares/
│   └── openid.js             #   解析 x-wx-source/x-wx-openid → req.openid（REQ-API-5）
├── package.json
├── Dockerfile                #   云托管部署镜像
└── container.config.json     #   云托管容器配置（参考模板）
```

**模块依赖关系（前端核心）**：`game/page（游戏页）` 依赖 `game/engine.js`；`engine` 依赖 `state/question/renderer/audio/config`；`question` 依赖 `data`（经 `utils/dict.js` 装载）与 `utils/constants`；各 page 依赖 `utils/storage/request/toast`。依赖方向单向、无环，符合 `REQ-NFR-6` 可维护性。

### 2.1.3 实现设计文档

本节是 M1 的核心设计落地，含三部分：Canvas 平移方案、核心游戏模块拆分、词库解析/校验方案。

#### 2.1.3.1 Canvas 平移方案（重点）

M1 将 HTML 原型的浏览器渲染与交互，映射到微信原生小程序。整体策略：**游戏主体（怪兽、炮台、粒子、弹字、✓反馈）继续用 Canvas 2D 绘制；HUD 与选项按钮改用 WXML 渲染**（减少 Canvas 文本绘制、原生可点、便于 setData 管理），形成「Canvas 画主体 + WXML 画 HUD/选项」的分层结构 `(REQ-GAME-2, REQ-NFR-3)`。

**（1）核心 API 映射总表**

| 原型（浏览器） | 小程序等价实现 | 说明 |
|---|---|---|
| `<canvas id="game-canvas">` + `canvas.getContext('2d')` | `<canvas type="2d" id="game-canvas">` + `wx.createSelectorQuery().select('#game-canvas').fields({ node:true, size:true })` + `res[0].node.getContext('2d')` | 小程序 Canvas 2D 新接口，节点在回调中取得 |
| 固定 `width=390 height=500` | 按 CSS 逻辑尺寸 × dpr 设物理像素 + `ctx.scale(dpr,dpr)` | dpr（devicePixelRatio）适配，保证清晰不模糊 |
| `requestAnimationFrame(loop)`（window 全局） | `canvasNode.requestAnimationFrame(loop)` | 挂在 Canvas 节点上，页面卸载时取消 |
| `speechSynthesis.speak()` | `audio.js` 提供 `speak(text,lang)`：`wx.createInnerAudioContext()` 播放预录音频，或接入 TTS 插件；M1 未接入时静默降级 | 发音降级，保留统一调用点 |
| `localStorage.getItem/setItem` | `wx.getStorageSync / wx.setStorageSync`（封装进 storage.js） | 本地存档 |
| `button onclick="..."` | WXML `bindtap` / `catchtap`（选项用 `catchtap` 防冒泡） | 事件绑定 |
| `innerHTML`/`createElement` 生成选项按钮 | WXML `wx:for="{{options}}"` + `setData({options})` | 选项列表渲染 |
| `classList.add/remove/toggle` | 需变化的 class 绑定数据字段，`setData` 切换后由 `{{}}` 条件 class 生效 | 样式状态切换 |
| `show(screenId)` 单页屏幕切换 | 小程序 5 个 page，用 `wx.navigateTo`（跳转到下级）/`wx.redirectTo`（替换当前）/`wx.navigateBack`（返回） | 四屏流转 |
| 自绘 `.toast` 浮层 | `wx.showToast({title, icon:'none'})` | 占位提示统一出口 |

**（2）Canvas 获取与 dpr 适配的关键签名**（`game/page/game.js` 的 onReady 阶段）

关键点（非逐行实现）：
- `wx.createSelectorQuery().in(this).select('#game-canvas').fields({ node:true, size:true }).exec(cb)`：回调拿到 `{ node, width, height }`，其中 `width/height` 为**逻辑像素（CSS px）**。
- dpr 适配流程：`dpr = wx.getSystemInfoSync().pixelRatio` → `node.width = width * dpr; node.height = height * dpr` → `ctx = node.getContext('2d'); ctx.scale(dpr, dpr)`。此后绘制坐标系仍以逻辑像素（390×500）为准，与原型 `W/H` 常量完全一致，**原型绘制代码无需改动坐标**。
- 将 `ctx` 与 `canvasNode` 注入 `game/engine.js`，由 engine 管理主循环。

**（3）游戏主循环**

- 用 `canvasNode.requestAnimationFrame(cb)` 替代 `requestAnimationFrame`；`cb` 接收时间戳，`engine.js` 内维护 `last`，计算 `dt = min(0.05, (now-last)/1000)`，与原型 `loop()` 逻辑一致。
- 主循环结构：`update(dt)`（怪兽逼近/下沉、炮弹、粒子、弹字、✓计时）→ `render(ctx)`（clearRect → 天空 → 怪兽 → 炮台 → 炮弹 → 粒子 → ✓）。不受 setData 节奏影响，保证 60fps `(REQ-NFR-1)`。
- 页面 `onUnload/onHide` 时停止 rAF，避免后台空跑耗电。

**（4）HUD 与选项的 setData 策略**

- HUD（命数/得分/题号/提示）与选项按钮放在 `game.wxml`，游戏逻辑通过 `engine.js` 暴露事件回调（如 `onHudChange`、`onOptionsChange`）通知 `game.js` 调用 `setData`。
- setData 仅当数值**实际变化**时触发（分数只在 +100 时、命数只在扣命时、题号只在换题时），避免逐帧 setData 造成渲染开销 `(REQ-NFR-1)`。默认 `W`/`H` 几何与怪兽/粒子动画全走 Canvas，不进 setData。

**（5）发音替代方案（audio.js）**

- 定义统一接口 `speak(text, lang)`；`lang` 由词条类型决定（英语 `en-US`、汉字/成语 `zh-CN`），与原 `speakByItem` 一致。
- M1 实现：优先尝试 `wx.createInnerAudioContext` 播放本地预录音频资源（若资源不存在则静默跳过）；预留 TTS 插件接入点。**当前不加载任何音频资源时，该函数为空实现，保证游戏可玩** `(REQ-NFR-2)`。音效/BGM 完整实现属 M4，本阶段仅留接口 `(spec.md 非目标)`。

#### 2.1.3.2 核心游戏模块拆分（状态机/出题/计分/渲染/音效）

| 模块 | 职责 | 对应原型函数 | 关键接口（签名级） |
|---|---|---|---|
| `state.js` | 状态机定义 + `G` 状态工厂 + `resetGame()` | `G` 初始化、`startGame()` | `createInitialState() → G`；状态常量 `IDLE/FLYING/APPROACHING/DYING/FAILED` |
| `question.js` | 出题、挖空位置计算、干扰项生成 | `newQuestion()`＋`genDistractors()` | `genQuestion(item) → {blankIdx, correct, options}`；`genDistractors(item, blankIdx, correct) → string[4]` |
| `config.js` | 集中配置魔法数字 | `CONFIG` | `CONFIG.sinkSpeed / approach / approachTime / totalQ / initLives / dangerY ...` |
| `engine.js` | 主循环 update/render 编排 + 状态推进（炮弹命中、怪兽逼近/s下沉计时） | `loop/update` | `start(canvasNode, ctx)`、`stop()`；内部 `update(dt)` |
| `renderer.js` | Canvas 绘制全部图形 | `drawSky/drawMonster/drawCannon/drawBullet/drawParticles/drawCheckmark` | `render(ctx, state, now)` |
| `audio.js` | 发音占位 + 音效接口 | `speak/speakByItem` | `speak(text, lang)`、`speakByItem(item, word)` |
| `game.js`（页面） | 桥接：canvas 初始化、setData、把选项点击回调转发给 engine | `fire/onBulletHit/failQuestion/nextQuestion` 的触发 | `handleOptionTap(e)`、`handleHudChange(data)` |

**状态机流转（活动图，语义与原型一致）**

```
[start] → IDLE(待答题)
  IDLE --用户点正确--> FLYING(炮弹飞行) --命中--> DYING(死亡动画≈0.7s) --> [answered+1]/nextQuestion --> IDLE 或 [answered>=totalQ] --> RESULT(结算)
  IDLE --用户点错误--> APPROACHING(逼近+抖动+红闪≈0.6s) --> lives-1、combo=0 --> [lives>0] nextQuestion --> IDLE
                                                               `--> [lives<=0] RESULT(败)
  IDLE --怪兽下沉至dangerY未作答--> 视同答错 --> APPROACHING --> ...
```

- 每个分支标注触发条件与处理策略（答对 +100/combo+1/✓/爆炸/冒星星；答错逼近/扣命/combo归零/填充正确色）。
- 扩展点：`config.js` 为唯一调参与调难度入口，状态机不含业务常数；新增题型仅改 `data/`，不改出题逻辑 `(REQ-NFR-5, REQ-DICT-5)`。
- 事务设计：M1 战斗为纯前端内存态，无数据库事务；仅星级存档写入 `storage.js` 时做「取最大值」判断（原子地比较后写入）`(REQ-GAME-13)`。

#### 2.1.3.3 词库解析/校验方案（模块拆分与算法）

纯文本 → 解析器 → 校验器 → 内部词条的流水线，模块边界清晰 `(REQ-IMP-1~10, REQ-NFR-6)`。

**模块拆分与职责**

| 模块 | 职责 | 关键函数 |
|---|---|---|
| `utils/parser.js` | 文本预处理 + 逐行拆分字段 | `parseText(text) → { items, errors }` |
| `utils/validator.js` | 单行 7 项规则校验 + 行级错误收集 | `validateLine(fields, lineNo, seenSet) → { ok?, item?, error? }` |
| `utils/sensitive.js` | 敏感词库 + 命中过滤 | `containsSensitive(text) → boolean` |
| `utils/dict.js` 内的 `genDistractorsForItem` | 缺省干扰项自动生成（复用 question.js） | `ensureDistractors(item) → string[]` |
| 页面（词库导入入口，M1 可 MVP 挂载于某页） | 汇总全部错误并展示 | 收集 `errors[]` 一次性反馈 |

**解析/校验算法流程**

1. **预处理**：将输入文本全角 `｜` 替换为半角 `|`；按 `\n`（兼容 `\r\n`）切分；去除空行与 `#` 开头注释行（词库规范示例含 `#` 注释）`(REQ-IMP-1)`。
2. **逐行解析**：每行按 `|` 切分为 `[type, q, a, hint, d?]`（d 为可选干扰项，可用 `,` 分隔）。
3. **逐行校验**（validator，顺序执行，命中即记错并继续下一行，不中断）：
   - 类型码 ∈ 8 种 `(REQ-IMP-2)`；
   - 字段数 ≥ 3 `(REQ-IMP-3)`；
   - w2/c2 时 `*` 数量 = `a` 长度 `(REQ-IMP-4)`；
   - 答案字符 ∈ 题目去 `*` 字符集 `(REQ-IMP-5)`；
   - 干扰项不含答案 `(REQ-IMP-6)`；
   - 敏感词过滤 `(REQ-IMP-8)`；
   - 重复题目检测（`seenSet` 记录题目→首次行号）`(REQ-IMP-7)`。
4. **结果汇聚**：合法行转为内部词条；非法行输出 `{ line: N, reason }`；最终 `{ items, errors }`，errors 含**全部**错误（非首个）`(REQ-IMP-9)`。
5. **缺省干扰项补齐**：合法词条若无 `d`，调用 `question.js` 的干扰项生成算法补齐，保证可出题 `(REQ-IMP-10)`。

**关键边界**：校验器为纯函数、无副作用；`seenSet` 作为上下文入参传入，便于单测；敏感词库 `sensitive.js` 用精简数组，命中即停（性能优先）。

---

## 2.2 接口设计

### 2.2.1 总体设计

**接口分类**：M1 后端仅提供「用户」「昵称」「成绩」三组基础接口桩 + 「健康检查」运维接口。所有接口遵循统一响应结构 `{ code, data }`，`code=0` 成功，非 0 为业务错误 `(REQ-API-2~4, spec.md 六节契约)`。

**接口继承/分组**：
- 用户组：`POST /api/user`
- 昵称组：`GET /api/nickname`、`POST /api/nickname`
- 成绩组：`POST /api/score`、`GET /api/score/best`
- 运维组：`GET /api/health`

**OpenID 透传机制（沿用云托管约定）** `(REQ-API-5)`：
- 云托管在转发小程序请求时，会向后端注入 `x-wx-source`（来源标识）与 `x-wx-openid`（用户 OpenID）两个请求头。
- 后端 `middlewares/openid.js` 统一解析：当存在 `x-wx-source` 时，取 `x-wx-openid` 作为 `req.openid`；否则 `req.openid` 为 `undefined`（本地/匿名调用）。
- 涉及用户维度的接口若 `req.openid` 缺失，返回业务错误码。

**接口稳定性等级**：M1 全部接口标记为「实验」级（`/experimental` 逻辑上不做版本号，仅语义约定），M2 排行榜在此基础上扩展，届时再冻结契约。

### 2.2.2 接口清单

#### 分组一：用户接口 `(REQ-API-2)`

**POST `/api/user`** —— 获取或创建用户

- **签名**：`POST /api/user`，请求头 `x-wx-openid`，无 body。
- **业务说明**：识别当前 OpenID 对应用户，存在则返回，不存在则创建并返回。
- **前置条件**：请求携带有 `x-wx-source` + `x-wx-openid`。
- **后置条件**：users 表中存在该 openid 的记录。
- **异常映射**：缺 openid → `{ code: 1001, data: null }`（未识别用户）；DB 错误 → `{ code: 5000 }`。
- **调用示例（响应）**：

```json
{ "code": 0, "data": { "id": 1, "openid": "oXXXX", "nickname": null } }
```

#### 分组二：昵称接口 `(REQ-API-3)`

**GET `/api/nickname`** —— 读取当前用户昵称

- **签名**：`GET /api/nickname`，请求头透传 openid。
- **业务说明**：返回当前用户已保存的昵称（无则 `nickname: null`）。
- **异常映射**：用户不存在 → `{ code: 1001 }`。
- **响应示例**：

```json
{ "code": 0, "data": { "nickname": "小明" } }
```

**POST `/api/nickname`** —— 设置昵称

- **签名**：`POST /api/nickname`，请求头 openid，body `{ "nickname": "小明" }`。
- **业务说明**：校验并写入昵称（2~12 字符、去首尾空白、非空）。
- **前置条件**：用户已创建。
- **后置条件**：users.nickname 更新。
- **异常映射**：昵称为空/超长 → `{ code: 2001 }`（昵称非法）；用户不存在 → `{ code: 1001 }`。
- **请求/响应示例**：

```json
// 请求
{ "nickname": "小明" }
// 成功响应
{ "code": 0, "data": { "nickname": "小明" } }
// 非法响应
{ "code": 2001, "data": null }
```

#### 分组三：成绩接口 `(REQ-API-4)`

**POST `/api/score`** —— 上报一局成绩

- **签名**：`POST /api/score`，请求头 openid，body：

```json
{
  "grade": "primary34",   // 学段标识
  "level": 1,             // 关卡序号
  "score": 820,           // 得分
  "correctCount": 8,      // 答对题数
  "totalQ": 10,           // 总题数
  "maxCombo": 5,          // 最高连击
  "stars": 2              // 星级 0~3
}
```

- **业务说明**：记录一局成绩（字段与 spec.md 已确认的 `score/correctCount/totalQ/maxCombo/stars/时间戳` 一致，`createdAt` 由后端自动写时间戳）。
- **后置条件**：scores 表新增一条记录。
- **异常映射**：字段缺失/非法 → `{ code: 3001 }`；用户不存在 → `{ code: 1001 }`。
- **响应示例**：

```json
{ "code": 0, "data": { "recordId": 42 } }
```

**GET `/api/score/best`** —— 查询历史最佳成绩

- **签名**：`GET /api/score/best?grade=primary34&level=1`，请求头 openid。
- **业务说明**：返回该用户在某「学段+关卡」下的最高星数与最高得分（M1 桩，天然支撑 M2 排行榜扩展）。
- **异常映射**：用户不存在 → `{ code: 1001 }`。
- **响应示例**：

```json
{ "code": 0, "data": { "grade": "primary34", "level": 1, "bestStars": 3, "bestScore": 1000 } }
```

#### 分组四：健康检查 `(REQ-API-1)`

**GET `/api/health`** —— 服务存活探针

- **业务说明**：返回服务与数据库连通状态，供验收「服务启动成功后健康检查返回正常」。
- **响应示例**：

```json
{ "code": 0, "data": { "status": "ok", "db": "connected" } }
```

**统一前后端约定**：`utils/request.js` 封装 `wx.request`，自动附加 openid 相关头（小程序端 openid 由 `wx.cloud` 或后端 `/api/user` 首次换取后缓存于 `app.globalData`），统一解包 `{ code, data }`，`code!==0` 时抛业务错误供页面 toast 展示。为满足 M1「离线可玩」，所有后端调用均做失败静默/降级处理 `(REQ-NFR-2)`。

---

## 2.3 数据模型

### 2.3.1 设计目标

1. **统一词条领域模型**：将原型 `{w,zh,type:en/cn/idiom,conf}` 与 `docs/词库格式规范.md` 的 8 类型码对齐，形成单一运行时词条结构，内置词库 JSON 与导入解析产物共用同一结构 `(REQ-DICT-3/5, REQ-IMP-1)`。
2. **离线可加载**：内置词库随包分发，本地 JSON 装载，不依赖网络 `(REQ-DICT-4, REQ-NFR-2)`。
3. **包体积可控**：约 1250 条词条，JSON 字段用短命名 + 精简提示，估算 < 100KB（含 GZip 更小），满足小程序 2MB 主包限制 `(REQ-NFR-1 派生约束)`。
4. **数据与逻辑解耦**：词库只存数据，出题/挖空/干扰项逻辑集中在 `game/question.js`，新增学段/题型只改数据不改逻辑 `(REQ-DICT-5)`。
5. **后端最小表**：users/scores 两张表，字段覆盖 spec.md 已确认的成绩字段，预留 M2 排行榜扩展空间。

### 2.3.2 模型实现

#### （1）内部词条运行时结构（核心领域对象，TypeScript 接口注释式描述）

```ts
type ItemType = 'w1' | 'w2' | 'c1' | 'c2' | 'xhy' | 'zc' | 'fill' | 'trans';

interface WordItem {
  type: ItemType;        // 8 种题型码之一
  q: string;             // 题目（挖空位以 '*' 标注，未标注交给出题逻辑默认挖）
  a: string;             // 答案
  hint: string;          // 提示 / 释义（英语填中文释义，汉字/成语填释义或拼音）
  d?: string[];          // 干扰项（可选，缺省由 question.js 自动生成）
  grade?: string;        // 学段标识（仅内置词库需要，导入的临时词条可不带）
}

// 运行时题目（出题后派生）：
interface RuntimeQuestion {
  item: WordItem;
  display: string;       // 显示用题目（英语大写化后的形态）
  blankIdx: number;      // 挖空位置下标
  correct: string;       // 正确答案字符
  options: string[];     // 4 个选项（1 正确 + 3 干扰）
}
```

**原型词条 → 规范类型码映射**（编写内置 JSON 时的转换依据）：

| 原型 `type` | 映射到规范 | 说明 |
|---|---|---|
| `en`（单词） | `w1` | 默认挖 1 字母，优先元音 |
| `en` + `conf`（易混词） | `w1`（`d` 内并入 `conf` 配对字） | 易混配对字作为干扰项来源之一 |
| `cn`（单字/词语） | `c1` 或 `zc` | 单字随机挖 1 格；组词语义归 `zc` |
| `idiom`（成语） | `c1` | 挖中间 1 字，避开首字 |

> `w2/c2/xhy/fill/trans` 在原型中无对应，需按规范示例新增内置数据 `(REQ-DICT-2)`。

#### （2）内置词库 JSON 结构（每学段一个文件）

```json
{
  "grade": "primary34",
  "label": "小学 3-4",
  "items": [
    { "type": "w1",  "q": "cat",           "a": "a", "hint": "猫",     "d": ["e", "o", "i"] },
    { "type": "c1",  "q": "守*待兔",        "a": "株", "hint": "不思进取", "d": ["珠", "柱", "林"] },
    { "type": "xhy", "q": "芝麻开花",        "a": "节节高", "hint": "越来越棒" },
    { "type": "fill","q": "I have * apple.","a": "an", "hint": "我有一个苹果", "d": ["a", "the", "one"] }
  ]
}
```

- 字段说明：`q` 含 `*` 时解析器直接取挖空位（w2/c2 仍需校验 `*` 数与答案长度一致）；`q` 无 `*` 时由 `question.js` 默认挖空 `(REQ-DICT-3)`。
- 学段文件清单与规模见 2.1.2 目录（幼儿园 100 … 大学 200）`(REQ-DICT-1)`。
- `utils/dict.js` 提供 `loadByGrade(grade)`、`randomItem(grade, exclude?)`，为各学段抽题入口。

#### （3）玩家本地存储 schema（`utils/storage.js` 统一封装）

| 存储 key | 值结构 | 用途 | 对应 REQ |
|---|---|---|---|
| `ww_nickname` | `string` | 玩家昵称（2~12 字符） | REQ-NICK-2 |
| `ww_avatar` | `string`（临时路径/url） | 头像（可选） | REQ-NICK-1 |
| `ww_stars` | `{ "<grade>:<level>": number }`（星级 0~3） | 各关卡最高星级存档，取历史最大值 | REQ-GAME-13/14 |
| `ww_pending_scores` | `ScoreReport[]` | 无网时待上报成绩本地暂存队列 | REQ-NFR-2 |

> 关卡解锁状态不单独存储，由 `ww_stars` 推导：第 1 关默认解锁，第 N 关需第 N-1 关 ≥1 星 `(REQ-GAME-14, spec.md 5.2)`。单局进行中的得分/命数/题号等为**内存态**，不持久化 `(spec.md 5.2)`。

#### （4）MySQL 表设计（Sequelize 模型）

**users 表** —— 用户维度 `(REQ-API-2/3)`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK, AUTO_INCREMENT | 主键 |
| openid | STRING(64) | UNIQUE, NOT NULL | 微信 OpenID |
| nickname | STRING(32) | NULL | 昵称（2~12 字符，云端镜像字段） |
| avatar_url | STRING(255) | NULL | 头像 URL（预留） |
| createdAt / updatedAt | DATE | 自动 | 时间戳（Sequelize 默认） |

**scores 表** —— 成绩维度 `(REQ-API-4)`

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | INTEGER | PK, AUTO_INCREMENT | 主键 |
| user_id | INTEGER | FK → users.id, NOT NULL | 所属用户 |
| grade | STRING(16) | NOT NULL | 学段标识 |
| level | INTEGER | NOT NULL | 关卡序号 |
| score | INTEGER | NOT NULL | 得分 |
| correct_count | INTEGER | NOT NULL | 答对题数 |
| total_q | INTEGER | NOT NULL | 总题数 |
| max_combo | INTEGER | NOT NULL | 最高连击 |
| stars | INTEGER | NOT NULL | 星级 0~3 |
| createdAt | DATE | 自动 | 上报时间戳 |

**Sequelize 模型定义**（`models/user.js`、`models/score.js`，参照模板 `db.js` 的 `Sequelize.define` 风格）：
- `db.js` 建立 Sequelize 实例与关联：`User.hasMany(Score, { foreignKey: 'user_id' })`；`init()` 执行 `sync({ alter: true })`（M1 骨架期建表，M2 起改 migration）。
- 数据库名由模板 `nodejs_demo` 改为本项目库名（如 `word_warrior`），配置仍通过环境变量 `MYSQL_ADDRESS / MYSQL_USERNAME / MYSQL_PASSWORD` 注入。

---

## 2.4 关键技术风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| **Canvas 60fps 性能**：过多绘制或频繁 setData 导致掉帧 | 违反 REQ-NFR-1 | ① 动画全部走 Canvas，setData 仅更新 HUD/选项且仅在值变化时触发；② 粒子设上限（如 ≤ 200）、对象复用以减少 GC；③ `dt` 钳制 `min(0.05,...)` 防止跳帧穿模；④ 页面 onUnload 停止 rAF |
| **setData 频率失控** | 卡顿、渲染抖动 | ① HUD/选项剥离出 Canvas，进 WXML；② 抽题/换题/命中时批量 setData（合并为一次对象）；③ 游戏主循环内**禁止** setData 调用 |
| **TTS 兼容性**：小程序无 `speechSynthesis` | 发音功能缺失 | M1 静默降级为空实现，保留 `audio.js` 统一入口；后续接入 `wx.createInnerAudioContext` 预录音或 TTS 插件，游戏主流程不受阻（REQ-NFR-2） |
| **包体积超限**（约 1250 条词条 + 形近字表 + 敏感词库） | 主包 > 2MB 无法发布 | ① JSON 短字段名 + 精简提示；② `CN_CONFUSE_MAP` 形近字表按需精简，或拆到公共数据按学段使用；③ 敏感词库用精简数组；④ 必要时词库放分包/异步加载 |
| **Canvas 2D 基础库兼容** | type="2d" 在低版本基础库不可用 | ① `app.json` 或运行时检测 `wx.getSystemInfoSync().SDKVersion`，低于 2.9.0 时提示升级；② 设计上锁定目标基础库 ≥ 2.9.0（REQ-NFR-3） |
| **MySQL 连接失败** | 后端启动异常 | `initDB()` 失败时捕获并打印明确错误、终止启动（与模板一致，满足 REQ-API-1 验收） |
| **离线成绩上报丢失** | 成绩未入云端 | 本地 `ww_pending_scores` 暂存 + 恢复网络后重试补报，静默失败不阻塞（REQ-NFR-2） |
| **形近字表/干扰项数据质量** | 干扰项教学意义弱 | 复用原型已验证的 `CN_CONFUSE_MAP` 与英语形近/易混规则；不足时兜底补齐，保证 4 选项唯一（REQ-GAME-5） |
| **昵称授权容错** | 拒绝授权导致流程卡死 | 采用新版能力：`chooseAvatar` 按钮 + `nickname` input 双通道，拒绝后引导手动输入，不阻塞进入游戏（REQ-NICK-1/4） |

---

# 附录：REQ 追溯矩阵

| 设计点（章节） | 关联 REQ |
|---|---|
| 前端/后端目录结构、工程骨架 | REQ-ENG-1/2/3 |
| 总体架构与数据流（离线可玩链路） | REQ-ENG-1、REQ-NFR-2 |
| Canvas 平移方案（API 映射/dpr/主循环/HUD setData/发音降级） | REQ-GAME-2、REQ-NFR-1/3 |
| 状态机拆分（idle/flying/approaching/dying/failed） | REQ-GAME-1/6/7/8 |
| 出题挖空规则（元音/中间字/随机） | REQ-GAME-4 |
| 干扰项生成（4 选项不重复、教学意义） | REQ-GAME-5、REQ-IMP-10 |
| 计分/连击/一题一次/答错逼近/下沉判负 | REQ-GAME-6/7/8/9 |
| 空格呼吸反馈、✓/爆炸/冒星 | REQ-GAME-6/10 |
| 3 命制、10 题一关 | REQ-GAME-3 |
| 星级评定与取最优、解锁规则、结算数据 | REQ-GAME-11/12/13/14/15 |
| 内置词库 JSON（7 学段 8 题型 1250 条） | REQ-DICT-1/2/3/4/5 |
| 词条运行时结构 + 类型码映射 | REQ-DICT-3、REQ-IMP-1 |
| 玩家本地存储 schema（昵称/星级/待上报队列） | REQ-NICK-2、REQ-GAME-13/14、REQ-NFR-2 |
| 昵称设置页（chooseAvatar + nickname 兜底 + 校验） | REQ-NICK-1/3/4 |
| 词库解析/校验流水线（7 项规则 + 行级错误 + 敏感词） | REQ-IMP-1~9 |
| 后端接口桩（user/nickname/score/health）+ OpenID 透传 | REQ-API-1~5 |
| MySQL 表设计（users/scores Sequelize 模型） | REQ-API-2/3/4 |
| 参数集中配置（config.js） | REQ-NFR-5 |
| 模块拆分与可维护性、数据逻辑解耦 | REQ-NFR-6、REQ-DICT-5 |
| 关键风险与对策（性能/setData/TTS/包体积/兼容/DB/离线/昵称容错） | REQ-NFR-1/2/3/4、REQ-API-1、REQ-NICK-1 |

> 覆盖 spec.md 全部 48 条 REQ（ENG 3 + GAME 15 + DICT 5 + NICK 4 + IMP 10 + API 5 + NFR 6），无遗漏。