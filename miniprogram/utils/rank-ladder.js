/**
 * 段位阶梯（前端副本，2026-09-13 · 第 8 条段位详情页）
 *
 * 规则与 `server/rank-ladder.js` **完全同源**：
 *   · 8 大段 × 9 小级 = 72 级
 *   · 第 i 级升到下一级需要 `2 + floor(i / 6)` 颗星（越往上越贵）
 *   · `starsForCell(cell)` = 进入第 cell 级所需的累计星数（第 1 级 = 0）
 * 单测 rank-ladder.test.js 会逐级比对两端，防止两边算得不一样。
 *
 * 小程序打包目录不能引 server/ 代码，所以这里是副本 + 一致性护栏。
 */
'use strict';

var rankBadge = require('./rank-badge');

var BIG_RANKS = rankBadge.TIERS.slice().reverse().map(function (t, i) {
  return { id: i + 1, key: t.key, name: t.name };
});
var LEVELS_PER_RANK = 9;
var TOTAL_CELLS = BIG_RANKS.length * LEVELS_PER_RANK;   // 72

var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** 第 i 级（0 基）升到下一级所需星数 */
function starsToAdvance(i) {
  // 2026-09-13 用户拍板 (C)：曲线加陡 —— 每 3 级 +1 星（与后端同源，parity 单测逐级比对）
  return 2 + Math.floor(i / 3);
}

/** 进入第 cell 级（1 基）所需的累计星数 */
function starsForCell(cell) {
  var sum = 0;
  var upto = Math.max(0, Math.min(cell - 1, TOTAL_CELLS - 1));
  for (var i = 0; i < upto; i++) sum += starsToAdvance(i);
  return sum;
}

/** 当前星数 → 所处级别（1 基 cell）与大段 */
function rankOf(stars) {
  var s = Math.max(0, parseInt(stars, 10) || 0);
  var cell = 1;
  for (var c = TOTAL_CELLS; c >= 1; c--) {
    if (s >= starsForCell(c)) { cell = c; break; }
  }
  var big = BIG_RANKS[Math.min(BIG_RANKS.length - 1, Math.floor((cell - 1) / LEVELS_PER_RANK))];
  var small = ((cell - 1) % LEVELS_PER_RANK) + 1;
  return {
    cell: cell,
    bigRank: big,
    smallIndex: small,
    name: big.name + ' ' + ROMAN[small - 1],
    shortName: big.name,
    stars
  };
}

/** 当前星数 → 距下一级还差多少（含进度百分比；满级 isMaxRank） */
function progressOf(stars) {
  var cur = rankOf(stars);
  if (cur.cell >= TOTAL_CELLS) {
    return {
      current: cur,
      next: null,
      nextName: '',
      starsForNext: starsForCell(TOTAL_CELLS),
      starsNeeded: 0,
      progressPercent: 100,
      isMaxRank: true
    };
  }
  var from = starsForCell(cur.cell);
  var to = starsForCell(cur.cell + 1);
  var span = to - from;
  var done = Math.max(0, Math.min(span, cur.stars - from));
  return {
    current: cur,
    next: rankOf(to),
    nextName: rankOf(to).name,
    starsForNext: to,
    starsNeeded: Math.max(0, to - cur.stars),
    progressPercent: span > 0 ? Math.round(done / span * 100) : 100,
    isMaxRank: false
  };
}

/** 全部 72 级（段位详情列表用）：{ cell, bigRank, level, name, starsNeed } */
function cells() {
  var out = [];
  for (var c = 1; c <= TOTAL_CELLS; c++) {
    var big = BIG_RANKS[Math.floor((c - 1) / LEVELS_PER_RANK)];
    var small = ((c - 1) % LEVELS_PER_RANK) + 1;
    out.push({
      cell: c,
      bigRank: big,
      level: small,
      name: big.name + ' ' + ROMAN[small - 1],
      starsToEnter: starsForCell(c),
      starsToNext: small < LEVELS_PER_RANK ? starsToAdvance(c - 1) : starsToAdvance(c - 1)
    });
  }
  return out;
}

module.exports = {
  BIG_RANKS: BIG_RANKS,
  LEVELS_PER_RANK: LEVELS_PER_RANK,
  TOTAL_CELLS: TOTAL_CELLS,
  ROMAN: ROMAN,
  starsToAdvance: starsToAdvance,
  starsForCell: starsForCell,
  rankOf: rankOf,
  progressOf: progressOf,
  cells: cells
};
