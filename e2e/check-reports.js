/**
 * check-reports.js —— 「玩法都有成绩上报」静态护栏（2026-09-13）
 *
 * 为什么有它：排行榜的「玩法进度榜」是服务端按 scores.game_type 聚合的，**没上报的玩法榜永远空着**。
 * 用户反馈「排行榜里好多玩法进度都没做」就是这么来的 —— 数字智力 5 款（华容道/2048/口算/天平/一笔画）
 * 压根没调用过上报。这条护栏保证：目录里每个已开放玩法，都能在它的页面（或结算页）里找到上报调用。
 *
 * 判定：`utils/game-catalog.js` 里 unlocked 的玩法，必须满足其一 ——
 *   · 对应页面 js 里出现 `reportPlay(`（走 utils/play-report）或 `/api/score`（自行上报）；
 *   · 或该玩法走结算页上报（字母射击 → pages/result 的 reportScore）。
 *
 * 第二条规则（2026-09-29 补，用户要求「每个游戏都要排查」）：**每个玩法都必须写本机进度**。
 *   用户反馈「一笔画等几个游戏通关后关卡进度没更新、下一关没解锁」—— 根因就是
 *   这些页面只上报服务端（只影响排行榜），没写本机进度，而关卡页的「已通关」判定是
 *   `puzzle-progress 有记录 || ww_stars 有星`（见 pages/puzzle-level 的 _refresh）。
 *   玩法线同理：`pages/level` 的 lineProgress 只认 `ww_stars` 的 `<学段>@<线>@<关卡>`。
 *   所以两类玩法都必须在页面（或其结算页）里出现 `markCleared(` 或 `saveStars(`。
 *
 * 用法：node e2e/check-reports.js ｜ 退出码 0 通过 / 1 有玩法没上报
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'miniprogram');
const catalog = require(path.join(ROOT, 'utils', 'game-catalog'));

/** 玩法 key → 页面路径（与 pages/puzzle-level 的 GAME_PAGE 同口径） */
const PAGE_OF = {
  shoot: 'pages/game/game',
  match: 'pages/match/match',
  link: 'pages/link/link',
  wordbuild: 'pages/word-build/word-build',
  idiombuild: 'pages/idiom-build/idiom-build',
  snake: 'pages/snake/snake',
  quiz: 'pages/quiz/quiz',
  sudoku: 'pages/sudoku/sudoku',
  math24: 'pages/math24/math24',
  sprint: 'pages/math-sprint/math-sprint',
  balance: 'pages/math-balance/math-balance',
  g2048: 'pages/g2048/g2048',
  memory: 'pages/memory-grid/memory-grid',
  onestroke: 'pages/one-stroke/one-stroke',
  klotski: 'pages/klotski/klotski'
};

/** 字母射击的成绩在结算页上报（reportScore → /api/score） */
const VIA_RESULT = ['shoot'];

let bad = 0;

catalog.forEach(function (g) {
  if (!g.unlocked) return;                 // 未开放玩法（弹弹球占位）不要求
  const rel = PAGE_OF[g.key];
  if (!rel) {
    console.log('[FAIL] ' + g.key + '（' + g.name + '）没有登记页面路径，请补 e2e/check-reports.js 的 PAGE_OF');
    bad++;
    return;
  }
  const file = path.join(ROOT, rel + '.js');
  const src = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (!src) {
    console.log('[FAIL] ' + g.key + ' 的页面文件不存在：' + rel + '.js');
    bad++;
    return;
  }
  const hit = src.indexOf('reportPlay(') >= 0 || src.indexOf('/api/score') >= 0;
  if (hit) return;
  if (VIA_RESULT.indexOf(g.key) >= 0) {
    const resultSrc = fs.readFileSync(path.join(ROOT, 'pages/result/result.js'), 'utf8');
    if (resultSrc.indexOf('/api/score') >= 0) return;   // 结算页代传
  }
  console.log('[FAIL] ' + g.key + '（' + g.name + '）没有任何成绩上报 —— 玩法进度榜会一直空着');
  bad++;
});

// 第二条规则：数字智力类玩法必须写本地关卡进度（否则通则了也不解锁下一关）
// 注意先去掉行注释再匹配 —— 否则把调用注释掉仍会被判为「有」（反向验证时踩到过）。
function stripLineComments(src) {
  return src.split('\n').map(function (line) { return line.replace(/\/\/.*$/, ''); }).join('\n');
}

/** 页面（或其结算页）是否能写本机星级/进度存档 */
function writesLocalProgress(rel) {
  const src = stripLineComments(fs.readFileSync(path.join(ROOT, rel + '.js'), 'utf8'));
  if (src.indexOf('markCleared(') >= 0 || src.indexOf('saveStars(') >= 0) return true;
  // 字母射击这类走结算页写星（pages/result 的 saveStars）
  const isShootLike = Object.keys(PAGE_OF).some(function (k) {
    return PAGE_OF[k] === rel && VIA_RESULT.indexOf(k) >= 0;
  });
  if (isShootLike) {
    const resultSrc = stripLineComments(fs.readFileSync(path.join(ROOT, 'pages/result/result.js'), 'utf8'));
    if (resultSrc.indexOf('saveStars(') >= 0) return true;
  }
  return false;
}

catalog.forEach(function (g) {
  if (!g.unlocked) return;
  const rel = PAGE_OF[g.key];
  if (!rel) return;                                    // 缺页面路径上一条规则已经报过
  if (writesLocalProgress(rel)) return;
  console.log('[FAIL] ' + g.key + '（' + g.name + '）通关后不写本机进度 —— '
    + (g.section === 'casual'
      ? '数字智力关卡页会一直显示未通关、下一关不解锁'
      : '玩法线的关卡进度不会推进')
    + '（需调 puzzle-progress 的 markCleared 或 storage.saveStars）');
  bad++;
});

console.log('');
console.log(bad === 0
  ? '目录里每个已开放玩法都有成绩上报。'
  : '共发现 ' + bad + ' 个玩法没有上报。');
process.exit(bad === 0 ? 0 : 1);
