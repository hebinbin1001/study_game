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
    name: '静态护栏（语法 / 结构 / WXSS）',
    stages: ['syntax', 'structure', 'wxss', 'taps'],
    unit: []
  },
  {
    id: 'assets',
    name: '资源与包体（图片音频限额 / 打包目录纯净度）',
    stages: ['assets'],
    unit: ['art-url', 'assets-limit']
  },
  {
    id: 'dict',
    name: '词库与常量（题库解析 / 校验 / 敏感词 / 学段题型）',
    stages: [],
    unit: ['constants', 'data', 'dict', 'parser', 'validator', 'sensitive']
  },
  {
    id: 'challenge',
    name: '闯关与玩法线（主线 30 关 / 关卡页 / 玩法线 / 星级命名空间）',
    stages: ['challenge', 'lines'],
    unit: ['challenge', 'challenge-lines', 'challenge-rewards', 'stars-reachable', 'rng']
  },
  {
    id: 'game',
    name: '字母射击对局与结算（引擎 / 出题 / 渲染 / 结算页）',
    stages: ['game', 'result'],
    unit: ['shoot', 'question']
  },
  {
    id: 'wordgames',
    name: '题库类玩法（连连看 / 消消乐 / 拼词 / 成语 / 贪吃蛇）',
    stages: ['link', 'snake'],
    unit: ['word-build']
  },
  {
    id: 'puzzle',
    name: '数字智力（24点 / 数独 / 华容道 / 2048 / 天平 / 口算 / 记忆 / 一笔画）',
    stages: ['math24', 'klotski', 'g2048', 'puzzleLevel'],
    unit: ['balance', 'math-sprint', 'memory-grid', 'one-stroke', 'math24-levels',
      'klotski', 'klotski-levels', 'g2048-levels', 'sudoku-stages', 'puzzle-levels',
      'sprint-balance-grade']
  },
  {
    id: 'user',
    name: '用户与成长（段位 / 成就 / 皮肤 / 错题本 / 复习 / 签到）',
    stages: ['m2m4'],
    unit: ['achievement-view', 'achievements', 'avatar-unlock', 'skins', 'rank-ladder',
      'progress', 'ebbinghaus', 'wrong-book-view', 'wrong-book', 'review',
      'auth-guard', 'admin-auth']
  },
  {
    id: 'server',
    name: '云托管后端（接口 / 模型 / Sequelize 用法）',
    stages: [],
    unit: ['sequelize-operators', 'rank-stars', 'checkin-rewards']
  },
  {
    id: 'pages',
    name: '页面渲染回归与真机黑屏探针（35 页）',
    stages: ['pages', 'load'],
    unit: ['play-counts']
  }
];

/** 阶段 id → 模块 id（run-all 用它把阶段归到模块下） */
const STAGE_MODULE = {
  syntax: 'static',
  structure: 'static',
  wxss: 'static',
  taps: 'static',
  assets: 'assets',
  unit: '(unit)',
  game: 'game',
  result: 'game',
  math24: 'puzzle',
  link: 'wordgames',
  snake: 'wordgames',
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
};

/**
 * 改动文件 → 模块。`--changed` 用这份规则推导该跑哪些模块。
 * 说明：宁可多跑一个模块，也别漏 —— 漏掉的代价是「提交了红代码」。
 */
const PATH_RULES = [
  // 公共入口：影响所有页面（含按需注入），至少跑静态 + 页面回归
  { re: /^miniprogram\/app\.json$/, modules: ['static', 'pages'] },
  { re: /^miniprogram\/app\.wxss$/, modules: ['static', 'pages'] },
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
  { re: /^miniprogram\/game\/(klotski|math24|math-sprint|memory-grid|one-stroke|sudoku|tw2048|balance)\.js$/,
    modules: ['puzzle'] },
  { re: /^miniprogram\/data\//, modules: ['puzzle', 'dict'] },
  { re: /^miniprogram\/pages\/(math24|math-sprint|memory-grid|math-balance|one-stroke|sudoku|g2048|klotski|bounce)\//,
    modules: ['puzzle'] },

  // 用户与成长
  { re: /^miniprogram\/pages\/(me|rank|achievement|avatar|nickname|wrong-book|wrong-review|checkin|daily-question|report|custom-levels|level-editor|level-share)\//,
    modules: ['user'] },
  { re: /^miniprogram\/utils\/(storage|auth|skins|review|wrong-book-view|achievement-view)\.js$/, modules: ['user'] },
  { re: /^miniprogram\/utils\/art\.js$/, modules: ['user', 'assets'] },

  // 公共模块：刻意映射到多个模块（改一处会牵连多处）
  { re: /^miniprogram\/utils\/dict\.js$/, modules: ['dict', 'challenge', 'game', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/utils\/constants\.js$/, modules: ['dict', 'challenge', 'game', 'wordgames', 'puzzle'] },
  { re: /^miniprogram\/utils\/play-report\.js$/, modules: ['game', 'wordgames', 'user'] },
  { re: /^miniprogram\/utils\/request\.js$/, modules: ['user', 'server'] },
  { re: /^miniprogram\/pages\/(study|agreement|share-card|daily-question)\//, modules: ['pages', 'user'] },

  // 资源
  { re: /^miniprogram\/assets\//, modules: ['assets', 'pages'] },
  { re: /^art\//, modules: ['assets'] },

  // 后端与词库工具
  { re: /^server\//, modules: ['server'] },
  { re: /^tools\/dict\//, modules: ['dict'] },
  { re: /^(Dockerfile|\.dockerignore|container\.config\.json|cloudbaserc\.json)$/, modules: ['server', 'assets'] },

  // 测试自身的改动：按文件名归位
  // 纯文档 / 演示页：不需要跑任何用例（选模块仍会带上 static，8 秒，无害）
  { re: /^docs\//, modules: [] },
  { re: /^demo\//, modules: [] },
  { re: /^assets-src\//, modules: [] },
  { re: /^(README\.md|\.gitignore|\.dockerignore)$/, modules: [] },
  { re: /^e2e\/verify-(game|result)\.js$/, modules: ['game'] },
  { re: /^e2e\/verify-(link|snake)\.js$/, modules: ['wordgames'] },
  { re: /^e2e\/verify-(math24|klotski|g2048)\.js$/, modules: ['puzzle'] },
  { re: /^e2e\/verify-(challenge|lines)\.js$/, modules: ['challenge'] },
  { re: /^e2e\/verify-(all-pages|m2m4)\.js$/, modules: ['pages', 'user'] },
  { re: /^e2e\/probe-pages-load\.js$/, modules: ['pages'] },
  { re: /^e2e\/(check-assets|check-wxss|structure-check|syntax-check-all)\.js$/, modules: ['static', 'assets'] },
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

/** 用 git 看当前改了哪些文件（含未跟踪） */
function changedPaths(cwd) {
  const r = spawnSync('git', ['status', '--porcelain'], { cwd: cwd, encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return [];
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
