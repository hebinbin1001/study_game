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

console.log('');
console.log(bad === 0
  ? '目录里每个已开放玩法都有成绩上报。'
  : '共发现 ' + bad + ' 个玩法没有上报。');
process.exit(bad === 0 ? 0 : 1);
