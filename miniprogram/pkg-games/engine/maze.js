/**
 * game/maze.js —— 词义迷宫引擎（纯逻辑，无 wx 依赖）
 * 6×6 / 30 关；braid 造回路，死胡同放宝箱；门题由页面传入词库生成。
 */
'use strict';

var TOTAL_LEVELS = 30;
var SIZE = 6;

// 墙的四个方向（位掩码）。1 = 有墙。
var N = 1;
var E = 2;
var S = 4;
var W = 8;

var DIRS = [
  { bit: N, opp: S, dr: -1, dc: 0 },
  { bit: E, opp: W, dr: 0, dc: 1 },
  { bit: S, opp: N, dr: 1, dc: 0 },
  { bit: W, opp: E, dr: 0, dc: -1 }
];

// 2026-10-21：从「算术迷宫」重做为「词义迷宫」。
// 门题改成词/成语 → 中文释义；难度只控制词长与题型，不再出算术题。
var TIERS = [
  { from: 1, to: 6, name: '启蒙', desc: '常见短词 · 词义配对', gates: 3,
    types: { w1: 1, c1: 1 }, maxLen: 6 },
  { from: 7, to: 12, name: '基础', desc: '常用词 · 4~8 个字母', gates: 4,
    types: { w1: 1, c1: 1, w2: 1 }, maxLen: 8 },
  { from: 13, to: 18, name: '进阶', desc: '长单词 · 常用成语', gates: 5,
    types: { w1: 1, w2: 1, c1: 1, c2: 1, trans: 1 }, minLen: 3 },
  { from: 19, to: 24, name: '挑战', desc: '成语 · 词义辨析', gates: 6,
    types: { w2: 1, c2: 1, xhy: 1, trans: 1 }, minLen: 3 },
  { from: 25, to: 30, name: '大师', desc: '长词 · 易混释义', gates: 7,
    types: { c2: 1, xhy: 1, w2: 1 }, minLen: 4 }
];

// ============ 随机数 ============

function rng(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rnd, min, max) {
  var lo = Math.ceil(min);
  var hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

function shuffled(arr, rnd) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = randInt(rnd, 0, i);
    var t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// ============ 档位 ============

function clampLevel(level) {
  var n = parseInt(level, 10);
  if (!(n >= 1)) return 1;
  if (n > TOTAL_LEVELS) return TOTAL_LEVELS;
  return n;
}

function tierIndex(level) {
  var n = clampLevel(level);
  for (var i = 0; i < TIERS.length; i++) {
    if (n >= TIERS[i].from && n <= TIERS[i].to) return i;
  }
  return TIERS.length - 1;
}

function tierOf(level) {
  var i = tierIndex(level);
  var t = TIERS[i];
  return {
    index: i,
    from: t.from,
    to: t.to,
    name: t.name,
    desc: t.desc,
    gates: t.gates,
    types: t.types
  };
}

// ============ 迷宫生成 ============

function idxOf(r, c) {
  return r * SIZE + c;
}

function startIdx() {
  return idxOf(0, 0);              // 左上角出发
}

function endIdx() {
  return idxOf(SIZE - 1, SIZE - 1); // 走到右下角
}

function inGrid(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

/** 造一张全墙的棋盘 */
function blankCells() {
  var cells = [];
  for (var r = 0; r < SIZE; r++) {
    for (var c = 0; c < SIZE; c++) {
      cells.push({ r: r, c: c, walls: N | E | S | W, kind: 'normal' });
    }
  }
  return cells;
}

/** 打通 a 与 b 之间的墙 */
function carve(cells, a, b) {
  var ca = cells[a];
  var cb = cells[b];
  for (var i = 0; i < DIRS.length; i++) {
    var d = DIRS[i];
    if (ca.r + d.dr === cb.r && ca.c + d.dc === cb.c) {
      ca.walls &= ~d.bit;
      cb.walls &= ~d.opp;
      return true;
    }
  }
  return false;
}

/** 某格可走的邻居（已打通的方向） */
function neighborsOf(cells, i) {
  var out = [];
  var cell = cells[i];
  for (var k = 0; k < DIRS.length; k++) {
    var d = DIRS[k];
    if (cell.walls & d.bit) continue;
    var nr = cell.r + d.dr;
    var nc = cell.c + d.dc;
    if (inGrid(nr, nc)) out.push(idxOf(nr, nc));
  }
  return out;
}

/** DFS 回溯生成完美迷宫（每格一定能到达） */
function carveMaze(rnd) {
  var cells = blankCells();
  var seen = {};
  var stack = [startIdx()];
  seen[startIdx()] = 1;

  while (stack.length) {
    var cur = stack[stack.length - 1];
    var opts = [];
    for (var k = 0; k < DIRS.length; k++) {
      var d = DIRS[k];
      var nr = cells[cur].r + d.dr;
      var nc = cells[cur].c + d.dc;
      if (!inGrid(nr, nc)) continue;
      var ni = idxOf(nr, nc);
      if (seen[ni]) continue;
      opts.push(ni);
    }
    if (!opts.length) { stack.pop(); continue; }
    var nx = opts[randInt(rnd, 0, opts.length - 1)];
    carve(cells, cur, nx);
    seen[nx] = 1;
    stack.push(nx);
  }
  return cells;
}

/** BFS 最短路（用于取主路径、也用于单测证明「终点可达」） */
function bfsPath(cells, from, to) {
  var prev = {};
  prev[from] = -1;
  var q = [from];
  var head = 0;
  while (head < q.length) {
    var cur = q[head++];
    if (cur === to) break;
    var nbs = neighborsOf(cells, cur);
    for (var i = 0; i < nbs.length; i++) {
      if (prev[nbs[i]] === undefined) {
        prev[nbs[i]] = cur;
        q.push(nbs[i]);
      }
    }
  }
  if (prev[to] === undefined) return [];
  var out = [];
  var x = to;
  while (x !== -1 && x !== undefined) {
    out.push(x);
    x = prev[x];
  }
  return out.reverse();
}

/** 边数（只数向右、向下两条，避免重复计数） */
function edgeCount(cells) {
  var n = 0;
  for (var i = 0; i < cells.length; i++) {
    if (!(cells[i].walls & E)) n++;
    if (!(cells[i].walls & S)) n++;
  }
  return n;
}

/** 环数 = 边数 − (格数 − 1)。连通图里 > 0 就说明"有回路、可以绕路" */
function loopCount(cells) {
  return edgeCount(cells) - (cells.length - 1);
}

/** 兜底：braid 后仍无回路时，随机再拆一堵内墙（不碰宝箱/起点/终点） */
function ensureLoop(cells, keep, rnd) {
  if (loopCount(cells) > 0) return 0;
  var cands = [];
  for (var i = 0; i < cells.length; i++) {
    if (keep[i]) continue;
    var c = cells[i];
    // 只拆内墙，且不碰保留格
    if ((c.walls & E) && inGrid(c.r, c.c + 1) && !keep[i + 1]) cands.push({ a: i, b: i + 1 });
    if ((c.walls & S) && inGrid(c.r + 1, c.c) && !keep[i + SIZE]) cands.push({ a: i, b: i + SIZE });
  }
  if (!cands.length) return 0;
  var pick = cands[randInt(rnd, 0, cands.length - 1)];
  carve(cells, pick.a, pick.b);
  return 1;
}

/** 开口数（1 = 死胡同，2 = 走廊，3~4 = 岔路口） */
function openings(cell) {
  var n = 0;
  if (!(cell.walls & N)) n++;
  if (!(cell.walls & E)) n++;
  if (!(cell.walls & S)) n++;
  if (!(cell.walls & W)) n++;
  return n;
}

/** braid：打通除宝箱/起点/终点外的死胡同，形成回路 */
function braid(cells, keep, rnd) {
  var order = shuffled(range(cells.length), rnd);
  for (var i = 0; i < order.length; i++) {
    var idx = order[i];
    if (keep[idx]) continue;
    var cell = cells[idx];
    if (openings(cell) !== 1) continue;
    // 除保留格外全部打通，保证至少有一条绕路
    var cands = [];
    for (var k = 0; k < DIRS.length; k++) {
      var d = DIRS[k];
      if (!(cell.walls & d.bit)) continue;
      var nr = cell.r + d.dr;
      var nc = cell.c + d.dc;
      if (!inGrid(nr, nc)) continue;
      var nb = idxOf(nr, nc);
      // 不拆保留格（宝箱/起点/终点）
      if (keep[nb]) continue;
      cands.push(nb);
    }
    if (!cands.length) continue;
    carve(cells, idx, cands[randInt(rnd, 0, cands.length - 1)]);
  }
}

function range(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push(i);
  return out;
}

/** 在主路径上均匀取 k 个门（排除起点终点） */
function pickGates(path, k) {
  var mid = path.slice(1, path.length - 1);
  if (!mid.length) return [];
  if (mid.length <= k) return mid.slice();
  var out = [];
  for (var i = 0; i < k; i++) {
    var at = Math.floor((i + 0.5) * mid.length / k);
    if (at >= mid.length) at = mid.length - 1;
    if (out.indexOf(mid[at]) < 0) out.push(mid[at]);
  }
  return out;
}

/** 死胡同（开口 1）里挑宝箱，避开主路径与起点终点 */
function pickChests(cells, path, max) {
  var onPath = {};
  path.forEach(function (i) { onPath[i] = 1; });
  var cands = [];
  for (var i = 0; i < cells.length; i++) {
    if (onPath[i]) continue;
    if (openings(cells[i]) === 1) cands.push(i);
  }
  return cands.slice(0, max);
}

// ============ 词义题（只取词/成语 → 中文释义的 4 类） ============
var WORD_TYPES = { w1: 1, w2: 1, c1: 1, c2: 1 };

function normalizeWordItem(item) {
  var q = String(item && item.q || '').trim();
  var a = String(item && item.a || '').trim();
  var hint = String(item && item.hint || '').trim();
  var type = String(item && item.type || '');
  if (!q || !WORD_TYPES[type] || !hint) return null;
  var text = q.indexOf('*') >= 0 ? (a || q.replace(/\*/g, '')) : q;
  text = String(text || '').trim();
  if (!text) return null;
  // hint 必须是释义，不能是词本身
  if (hint === text || hint === a) return null;
  return { q: text, answer: hint, type: type, a: a };
}

function wordCandidates(pool, level) {
  var tier = TIERS[tierIndex(level)];
  var all = [];
  var seenQ = {};
  var seenA = {};
  (pool || []).forEach(function (raw) {
    var w = normalizeWordItem(raw);
    if (!w || seenQ[w.q] || seenA[w.answer]) return;
    seenQ[w.q] = 1;
    seenA[w.answer] = 1;
    all.push(w);
  });
  if (!all.length) return [];
  var preferred = all.filter(function (w) {
    if (!tier.types[w.type]) return false;
    var len = w.q.length;
    if (tier.maxLen && len > tier.maxLen) return false;
    if (tier.minLen && len < tier.minLen) return false;
    return true;
  });
  // 词不够时退回全量
  return preferred.length >= 8 ? preferred : all;
}

function promptOf(type) {
  return (type === 'c1' || type === 'c2') ? '选出正确的意思' : '选出正确的中文释义';
}

/** 生成一道词义题；同 seed 同题 */
function genWordQuestion(level, seed, pool) {
  var rnd = rng(seed || 1);
  var cands = wordCandidates(pool, level);
  if (cands.length < 4) return null;
  var target = cands[randInt(rnd, 0, cands.length - 1)];
  var others = shuffled(cands.filter(function (w) {
    return w.q !== target.q && w.answer !== target.answer;
  }), rnd);
  var picked = [];
  for (var i = 0; i < others.length && picked.length < 3; i++) {
    if (picked.indexOf(others[i].answer) < 0) picked.push(others[i].answer);
  }
  if (picked.length < 3) return null;
  var options = [{ v: target.answer, ok: true }];
  picked.forEach(function (v) { options.push({ v: v, ok: false }); });
  return {
    text: target.q,
    prompt: promptOf(target.type),
    answer: target.answer,
    options: shuffled(options, rnd),
    type: target.type
  };
}

/** 一整关的门题（与门一一对应，按门在主路径上的先后排） */
function genWordQuestions(level, seed, n, pool) {
  var count = parseInt(n, 10) || TIERS[tierIndex(level)].gates;
  var base = seed || (clampLevel(level) * 7919 + 13);
  var out = [];
  for (var i = 0; i < count; i++) {
    var q = genWordQuestion(level, (base + i * 104729) >>> 0, pool);
    if (!q) return [];
    out.push(q);
  }
  return out;
}

// ============ 主入口 ============

/** 生成一局迷宫；同 seed 同局 */
function gen(level, seed) {
  var lv = clampLevel(level);
  var ti = tierIndex(lv);
  var tier = TIERS[ti];
  var rnd = rng(seed || (lv * 7919 + 13));

  var cells = carveMaze(rnd);
  var path = bfsPath(cells, startIdx(), endIdx());
  var gateIds = pickGates(path, tier.gates);
  var chests = pickChests(cells, path, 2);

  // 宝箱/起点/终点不参与 braid
  var keep = {};
  chests.forEach(function (i) { keep[i] = 1; });
  keep[startIdx()] = 1;
  keep[endIdx()] = 1;
  braid(cells, keep, rnd);
  ensureLoop(cells, keep, rnd);

  // braid 后重算主路径
  path = bfsPath(cells, startIdx(), endIdx());

  // 标记格子类型
  cells[startIdx()].kind = 'start';
  cells[endIdx()].kind = 'end';
  gateIds.forEach(function (i) { cells[i].kind = 'gate'; });
  chests.forEach(function (i) { cells[i].kind = 'chest'; });

  return {
    level: lv,
    size: SIZE,
    tierName: tier.name,
    tierDesc: tier.desc,
    gatesNum: tier.gates,
    cells: cells,
    start: startIdx(),
    end: endIdx(),
    path: path,
    chests: chests,
    gateIds: gateIds
  };
}

/** 从某格能不能走到另一格（页面移动校验 + 单测） */
function canMove(cells, from, to) {
  if (!(from >= 0 && from < cells.length)) return false;
  var a = cells[from];
  for (var k = 0; k < DIRS.length; k++) {
    var d = DIRS[k];
    if (a.walls & d.bit) continue;
    if (idxOf(a.r + d.dr, a.c + d.dc) === to) return true;
  }
  return false;
}

/** 墙的四个布尔值（页面渲染 border 用，避免 wxml 里做位运算） */
function wallFlags(cell) {
  return {
    n: !!(cell.walls & N),
    e: !!(cell.walls & E),
    s: !!(cell.walls & S),
    w: !!(cell.walls & W)
  };
}

function maxStars() {
  return TOTAL_LEVELS * 3;
}

module.exports = {
  TOTAL_LEVELS: TOTAL_LEVELS,
  SIZE: SIZE,
  TIERS: TIERS,
  tierOf: tierOf,
  tierIndex: tierIndex,
  gen: gen,
  genWordQuestion: genWordQuestion,
  genWordQuestions: genWordQuestions,
  canMove: canMove,
  neighborsOf: neighborsOf,
  bfsPath: bfsPath,
  openings: openings,
  loopCount: loopCount,
  wallFlags: wallFlags,
  maxStars: maxStars,
  _rng: rng
};
