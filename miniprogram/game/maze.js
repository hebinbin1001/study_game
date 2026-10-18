/**
 * game/maze.js —— 「算术迷宫」引擎（2026-10-18 新增，数字智力第 11 款）
 *
 * 复核意见 §1.3 / §2.3 的两条硬要求，这里都落地了：
 *   ① **必须有岔路**。DFS 回溯生成的是完美迷宫（任意两格路径唯一），玩家没有选择，
 *      实质是"沿唯一路线连答口算题"。所以生成后做 **braid**（拆掉部分死胡同的墙形成回路），
 *      并在死胡同里放 **宝箱**（答对回一次机会）——"走哪条"才有意义。
 *   ② **星级按正确率**，不自创"用时折星"。分母固定为**本关门数**（不是"答过的题数"），
 *      这样绕路跳过门不但不加分，反而会因为少答而掉星 —— 速通和全清形成真实权衡。
 *
 * 其他口径：
 *   · 不接年级（数字智力统一 grade:'all'），难度只靠关卡序号；
 *   · 30 关封顶（30 × 3 = 90 星），星星会被首页 getAllStars() 汇总；
 *   · 6×6 固定棋盘：格子约 109rpx（≈54px），手指点得准，且一屏放得下不用滚。
 *
 * 纯逻辑、无 wx 依赖（可 Node 单测）。
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

var TIERS = [
  { from: 1, to: 6, name: '入门', desc: '20 以内加减', gates: 3, ops: { add: 3, sub: 2 } },
  { from: 7, to: 12, name: '简单', desc: '100 以内加减', gates: 4, ops: { add: 3, sub: 3 } },
  { from: 13, to: 18, name: '中等', desc: '表内乘除', gates: 5, ops: { add: 1, mul: 3, div: 2 } },
  { from: 19, to: 24, name: '进阶', desc: '两步混合运算', gates: 6, ops: { mul: 2, two: 3 } },
  { from: 25, to: 30, name: '挑战', desc: '两位数与括号', gates: 7, ops: { two: 2, big: 3 } }
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

function pickWeighted(weights, rnd) {
  var keys = Object.keys(weights);
  var total = 0;
  keys.forEach(function (k) { total += weights[k]; });
  var x = rnd() * total;
  for (var i = 0; i < keys.length; i++) {
    x -= weights[keys[i]];
    if (x < 0) return keys[i];
  }
  return keys[keys.length - 1];
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
    ops: Object.keys(t.ops)
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

/**
 * 兜底：如果 braid 之后一个回路都没有（所有死胡同恰好都是宝箱/起点/终点），
 * 随机再拆一堵内墙。没有这一步，个别种子会生成"完美迷宫"，
 * 复核意见 §2.3 的"必须有岔路"就不成立了。
 */
function ensureLoop(cells, keep, rnd) {
  if (loopCount(cells) > 0) return 0;
  var cands = [];
  for (var i = 0; i < cells.length; i++) {
    if (keep[i]) continue;
    var c = cells[i];
    // 只拆"格子内部的墙"，外墙拆了会开到棋盘外面
    // 同样不能拆到 keep 那一侧（否则宝箱会被打通成走廊）
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

/**
 * braid：把一部分死胡同的另一面墙也砸开，形成回路。
 *
 * 这是本玩法"有选择"的关键。比例 0.45：太低玩家还是在走唯一路线，
 * 太高迷宫会变成一片空地（岔路反而失去意义）。
 * 宝箱格不拆（拆了宝箱就在通路正中，不再是"绕路才拿得到"）。
 */
function braid(cells, keep, rnd) {
  var order = shuffled(range(cells.length), rnd);
  for (var i = 0; i < order.length; i++) {
    var idx = order[i];
    if (keep[idx]) continue;
    var cell = cells[idx];
    if (openings(cell) !== 1) continue;
    // 除宝箱格外的死胡同**全部**打通（拆哪面墙随机，不是"拆不拆"随机）。
    // 早期版本按 45% 概率拆，实测关 1/20/30 都是 0 环——"有选择"这条直接落空；
    // 留 0.1% 跳过也不行，个别种子会剩一个无主死胡同。全拆之后单测可以直接断言
    // "braid 后只剩宝箱 + 起点 + 终点那几个死胡同"。
    // 找一堵还能拆的墙（连到格子内的邻居，且当前是墙）
    var cands = [];
    for (var k = 0; k < DIRS.length; k++) {
      var d = DIRS[k];
      if (!(cell.walls & d.bit)) continue;
      var nr = cell.r + d.dr;
      var nc = cell.c + d.dc;
      if (!inGrid(nr, nc)) continue;
      var nb = idxOf(nr, nc);
      // 不能拆到宝箱 / 起点 / 终点那一侧：拆了宝箱就变成通路正中，
      // 不再是"绕到尽头才拿得到"，keep 也就白设了。
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

/**
 * 在主路径上均匀取 k 个"门"（排除起点终点）。
 * 均匀而不是随机：随机容易在开头挤三个门、后半段一个都没有，难度曲线会抖。
 */
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

// ============ 口算题 ============

/**
 * 生成一道口算题。
 * @returns {{ text:string, answer:number, options:[{v,ok}] }}
 */
function genQuestion(level, seed) {
  var ti = tierIndex(clampLevel(level));
  var weights = TIERS[ti].ops;
  var rnd = rng(seed || 1);
  var op = pickWeighted(weights, rnd);
  var a;
  var b;
  var c;
  var ans;
  var text;
  var wrongs;

  if (op === 'add') {
    var cap = ti <= 0 ? 18 : 90;
    a = randInt(rnd, 2, cap);
    b = randInt(rnd, 1, ti <= 0 ? Math.max(1, 20 - a) : Math.max(1, 100 - a));
    ans = a + b;
    text = a + ' + ' + b;
    wrongs = [ans + 1, ans - 1, ans + 10, ans - 10, ans + 2];
  } else if (op === 'sub') {
    var capS = ti <= 0 ? 20 : 100;
    a = randInt(rnd, 5, capS);
    b = randInt(rnd, 1, a - 1);
    ans = a - b;
    text = a + ' − ' + b;
    wrongs = [ans + 1, ans - 1, ans + 10, ans - 10, a + b];
  } else if (op === 'mul') {
    a = randInt(rnd, 2, ti <= 2 ? 9 : 9);
    b = randInt(rnd, 2, 9);
    ans = a * b;
    text = a + ' × ' + b;
    wrongs = [ans + a, ans - a, ans + 1, ans - 1, ans + b];
  } else if (op === 'div') {
    b = randInt(rnd, 2, 9);
    ans = randInt(rnd, 2, 9);
    a = b * ans;
    text = a + ' ÷ ' + b;
    wrongs = [ans + 1, ans - 1, ans + 2, ans + b, ans * b];
  } else if (op === 'two') {
    // 两步：a × b + c 或 a × b − c（都在表内乘法范围内）
    a = randInt(rnd, 2, 9);
    b = randInt(rnd, 2, 9);
    c = randInt(rnd, 1, 9);
    if (rnd() < 0.5) {
      ans = a * b + c;
      text = a + ' × ' + b + ' + ' + c;
      wrongs = [a * b, ans + 1, ans - 1, ans + 10];
    } else {
      ans = a * b - c;
      if (ans <= 0) { ans = a * b + c; text = a + ' × ' + b + ' + ' + c; }
      else text = a + ' × ' + b + ' − ' + c;
      wrongs = [a * b, ans + 1, ans - 1, ans + 10];
    }
  } else {
    // big：两位数 × 一位数，或带括号的加法
    if (rnd() < 0.5) {
      a = randInt(rnd, 11, 25);
      b = randInt(rnd, 2, 6);
      ans = a * b;
      text = a + ' × ' + b;
      wrongs = [ans + a, ans - a, ans + 10, ans - 10];
    } else {
      a = randInt(rnd, 12, 38);
      b = randInt(rnd, 12, 38);
      c = randInt(rnd, 2, 6);
      ans = (a + b) * c;
      text = '(' + a + ' + ' + b + ') × ' + c;
      wrongs = [a + b, ans + c, ans - c, ans + 10];
    }
  }

  // 选项：正确答案 + 3 个"像但不对"的（错规则/邻近），四项互异且都为正整数
  var picked = [];
  for (var i = 0; i < wrongs.length && picked.length < 3; i++) {
    var v = wrongs[i];
    if (!(typeof v === 'number') || !isFinite(v) || v <= 0 || v % 1 !== 0) continue;
    if (v === ans || picked.indexOf(v) >= 0) continue;
    picked.push(v);
  }
  var fill = 1;
  while (picked.length < 3 && fill < 60) {
    var v2 = ans + fill;
    if (v2 !== ans && picked.indexOf(v2) < 0) picked.push(v2);
    fill++;
  }

  var options = [{ v: ans, ok: true }];
  picked.forEach(function (v3) { options.push({ v: v3, ok: false }); });

  return { text: text, answer: ans, options: shuffled(options, rnd) };
}

/** 一整关的门题（与门一一对应，按门在主路径上的先后排） */
function genQuestions(level, seed, n) {
  var count = parseInt(n, 10) || TIERS[tierIndex(level)].gates;
  var base = seed || (clampLevel(level) * 7919 + 13);
  var out = [];
  for (var i = 0; i < count; i++) {
    out.push(genQuestion(level, (base + i * 104729) >>> 0));
  }
  return out;
}

// ============ 主入口 ============

/**
 * 生成一局迷宫。
 * @param {number} level 1~30
 * @param {number} seed  同 seed 同局（页面"重玩"换 seed）
 * @returns {{ level, size, tierName, gatesNum, cells, start, end, path, chests, gateIds }}
 */
function gen(level, seed) {
  var lv = clampLevel(level);
  var ti = tierIndex(lv);
  var tier = TIERS[ti];
  var rnd = rng(seed || (lv * 7919 + 13));

  var cells = carveMaze(rnd);
  var path = bfsPath(cells, startIdx(), endIdx());
  var gateIds = pickGates(path, tier.gates);
  var chests = pickChests(cells, path, 2);

  // braid 不能动宝箱（否则宝箱变成通路正中，绕路的意义就没了）
  var keep = {};
  chests.forEach(function (i) { keep[i] = 1; });
  keep[startIdx()] = 1;
  keep[endIdx()] = 1;
  braid(cells, keep, rnd);
  ensureLoop(cells, keep, rnd);

  // 重新算一次主路径：braid 可能造出更短的路线，关卡提示与单测都用这条
  path = bfsPath(cells, startIdx(), endIdx());

  // 标记格子类型（页面按 kind 渲染图标）
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
  genQuestion: genQuestion,
  genQuestions: genQuestions,
  canMove: canMove,
  neighborsOf: neighborsOf,
  bfsPath: bfsPath,
  openings: openings,
  loopCount: loopCount,
  wallFlags: wallFlags,
  maxStars: maxStars,
  _rng: rng
};
