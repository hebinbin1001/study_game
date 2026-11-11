'use strict';

/**
 * e2e/lib/modules.js —— 用例的模块划分与「改动 → 该跑什么」映射
 *
 * 为什么有这份文件（用户 2026-09-13 要求）：
 *   原来「改一行也要跑 17 阶段全套（约 12 分钟）」效率太低。用户要求：
 *   **平时只跑跟这次改动相关的模块，上线前再跑全量。**
 *
 * 用法（由 e2e/run-all.js 解析这些参数）：
 *   node e2e/run-all.js --module=challenge        # 只跑闯关/玩法线相关
 *   node e2e/run-all.js --module=game,puzzle      # 多个模块（逗号分隔）
 *   node e2e/run-all.js --changed                 # 看 git 改了哪些文件，自动推导模块
 *   node e2e/run-all.js --list-modules            # 打印模块表 + 未归属的单测文件
 *   node e2e/run-all.js                           # 全量（上线前跑这个）
 *
 * 约定：
 *   · 选模块时**自动带上 static**（语法/结构/WXSS，约 8 秒，任何改动都值得跑），
 *     想跳过用 `--no-static`。
 *   · 单测按「文件名前缀」归属模块；没被任何模块认领的测试文件会在 --list-modules 里列出来，
 *     请补进对应模块（不然平时跑模块会漏掉它）。
 *   · 公共文件（utils/dict.js、utils/constants.js、app.json）刻意映射到多个模块 —— 它们被到处引用，
 *     改了就要跑宽一点，这是有意的，别「优化」掉。
 *   · 只有「上线前」或「改动面很大」时才跑全量；改成模块化就是因为原来每次改一行都要 12 分钟。
 */

const { spawnSync } = require('child_process');

/**
 * 模块表。
 *   stages：e2e/run-all.js 里的阶段 id
 *   unit：tests/unit 下测试文件的文件名片段（任一命中即属于本模块）
 */
const MODULES = [
  {
    id: 'static',
    name: '静态护栏（语法 / 结构 / WXSS / 设计令牌）',
    stages: ['syntax', 'structure', 'wxss', 'tokens', 'navseam', 'taps'],
    // 2026-11-06：「改动→模块」映射本身的护栏（漏映射会让 --changed 静默漏跑）。
    // 挂在 static 下：任何改动都会带上静态护栏，顺手就把映射表校验一遍。
    unit: ['modules-map']
  },
  {
    id: 'assets',
    name: '资源与包体（图片音频限额 / 打包目录纯净度）',
    stages: ['assets'],
    unit: ['art-url', 'assets-limit', 'skins-cdn', 'avatar-upload',
      // 2026-11-06 补登记：玩法图标走 CDN（art/game-icons），改图标/目录必须过包体护栏
      'game-icons']
  },
  {
    id: 'dict',
    name: '词库与常量（题库解析 / 校验 / 敏感词 / 学段题型）',
    stages: ['bank'],
    unit: ['constants', 'data', 'dict', 'bank', 'level-picker', 'parser', 'validator', 'sensitive',
      'book-words', 'book-keys-parity', 'ipa',
      // 2026-10-28 词条例句（键悬空 / 句子不含该词 / 缺翻译都只影响显示，不会报错）
      'examples',
      // 2026-11-06 补登记：题库与教材同步（越级词 / 音标 / 版本覆盖）+ 类型码中文名
      'book-sync', 'type-label']
  },
  {
    id: 'challenge',
    name: '闯关与玩法线（主线 30 关 / 关卡页 / 玩法线 / 星级命名空间）',
    stages: ['challenge', 'lines'],
    unit: ['challenge', 'challenge-lines', 'challenge-rewards', 'stars-reachable', 'next-level', 'rng',
      // 2026-11-06 补登记：云端成绩恢复关卡记录（app.js / level.js 都会调）
      'star-recovery']
  },
  {
    id: 'game',
    name: '字母射击对局与结算（引擎 / 出题 / 渲染 / 结算页）',
    stages: ['game', 'result'],
    unit: ['shoot', 'question', 'battle-fx',
      // 2026-11-06 补登记：暂停弹层与固定操作按钮图标（对局公共组件，漏挂是静默失效）
      'game-pause', 'ui-icons',
      // 2026-11-11 分享图卡（结算页在用；段位页在 user 模块）
      'share-image']
  },
  {
    id: 'wordgames',
    name: '题库类玩法（连连看 / 消消乐 / 拼词 / 成语 / 贪吃蛇 / 弹弹球 / 抢答）',
    stages: ['link', 'snake', 'bounce', 'quiz', 'letterBubble'],
    unit: ['word-build', 'quiz', 'quiz-bank', 'bounce', 'letter-bubble', 'battle-fx',
      // 2026-10-28 玩法上报口径（休闲只给星、字词必须带真实题量）
      'casual-play-report',
      // 2026-10-28 首次进入的操作引导（21 个玩法页各挂一处，漏挂是静默失效）
      'game-howto',
      // 2026-11-06 补登记：暂停弹层 / 固定操作按钮图标（14 个玩法页共用）
      'game-pause', 'ui-icons']
  },
  {
    id: 'puzzle',
    name: '数字智力（24点 / 数独 / 华容道 / 2048 / 天平 / 口算 / 记忆 / 一笔画 / 找规律 / 认钟表 / 迷宫 / 汉诺塔）',
    stages: ['math24', 'klotski', 'g2048', 'puzzleLevel'],
    unit: ['balance', 'math-sprint', 'memory-grid', 'one-stroke', 'pattern', 'clock', 'maze', 'hanoi', 'math24-levels',
      'klotski', 'klotski-levels', 'g2048-levels', 'sudoku-stages', 'puzzle-levels',
      'sprint-balance-grade', 'casual-play-report',
      // 2026-11-06 补登记：断点续玩（存档模块 + 6 个数字智力页的接线）、暂停弹层、
      // 玩法图标（CDN 目录与页面兜底）
      'puzzle-resume', 'game-pause', 'ui-icons', 'game-icons']
  },
  {
    id: 'user',
    name: '用户与成长（段位 / 成就 / 皮肤 / 错题本 / 复习 / 签到）',
    stages: ['m2m4', 'rank', 'dailyCheckin', 'wrongBookUx', 'wrongReviewFlow'],
    unit: ['achievement-view', 'achievements', 'avatar-unlock', 'skins', 'rank-ladder',
      'progress', 'ebbinghaus', 'wrong-book-view', 'wrong-book', 'review', 'rank-badge',
      'auth-guard', 'admin-auth', 'rel-time',
      // 2026-10-28 三档字号：设置页的开关 + 全站 52 个页面的 page-meta 覆盖
      'font-scale',
      // 2026-10-08 补登记：这两个一直没归到模块，跑 --module=user 时会漏掉
      'exam-gate', 'nickname-util', 'ranklist-sql-alias', 'pk-ui', 'daily-checkin-flow',
      // 2026-10-25 错题复习十题一关
      'wrong-review-flow', 'study-pages-ux',
      // 2026-10-28 字词定级测（推荐年级会写进全局设置，判错整站错档）
      'level-test',
      // 2026-10-28 生词本（字段规范化错了会让同一个词存成两条）
      'favorite-book',
      // 2026-11-06 补登记：管理端运营控制、皮肤墙布局、换肤回首页、段位封顶存量修复、
      // 云端成绩恢复、类型码中文名、断点续玩的页面接线
      'admin-controls', 'avatar-layout', 'avatar-skin-equip', 'backfill-exam-tier',
      'star-recovery', 'type-label', 'puzzle-resume-pages']
  },
  {
    id: 'social',
    name: '每日挑战 / 赛季 / 好友 PK（2026-10-08 三件套）',
    stages: ['social'],
    unit: ['beijing-time', 'pk-rules', 'season-rewards', 'seed-parity', 'grade-keys-parity',
      'quick-quiz', 'day-key',
      // 2026-10-28 订阅消息（首个场景就是 PK 被应战，挂在 social 下）
      'subscribe']
  },
  {
    id: 'server',
    name: '云托管后端（接口 / 模型 / Sequelize 用法）',
    stages: [],
    unit: ['sequelize-operators', 'rank-stars', 'checkin-rewards', 'rank-eligibility',
      'admin-query', 'game-names', 'seed-parity', 'grade-keys-parity', 'ensure-tables',
      // 2026-10-29 补签卡：streak 重算算错会让用户从那天起每天的连续天数都错
      'makeup-card',
      // 2026-11-06 补登记：管理端服务端约束 + 老用户段位封顶存量修复
      'admin-controls', 'backfill-exam-tier',
      // 2026-11-11 埋点事件校验（白名单 / 截断 / 北京时间分桶 / 次日回访判定）
      'track-events']
  },
  {
    id: 'pages',
    name: '页面渲染回归与真机黑屏探针（35 页）',
    stages: ['pages', 'load'],
    unit: ['play-counts', 'index-entries',
      // 2026-11-06 补登记：断点续玩的 6 个页面接线（关卡页 / 2048 / 华容道 / 汉诺塔…）
      'puzzle-resume-pages',
      // 2026-11-11 埋点客户端（队列 / 环境闸门 / 失败保留 / 分享进入识别）
      'track-client',
      // 2026-11-11 分享图卡（段位页在用；结算页在 game 模块）
      'share-image']
  },
  {
    id: 'tools',
    name: '运营工具（公众号排版：配置解析 / HTML 生成）',
    stages: [],
    unit: ['mp-article']
  }
];

/** 阶段 id → 模块 id（run-all 用它把阶段归到模块下） */
const STAGE_MODULE = {
  syntax: 'static',
  structure: 'static',
  wxss: 'static',
  tokens: 'static',
  navseam: 'static',
  taps: 'static',
  assets: 'assets',
  unit: '(unit)',
  game: 'game',
  result: 'game',
  math24: 'puzzle',
  link: 'wordgames',
  snake: 'wordgames',
  bounce: 'wordgames',
  klotski: 'puzzle',
  g2048: 'puzzle',
  challenge: 'challenge',
  pages: 'pages',
  m2m4: 'user',
  load: 'pages',
  lines: 'challenge'
  ,
  puzzleLevel: 'puzzle'
  ,
  reports: 'user'
  ,
  bank: 'dict'
  ,
  rank: 'user'
  ,
  quiz: 'wordgames'
  ,
  letterBubble: 'wordgames'
  ,
  admin: 'user'
  ,
  dailyCheckin: 'user'
  ,
  wrongBookUx: 'user'
  ,
  // 2026-10-25 错题复习十题一关（不补这一行，--module=user 会静默跳过这个阶段）
  wrongReviewFlow: 'user'
  ,
  social: 'social'
};

/**
 * 改动文件 → 模块。`--changed` 用这份规则推导该跑哪些模块。
 * 说明：宁可多跑一个模块，也别漏 —— 漏掉的代价是「提交了红代码」。
 */
const PATH_RULES = [
  // 公共入口：影响所有页面（含按需注入），至少跑静态 + 页面回归
  { re: /^miniprogram\/app\.json$/, modules: ['static', 'pages'] },
  { re: /^miniprogram\/app\.wxss$/, modules: ['static', 'pages'] },
  // 2026-10-28 app.js 里包了一层全局 Page 构造器（注入字号倍率），改错会影响所有页面
  { re: /^miniprogram\/app\.js$/, modules: ['static', 'pages'] },
  { re: /^miniprogram\/utils\/font-scale\.js$/, modules: ['user', 'pages'] },
  { re: /^miniprogram\/project(\.private)?\.config\.json$/, modules: ['static'] },
  { re: /^miniprogram\/sitemap\.json$/, modules: ['static'] },

  // 闯关 / 玩法线
  { re: /^miniprogram\/utils\/(challenge|challenge-rewards)\.js$/, modules: ['challenge'] },
  { re: /^miniprogram\/utils\/rng\.js$/, modules: ['challenge', 'game'] },
  { re: /^miniprogram\/pages\/level\//, modules: ['challenge'] },
  { re: /^miniprogram\/pages\/index\//, modules: ['challenge', 'pages'] },

  // 字母射击对局
  { re: /^miniprogram\/game\/(engine|question|state|renderer|config|audio)\.js$/, modules: ['game'] },
  { re: /^miniprogram\/pages\/(game|result)\//, modules: ['game'] },

  // 题库类玩法
  { re: /^miniprogram\/game\/(link|word-build)\.js$/, modules: ['wordgames'] },
  { re: /^miniprogram\/pages\/(link|match|snake|word-build|idiom-build)\//, modules: ['wordgames'] },
  { re: /^miniprogram\/pages\/playlist\//, modules: ['wordgames', 'puzzle', 'pages'] },

  // 数字智力
  // one-stroke-levels：2026-10-18 从 demo 移植的 35 关关卡表，改它必须跑 puzzle
  { re: /^miniprogram\/game\/(klotski|math24|math-sprint|memory-grid|one-stroke(-levels)?|pattern|clock|maze|hanoi|sudoku|tw2048|balance)\.js$/,
    modules: ['puzzle'] },
  // 词条例句（2026-10-28）：改例句只影响错题卡上那行小字，顺带跑 user 是因为
  // 错题卡的渲染护栏在那边（wrong-book-view）
  { re: /^miniprogram\/data\/examples\.js$/, modules: ['dict', 'user'] },
  { re: /^miniprogram\/data\//, modules: ['dict', 'challenge', 'game', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/pages\/bounce\//, modules: ['wordgames'] },
  // 玩法操作引导（2026-10-28）：文案 + 组件 + 21 个玩法页的挂载点
  { re: /^miniprogram\/utils\/game-howto\.js$/, modules: ['wordgames', 'puzzle', 'challenge'] },
  { re: /^miniprogram\/components\/how-to-play\//, modules: ['wordgames', 'puzzle'] },
  { re: /^miniprogram\/pages\/(math24|math-sprint|memory-grid|math-balance|one-stroke|pattern|clock|maze|hanoi|sudoku|g2048|klotski)\//,
    modules: ['puzzle'] },

  // 用户与成长
  // 每日挑战 / 赛季 / 好友 PK（2026-10-08）：页面自成一块，但也会带动首页/我的页
  { re: /^miniprogram\/pages\/(daily-challenge|season|pk)\//, modules: ['social', 'pages'] },
  { re: /^miniprogram\/utils\/quick-quiz\.js$/, modules: ['social', 'dict'] },
  { re: /^miniprogram\/utils\/day-key\.js$/, modules: ['social'] },
  { re: /^e2e\/verify-daily-season-pk\.js$/, modules: ['social'] },
  { re: /^e2e\/verify-daily-checkin\.js$/, modules: ['user'] },
  { re: /^e2e\/verify-bank\.js$/, modules: ['dict', 'user'] },
  { re: /^e2e\/verify-wrong-book-ux\.js$/, modules: ['user'] },
  { re: /^miniprogram\/pages\/(me|rank|achievement|avatar|nickname|wrong-book|wrong-review|favorite|checkin|daily-question|report|custom-levels|level-editor|level-share)\//,
    modules: ['user'] },
  { re: /^miniprogram\/pages\/bank\//, modules: ['dict', 'user'] },
  // 定级测（2026-10-28）：跨 14 个学段取词估词量，动 dict/词库也会牵连它
  { re: /^miniprogram\/pages\/level-test\//, modules: ['user', 'pages', 'dict'] },
  { re: /^miniprogram\/utils\/level-test\.js$/, modules: ['user', 'dict'] },
  // 管理后台（2026-09-29）：页面在端上、规则在后端，两边都得验；页面清单也要跟着跑
  { re: /^miniprogram\/pages\/admin\//, modules: ['user', 'server', 'pages'] },
  { re: /^miniprogram\/utils\/(storage|auth|skins|review|wrong-book-view|achievement-view|rel-time)\.js$/,
    modules: ['user'] },
  // 2026-11-06：以下公共模块此前不在「改动 → 该跑什么」映射里，改它们只能靠人记 —— 补上。
  { re: /^miniprogram\/utils\/star-recovery\.js$/, modules: ['user', 'challenge'] },
  { re: /^miniprogram\/utils\/puzzle-resume\.js$/, modules: ['puzzle', 'pages'] },
  // 暂停弹层 / 结算弹层的图标映射，玩法页共用
  { re: /^miniprogram\/utils\/ui-icons\.js$/, modules: ['game', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/utils\/type-label\.js$/, modules: ['user', 'dict'] },
  { re: /^miniprogram\/utils\/game-catalog\.js$/, modules: ['puzzle', 'wordgames', 'pages'] },
  // 2026-11-06：上面只补了一部分，实测仍有 144/320 个文件推导不出模块（见
  // tests/unit/modules-map.test.js 的护栏）。根因是 2026-10-28 把 21 个玩法页从
  // `pages/` 搬到 `pkg-games/`、公共组件与半数 utils 从来就没进过映射表 ——
  // 于是改这些文件时 `--changed` 会打印「没有映射」然后只跑静态护栏。
  // 下面按目录补齐；共享组件刻意映射到多个模块（改一个组件会牵连多类玩法）。
  { re: /^miniprogram\/pkg-games\/level\//, modules: ['challenge'] },
  // 2026-11-11「主包内未使用 js」治理：只被分包引用的引擎 / 关卡数据 / 工具已从主包移入
  // pkg-games（engine / data / utils）。改这些 = 改对应玩法，必须跑对应模块。
  { re: /^miniprogram\/pkg-games\/engine\/(shoot|config|question)\.js$/, modules: ['game'] },
  { re: /^miniprogram\/pkg-games\/engine\/(link|word-build|quiz|quiz-bank|letter-bubble)\.js$/,
    modules: ['wordgames'] },
  { re: /^miniprogram\/pkg-games\/engine\//, modules: ['puzzle'] },
  { re: /^miniprogram\/pkg-games\/data\/.*-levels\.js$/, modules: ['puzzle'] },
  { re: /^miniprogram\/pkg-games\/utils\/(battle-fx|play-report)\.js$/,
    modules: ['game', 'wordgames', 'puzzle', 'user'] },
  { re: /^miniprogram\/pkg-games\/utils\/(puzzle-levels|puzzle-progress|puzzle-resume)\.js$/,
    modules: ['puzzle', 'pages'] },
  { re: /^miniprogram\/pkg-games\/utils\/challenge-rewards\.js$/, modules: ['challenge'] },
  { re: /^miniprogram\/pkg-games\/utils\/game-status\.js$/, modules: ['server', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/pkg-games\/utils\/review\.js$/, modules: ['user'] },
  { re: /^miniprogram\/pkg-games\/puzzle-level\//, modules: ['puzzle'] },
  { re: /^miniprogram\/pkg-games\/(game|result)\//, modules: ['game'] },
  { re: /^miniprogram\/pkg-games\/(link|match|snake|word-build|idiom-build|quiz|bounce|letter-bubble)\//,
    modules: ['wordgames'] },
  { re: /^miniprogram\/pkg-games\/(math24|math-sprint|math-balance|memory-grid|one-stroke|pattern|clock|maze|hanoi|g2048|klotski|sudoku)\//,
    modules: ['puzzle'] },
  // 公共组件：对局/结算/暂停/进度条/战士徽章被 14~21 个玩法页共用
  { re: /^miniprogram\/components\/(game-hud|settle-pop|battle-fx|game-pause|warrior-badge)\//,
    modules: ['game', 'wordgames', 'puzzle'] },
  // 年级选择器：首页 / 关卡页 / 玩法页 / 我的页四处都用
  { re: /^miniprogram\/components\/grade-picker\//, modules: ['challenge', 'wordgames', 'puzzle', 'pages'] },
  // 其余公共 utils（此前一个都没映射）
  { re: /^miniprogram\/utils\/(avatar-upload)\.js$/, modules: ['user', 'assets'] },
  { re: /^miniprogram\/utils\/(bank|level-picker)\.js$/, modules: ['dict', 'user'] },
  { re: /^miniprogram\/utils\/(battle-fx)\.js$/, modules: ['game', 'wordgames'] },
  { re: /^miniprogram\/utils\/(boss-ladder)\.js$/, modules: ['challenge', 'game', 'pages'] },
  { re: /^miniprogram\/utils\/(ebbinghaus|rank-badge)\.js$/, modules: ['user'] },
  { re: /^miniprogram\/utils\/(rank-ladder)\.js$/, modules: ['user', 'server'] },
  { re: /^miniprogram\/utils\/(game-status)\.js$/, modules: ['server', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/utils\/(play-counts)\.js$/, modules: ['pages', 'user'] },
  { re: /^miniprogram\/utils\/(puzzle-levels|puzzle-progress)\.js$/, modules: ['puzzle'] },
  // 主包里漏掉的两个页面（rank 规则只匹配 `pages/rank/`，rank-info / rank-exam 不命中）
  { re: /^miniprogram\/pages\/rank-(info|exam)\//, modules: ['user'] },
  // 玩法引擎：quiz / letter-bubble 是词库类引擎，shoot 是字母射击
  { re: /^miniprogram\/game\/(quiz|quiz-bank|letter-bubble)\.js$/, modules: ['wordgames'] },
  { re: /^miniprogram\/game\/shoot\.js$/, modules: ['game'] },
  { re: /^miniprogram\/utils\/art\.js$/, modules: ['user', 'assets'] },

  // 公共模块：刻意映射到多个模块（改一处会牵连多处）
  { re: /^miniprogram\/utils\/dict\.js$/, modules: ['dict', 'challenge', 'game', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/utils\/constants\.js$/, modules: ['dict', 'challenge', 'game', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/utils\/play-report\.js$/, modules: ['game', 'wordgames', 'user'] },
  // 埋点（2026-11-11）：入口在 app.js、玩法出口在 play-report、开局在 level/puzzle-level，
  // 还有 share_open 识别 —— 改它要连带跑页面/闯关/数字智力/玩法/用户几个模块
  { re: /^miniprogram\/utils\/track\.js$/, modules: ['pages', 'challenge', 'puzzle', 'game', 'wordgames', 'user'] },
  // 分享图卡（2026-11-11）：结算页（game 模块）与段位页（user 模块）共用
  { re: /^miniprogram\/utils\/share-image\.js$/, modules: ['game', 'user', 'pages'] },
  { re: /^miniprogram\/utils\/request\.js$/, modules: ['user', 'server'] },
  { re: /^miniprogram\/pages\/(study|agreement|share-card|daily-question)\//, modules: ['pages', 'user'] },
  { re: /^miniprogram\/pages\/settings\//, modules: ['user', 'pages'] },

  // 资源
  { re: /^miniprogram\/assets\//, modules: ['assets', 'pages'] },
  { re: /^art\//, modules: ['assets'] },

  // 后端与词库工具
  { re: /^server\/(beijing-time|pk-rules|season-rewards|seed|grade-keys|book-keys|score-formula|reward-stars|table-missing)\.js$/,
    modules: ['social', 'server'] },
  { re: /^server\/routes\/(daily-challenge|season|pk)\.js$/, modules: ['social', 'server'] },
  // 2026-10-28 订阅消息：场景表 + 端上封装 + 配置/上报路由
  { re: /^server\/subscribe\.js$/, modules: ['social', 'server'] },
  { re: /^server\/routes\/subscribe\.js$/, modules: ['social', 'server'] },
  { re: /^miniprogram\/utils\/subscribe\.js$/, modules: ['social', 'pages'] },
  { re: /^server\/routes\/(daily|checkin)\.js$/, modules: ['user', 'server'] },
  // 签到核心与补签卡规则（2026-10-29）：两个打卡入口共用，改错会同时影响
  // 「每日一题能签到」和「手动签到」，所以两边的用例都要跑
  { re: /^server\/(checkin-core|makeup-card)\.js$/, modules: ['user', 'server'] },
  { re: /^server\/models\/makeup-card\.js$/, modules: ['user', 'server'] },
  { re: /^server\/wrong-book\.js$/, modules: ['user', 'server'] },
  // 生词本（2026-10-28）：纯逻辑与路由都归 user 模块，页面在 pages/favorite
  { re: /^server\/favorite-book\.js$/, modules: ['user', 'server'] },
  { re: /^server\/routes\/favorite\.js$/, modules: ['user', 'server'] },
  // 排行榜后端：页面在 user 模块，SQL 规则也在那里验
  { re: /^server\/routes\/ranklist\.js$/, modules: ['user', 'server'] },
  { re: /^server\//, modules: ['server'] },
  { re: /^tools\/dict\//, modules: ['dict'] },
  // 公众号排版工具（2026-09-30）：纯 Node 侧脚本，不进小程序包，但改动要过语法 + 它自己的单测
  { re: /^tools\/wechat-mp\//, modules: ['tools'] },
  { re: /^(Dockerfile|\.dockerignore|container\.config\.json|cloudbaserc\.json)$/, modules: ['server', 'assets'] },

  // 测试自身的改动：按文件名归位
  // 纯文档 / 演示页：不需要跑任何用例（选模块仍会带上 static，8 秒，无害）
  { re: /^docs\//, modules: [] },
  { re: /^demo\//, modules: [] },
  { re: /^assets-src\//, modules: [] },
  { re: /^(README\.md|\.gitignore|\.dockerignore)$/, modules: [] },
  // 2026-11-06：仓库根的其他 md（AGENTS.md / 小程序项目档案.md）与 .codeartsdoer/ 规格文档
  // 之前没有映射，--changed 会打「没有映射」的警告（纯文档，本来就不需要跑用例）
  { re: /^[^/]+\.md$/, modules: [] },
  { re: /^\.codeartsdoer\//, modules: [] },
  { re: /^e2e\/verify-(game|result)\.js$/, modules: ['game'] },
  { re: /^e2e\/verify-(link|snake)\.js$/, modules: ['wordgames'] },
  { re: /^e2e\/verify-(math24|klotski|g2048)\.js$/, modules: ['puzzle'] },
  { re: /^e2e\/verify-(challenge|lines)\.js$/, modules: ['challenge'] },
  { re: /^e2e\/verify-admin\.js$/, modules: ['user', 'server'] },
  { re: /^e2e\/verify-(all-pages|m2m4)\.js$/, modules: ['pages', 'user'] },
  { re: /^e2e\/probe-pages-load\.js$/, modules: ['pages'] },
  { re: /^e2e\/(check-assets|check-wxss|structure-check|syntax-check-all|check-nav-seam)\.js$/, modules: ['static', 'assets'] },
  { re: /^e2e\//, modules: ['static'] },
  { re: /^tests\/unit\//, modules: [] }   // 见 unitModulesForPath（按文件名直接归位）
];

function moduleById(id) {
  for (let i = 0; i < MODULES.length; i++) {
    if (MODULES[i].id === id) return MODULES[i];
  }
  return null;
}

/** 全部模块 id */
function ids() {
  return MODULES.map(function (m) { return m.id; });
}

/** 选中模块 → 需要跑的阶段 id 集合 */
function stagesOf(moduleIds) {
  const out = new Set();
  MODULES.forEach(function (m) {
    if (moduleIds.has(m.id)) m.stages.forEach(function (s) { out.add(s); });
  });
  return out;
}

/** 选中模块 → 单测文件名片段（空数组 = 该选择不包含任何单测） */
function unitMatchOf(moduleIds) {
  const out = [];
  MODULES.forEach(function (m) {
    if (!moduleIds.has(m.id)) return;
    m.unit.forEach(function (u) { if (out.indexOf(u) < 0) out.push(u); });
  });
  return out;
}

/** 阶段 id 属于哪个模块 */
function moduleOfStage(stageId) {
  return STAGE_MODULE[stageId] || null;
}

/** 某个单测文件名属于哪些模块（可能为空 = 还没归类） */
function modulesOfUnitFile(fileName) {
  const out = [];
  MODULES.forEach(function (m) {
    const hit = m.unit.some(function (u) { return fileName.indexOf(u) >= 0; });
    if (hit) out.push(m.id);
  });
  return out;
}

/** 改动文件 → 模块集合 */
function modulesForPath(file) {
  const p = String(file || '').replace(/\\/g, '/');
  // 单测文件：按文件名直接归位（tests/unit/xxx.test.js）
  if (/^tests\/unit\/.+\.test\.js$/.test(p)) {
    const name = p.split('/').pop();
    return modulesOfUnitFile(name);
  }
  for (let i = 0; i < PATH_RULES.length; i++) {
    if (PATH_RULES[i].re.test(p)) return PATH_RULES[i].modules.slice();
  }
  return null;   // null = 没匹配到（调用方会提示补映射）
}

/**
 * 用 git 看当前改了哪些文件（含未跟踪）。
 *
 * 返回值三态（2026-11-06 修）：
 *   · 字符串数组 —— 正常，可能为空（工作区干净）；
 *   · []          —— 工作区真的没有改动；
 *   · null        —— **git 命令没跑起来**（spawn 失败 / 非 0 退出）。
 *
 * 为什么要把 null 和 [] 分开：受限环境里 spawnSync('git', …) 会直接 EPERM，
 * 原来两者都返回 []，`--changed` 就打印「没有检测到改动文件」然后只跑静态六项、
 * 判 PASS —— 这正是本项目最忌讳的**假绿灯**（改动没测就"通过"）。现在调用方
 * 遇到 null 会出声失败，让人改用 `--module=…` 或修环境，而不是被静默放过。
 */
function changedPaths(cwd) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: cwd, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  if (!r.stdout) return [];
  return r.stdout.split('\n').map(function (line) {
    if (!line.trim()) return '';
    // 形如 " M path" / "?? path" / "R  old -> new"
    let p = line.slice(3).trim();
    const arrow = p.indexOf(' -> ');
    if (arrow >= 0) p = p.slice(arrow + 4);
    return p.replace(/^"|"$/g, '');
  }).filter(Boolean);
}

/** 打印模块表（含未归属的单测文件提示） */
function printTable(unitDir) {
  console.log('模块表（--module=<id> 可多选，逗号分隔）：');
  console.log('');
  MODULES.forEach(function (m) {
    console.log('  ' + m.id.padEnd(11) + m.name);
    console.log('  ' + ' '.repeat(11) + '阶段: ' + (m.stages.length ? m.stages.join(', ') : '（无 E2E 阶段，只有单测）'));
    console.log('  ' + ' '.repeat(11) + '单测: ' + (m.unit.length ? m.unit.join(', ') : '（无）'));
  });
  if (unitDir) {
    const fs = require('fs');
    const path = require('path');
    let files = [];
    try {
      files = fs.readdirSync(unitDir).filter(function (f) { return /\.test\.js$/.test(f); });
    } catch (e) { /* 目录不存在就不提示 */ }
    const orphan = files.filter(function (f) { return modulesOfUnitFile(f).length === 0; });
    if (orphan.length) {
      console.log('');
      console.log('⚠ 以下单测还没归到任何模块（请补进 e2e/lib/modules.js 的 MODULES.unit，'
        + '否则跑模块时会漏掉）：');
      orphan.forEach(function (f) { console.log('    ' + f); });
    }
  }
  console.log('');
  console.log('用法：--module=challenge | --module=game,puzzle | --changed | --list-modules');
  console.log('选模块会自动带上 static（--no-static 可关）；不带参数 = 全量（上线前跑）。');
}

module.exports = {
  MODULES: MODULES,
  STAGE_MODULE: STAGE_MODULE,
  moduleById: moduleById,
  ids: ids,
  stagesOf: stagesOf,
  unitMatchOf: unitMatchOf,
  moduleOfStage: moduleOfStage,
  modulesOfUnitFile: modulesOfUnitFile,
  modulesForPath: modulesForPath,
  changedPaths: changedPaths,
  printTable: printTable
};
