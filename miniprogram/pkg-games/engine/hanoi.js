/**
 * game/hanoi.js —— 「汉诺塔」引擎（2026-10-18 新增，数字智力第 12 款，6 关小品）
 *
 * 复核意见 §1.4 的结论是"降到最后、只做 6 关小品"，理由：
 *   · 最优解唯一、学会递归后每关同一套动作，家长看不出教学价值 → 不值得做 30 关长线；
 *   · 原文写"3 柱 / 4 柱两种变体 + 闭式解"是自相矛盾的：`2ⁿ−1` **只在 3 柱成立**，
 *     4 柱（Reve's puzzle）至今没有闭式解（Frame–Stewart 仍是猜想）。
 *     所以这里**只做 3 柱**，最少步数直接用闭式解，单测可以逐关验算。
 *
 * 与现有玩法一致的口径：
 *   · 不接年级（数字智力统一 grade:'all'）；
 *   · 关数有限（6 关 × 3 星 = 18 星），不参与"无限刷星"；
 *   · 无题目 → 星级按**步数倍率**折（照 klotski 的 starsFor：1.15 倍内 3★ / 1.5 倍内 2★）。
 *
 * 纯逻辑、无 wx 依赖。
 */
'use strict';

/** 6 关：3 盘 → 8 盘。最少的 8 盘 255 步，是"小品"的长度上限，再加就该拆玩法了 */
var LEVELS = [
  { no: 1, n: 3, name: '3 盘' },
  { no: 2, n: 4, name: '4 盘' },
  { no: 3, n: 5, name: '5 盘' },
  { no: 4, n: 6, name: '6 盘' },
  { no: 5, n: 7, name: '7 盘' },
  { no: 6, n: 8, name: '8 盘' }
];

var DISK_COLORS = [
  '#ff8a65', '#ffb74d', '#ffd54f', '#aed581',
  '#4fc3f7', '#7986cb', '#ba68c8', '#f06292'
];

function levelOf(no) {
  var n = parseInt(no, 10) || 1;
  if (n < 1) n = 1;
  if (n > LEVELS.length) n = LEVELS.length;
  return LEVELS[n - 1];
}

/** 最少步数：3 柱唯一最优解 = 2ⁿ − 1（4 柱没有闭式解，所以本玩法不做 4 柱） */
function minMoves(n) {
  var k = parseInt(n, 10) || 0;
  if (k < 1) return 0;
  return Math.pow(2, k) - 1;
}

/**
 * 初始状态：三根柱子，数组尾部是**顶部**（push/pop 就是拿起/放下）。
 * [ [n, n-1, … 1], [], [] ]
 */
function initial(n) {
  var first = [];
  for (var i = n; i >= 1; i--) first.push(i);
  return [first, [], []];
}

function top(state, i) {
  var rod = state[i];
  return rod && rod.length ? rod[rod.length - 1] : 0;
}

/** 能不能把 from 顶部的盘放到 to：to 为空，或 to 顶部比它大 */
function canMove(state, from, to) {
  if (from === to) return false;
  if (!state[from] || !state[from].length) return false;
  if (!state[to]) return false;
  var t = top(state, to);
  return t === 0 || t > top(state, from);
}

/** 走一步，返回新状态（不改入参，方便撤销/单测）；非法返回 null */
function move(state, from, to) {
  if (!canMove(state, from, to)) return null;
  var next = state.map(function (rod) { return rod.slice(); });
  next[to].push(next[from].pop());
  return next;
}

/** 是否已完成：所有盘都在最右柱 */
function isSolved(state, n) {
  return state[2] && state[2].length === n;
}

/**
 * 星级：按"实际步数 / 最少步数"的倍率折星，与华容道同口径
 * （klotski.js 的 starsFor：1.15 倍内 3★、1.5 倍内 2★，其余 1★）。
 */
function starsFor(minMovesN, moves) {
  var best = Math.max(1, parseInt(minMovesN, 10) || 0);
  var used = Math.max(0, parseInt(moves, 10) || 0);
  if (!used) return 0;
  var ratio = used / best;
  var EPS = 1e-9;
  if (ratio <= 1.15 + EPS) return 3;
  if (ratio <= 1.5 + EPS) return 2;
  return 1;
}

/** 渲染用：盘子的宽度/颜色/标签（宽度按本关最大盘数归一，盘数变了也不会溢出） */
function diskStyle(size, maxN) {
  var lo = 78;
  var hi = 196;
  var span = Math.max(1, maxN - 1);
  var w = Math.round(lo + (size - 1) * (hi - lo) / span);
  return { w: w, color: DISK_COLORS[(size - 1) % DISK_COLORS.length], label: String(size) };
}

/** 关卡页用的关卡表 */
function levelsForPage() {
  return LEVELS.map(function (lv) {
    return {
      no: lv.no,
      label: '第 ' + lv.no + ' 关 · ' + lv.name,
      sub: '最少 ' + minMoves(lv.n) + ' 步 · 三根柱子',
      params: { n: lv.n }
    };
  });
}

function maxStars() {
  return LEVELS.length * 3;
}

module.exports = {
  LEVELS: LEVELS,
  levelOf: levelOf,
  minMoves: minMoves,
  initial: initial,
  top: top,
  canMove: canMove,
  move: move,
  isSolved: isSolved,
  starsFor: starsFor,
  diskStyle: diskStyle,
  levelsForPage: levelsForPage,
  maxStars: maxStars
};
