/**
 * game/pattern.js —— 「找规律」引擎（2026-10-18 新增，数字智力第 9 款）
 *
 * 设计口径（用户拍板）：
 *   · **不接年级**：数字智力是益智板块，难度只靠关卡序号。引擎里没有任何 grade 依赖，
 *     同一关对所有人生成同一题型族（具体数值随机）。
 *   · 30 关封顶：星星会被首页 getAllStars() 汇总进段位/皮肤门槛，"无限关卡 = 无限刷星"，
 *     所以关卡表有限，只有**关内换题**（重玩换 seed）——单测钉死星上限 90。
 *   · 题型族按档位累加（tierOf），不倒退：1~6 图形/等差 → 7~12 加递减/交替 →
 *     13~18 加 ×2/平方数 → 19~24 加二阶等差 → 25~30 加斐波那契式。
 *
 * 纯函数、无 wx 依赖（可 Node 单测）：题面、答案、干扰项、规则解释全在这里，
 * 页面只负责渲染与计数。
 */
'use strict';

var TOTAL_LEVELS = 30;
var QUESTIONS_PER_LEVEL = 10;

/** 图形题用的符号池（彩色 emoji，深浅背景下都看得清，不用图片素材） */
var EMOJI = ['🔴', '🔵', '🟡', '🟢', '🟣', '🟠', '🟤', '⭐', '🔺', '🔻', '🌙', '❤️'];

/**
 * 五档题型上限表 —— 唯一难度闸门。
 *
 * weights 既决定"这档允许出哪些题型"，也决定抽取概率。集合**逐档累加**（只会变多、
 * 不会变少），所以高关偶尔还会出简单题当送分题，单测据此断言"不倒退"。
 */
var TIERS = [
  {
    from: 1, to: 6, name: '入门', desc: '图形与等差',
    weights: { shape: 3, arith: 3 }
  },
  {
    from: 7, to: 12, name: '简单', desc: '递减与交替',
    weights: { shape: 2, arith: 3, dec: 2, alt: 3 }
  },
  {
    from: 13, to: 18, name: '中等', desc: '乘 2 与平方数',
    weights: { shape: 1, arith: 2, dec: 1, alt: 2, geo: 2, sq: 2 }
  },
  {
    from: 19, to: 24, name: '进阶', desc: '二阶等差',
    weights: { shape: 1, arith: 1, dec: 1, alt: 1, geo: 1, sq: 2, alt2: 2 }
  },
  {
    from: 25, to: 30, name: '挑战', desc: '斐波那契式',
    weights: { shape: 1, arith: 1, dec: 1, alt: 1, geo: 1, sq: 1, alt2: 2, fib: 2 }
  }
];

/** 题型的中文名（结算/关卡页副标题用） */
var KIND_NAMES = {
  shape: '图形规律',
  arith: '等差数列',
  dec: '递减数列',
  alt: '交替加减',
  geo: '等比数列',
  sq: '平方数',
  alt2: '二阶等差',
  fib: '斐波那契式'
};

// ============ 随机数（纯函数，seed 可复现） ============

/**
 * mulberry32 伪随机（同 seed 同结果）。
 *
 * 2026-10-18：第一版用线性同余（s*1664525+…），发现**相邻 seed 的第一个输出几乎相同**
 * （seed 差 1 → 首个 rnd 差 0.0004），于是「重玩换题」「同一关 10 题」会连续抽到同一种题型、
 * 甚至同一组数。换成 mulberry32：种子的差异会经过两轮 imul/xor 雪崩扩散，相邻 seed 也完全不同。
 */
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

/** 按权重抽一个 key（weights 的键顺序固定，便于复现） */
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

/** 某一关的档位信息（含该档允许的题型 key 列表） */
function tierOf(level) {
  var i = tierIndex(level);
  var t = TIERS[i];
  return {
    index: i,
    from: t.from,
    to: t.to,
    name: t.name,
    desc: t.desc,
    kinds: Object.keys(t.weights)
  };
}

/** 某一关允许的题型 key 列表（单测/关卡页描述用） */
function allowedKinds(level) {
  return tierOf(level).kinds;
}

// ============ 各题型生成器 ============
//
// 统一返回 { known: 已知项数组, answer, rule: 一句话规则, unit: 'num'|'emoji' }
// · 数字题固定 5 个已知 + 1 个空（共 6 格），图形题固定 7 个已知 + 1 个空（共 8 格）。
//   格数固定是为了布局稳定：珠子不会因为题目不同而忽宽忽窄。

var NUM_KNOWN = 5;
var SHAPE_KNOWN = 7;

/** 图形 / 符号规律：AB 交替、AABB、ABC 循环 */
function genShape(rnd, t) {
  var pool = shuffled(EMOJI, rnd);
  // 低档只出最直观的 AB 交替；中档开始混 AABB / ABC 循环
  var pattern = t <= 0 ? 1 : randInt(rnd, 1, t <= 1 ? 2 : 3);
  var symbols;
  var cycle;
  var rule;
  if (pattern === 1) {
    symbols = pool.slice(0, 2);
    cycle = [0, 1];
    rule = '两个符号交替出现';
  } else if (pattern === 2) {
    symbols = pool.slice(0, 2);
    cycle = [0, 0, 1, 1];
    rule = '每两个一组，两组交替';
  } else {
    symbols = pool.slice(0, 3);
    cycle = [0, 1, 2];
    rule = '三个符号按顺序循环';
  }
  var known = [];
  for (var i = 0; i < SHAPE_KNOWN; i++) known.push(symbols[cycle[i % cycle.length]]);
  var answer = symbols[cycle[SHAPE_KNOWN % cycle.length]];
  return { known: known, answer: answer, rule: rule, unit: 'emoji', palette: symbols };
}

/** 等差：每次 +d（低档 d=1~5，之后 1~9） */
function genArith(rnd, t) {
  var d = t <= 0 ? randInt(rnd, 1, 5) : randInt(rnd, 1, 9);
  var v = randInt(rnd, 1, 20);
  var known = [];
  for (var i = 0; i < NUM_KNOWN; i++) { known.push(v); v += d; }
  return { known: known, answer: v, rule: '每次 +' + d, unit: 'num' };
}

/** 递减：每次 −d（起点抬高，保证 6 项都不出现 0 或负数） */
function genDec(rnd, t) {
  var d = t <= 1 ? randInt(rnd, 1, 4) : randInt(rnd, 2, 9);
  var v = d * NUM_KNOWN + randInt(rnd, 1, 12);
  var known = [];
  for (var i = 0; i < NUM_KNOWN; i++) { known.push(v); v -= d; }
  return { known: known, answer: v, rule: '每次 −' + d, unit: 'num' };
}

/** 交替加减：+a, +b 循环 */
function genAlt(rnd) {
  var a = randInt(rnd, 1, 9);
  var b = randInt(rnd, 1, 9);
  if (a === b) b = (b % 9) + 1;
  var steps = [a, b, a, b, a];
  var v = randInt(rnd, 1, 12);
  var known = [];
  for (var i = 0; i < NUM_KNOWN; i++) { known.push(v); v += steps[i]; }
  return { known: known, answer: v, rule: '先 +' + a + ' 再 +' + b + '，交替', unit: 'num' };
}

/** 等比：每次 ×2（起点 2~3，最大不超过两位数，珠子不会挤） */
function genGeo(rnd) {
  var v = randInt(rnd, 2, 4);
  var known = [];
  for (var i = 0; i < NUM_KNOWN; i++) { known.push(v); v *= 2; }
  return { known: known, answer: v, rule: '每次 ×2', unit: 'num' };
}

/** 平方数：k², (k+1)² … */
function genSq(rnd) {
  var k = randInt(rnd, 1, 4);
  var known = [];
  for (var i = 0; i < NUM_KNOWN; i++) known.push((k + i) * (k + i));
  var nk = k + NUM_KNOWN;
  return {
    known: known,
    answer: nk * nk,
    rule: '平方数：' + k + '²、' + (k + 1) + '²、' + (k + 2) + '² …',
    unit: 'num'
  };
}

/** 二阶等差：差每次多 1（+d、+(d+1)、+(d+2) …） */
function genAlt2(rnd) {
  var d = randInt(rnd, 1, 3);
  var v = randInt(rnd, 1, 8);
  var known = [];
  for (var i = 0; i < NUM_KNOWN; i++) { known.push(v); v += d + i; }
  return {
    known: known,
    answer: v,
    rule: '每次多加 1：+' + d + '、+' + (d + 1) + '、+' + (d + 2) + ' …',
    unit: 'num'
  };
}

/** 斐波那契式：前两个数相加得下一个 */
function genFib(rnd) {
  var a = randInt(rnd, 1, 5);
  var b = randInt(rnd, 2, 7);
  if (b <= a) b = a + 1;
  var known = [];
  var x = a;
  var y = b;
  for (var i = 0; i < NUM_KNOWN; i++) {
    known.push(x);
    var z = x + y;
    x = y;
    y = z;
  }
  return { known: known, answer: x, rule: '前两个数相加等于下一个', unit: 'num' };
}

var GENERATORS = {
  shape: genShape,
  arith: genArith,
  dec: genDec,
  alt: genAlt,
  geo: genGeo,
  sq: genSq,
  alt2: genAlt2,
  fib: genFib
};

// ============ 干扰项 ============
//
// 原则（复核意见 §四）：干扰项要"像但不对"——
//   ① 用**错规则**回算（把等差当等比、把平方数当等差）；
//   ② 邻近偏移（±1 / ±2）；
//   ③ 四项互异、恰有一个正确答案，且不能出现"另一个也符合规则"的数。

/** 数字题的干扰项候选（按题型给不同错规则） */
function numCandidates(g, rnd) {
  var ans = g.answer;
  var known = g.known;
  var last = known[known.length - 1];
  var prev = known[known.length - 2];
  var diff = last - prev;
  var out = [];

  if (g.unit !== 'num') return out;

  // ① 错规则回算
  switch (g.kind) {
    case 'arith':
    case 'dec':
      out.push(last * 2);                    // 当等比
      out.push(last + diff * 2);             // 公差看错（翻倍）
      out.push(ans - diff);                  // 少走一步
      break;
    case 'geo':
      out.push(last + diff);                 // 当等差
      out.push(last + last / 2);             // 当 +50%
      out.push(ans / 2);                     // 少乘一次
      break;
    case 'sq':
      // 平方数最常见的两种错法：① 当等差 ② 回到上一个平方数 / 跳到下一个平方数
      out.push(ans + diff);                  // 当等差
      out.push((Math.sqrt(ans) - 1) * (Math.sqrt(ans) - 1));   // 少一步（上一个平方数）
      out.push((Math.sqrt(ans) + 1) * (Math.sqrt(ans) + 1));   // 多一步（下一个平方数）
      break;
    case 'alt2':
      out.push(ans + diff);                  // 只看最后一段差
      out.push(ans + 1);
      out.push(last + diff * 2);
      break;
    case 'fib':
      out.push(last * 2);                    // 当等比
      out.push(last + prev * 2);             // 加错项
      out.push(last + diff);                 // 当等差
      break;
    case 'alt':
      out.push(ans + diff);                  // 漏了交替
      out.push(last + diff);
      out.push(ans - 1);
      break;
    default:
      break;
  }

  // ② 邻近偏移
  out.push(ans + 1, ans - 1, ans + 2, ans - 2);

  // 注意不要打乱：错规则候选排在前面，取前 3 个时优先拿到「像但不对」的干扰，
  // 邻近值只在错规则候选被过滤掉（负数/等于答案）时补位。
  return out.filter(function (x) {
    return typeof x === 'number' && isFinite(x) && x > 0 && x % 1 === 0;
  });
}

/** 图形题的干扰项候选：先给"序列里出现过的符号"（最强干扰），再给池子里的其他符号 */
function emojiCandidates(g, rnd) {
  var used = [];
  g.known.forEach(function (s) { if (used.indexOf(s) < 0) used.push(s); });
  var others = EMOJI.filter(function (s) {
    return used.indexOf(s) < 0 && s !== g.answer;
  });
  var out = used.filter(function (s) { return s !== g.answer; });
  return out.concat(shuffled(others, rnd));
}

function buildOptions(g, rnd) {
  var need = 3;
  var picked = [];
  var cands = g.unit === 'emoji' ? emojiCandidates(g, rnd) : numCandidates(g, rnd);

  for (var i = 0; i < cands.length && picked.length < need; i++) {
    var v = cands[i];
    if (v === g.answer) continue;
    if (picked.indexOf(v) >= 0) continue;
    // 数字题避免把"另一个符合某条规则"的数放进去造成歧义：只保留 close 的邻近值
    if (g.unit === 'num' && Math.abs(v - g.answer) > 400) continue;
    picked.push(v);
  }

  // 兜底：候选不够（理论上不会）时按邻近补齐，保证 4 个选项
  var fill = 1;
  while (picked.length < need) {
    var v2 = g.unit === 'num' ? g.answer + fill : EMOJI[(fill * 3) % EMOJI.length];
    if (v2 !== g.answer && picked.indexOf(v2) < 0) picked.push(v2);
    fill++;
    if (fill > 200) break;
  }

  var options = [{ v: g.answer, ok: true }];
  picked.slice(0, need).forEach(function (v2) { options.push({ v: v2, ok: false }); });
  return shuffled(options, rnd);
}

// ============ 对外主入口 ============

/**
 * 生成一道题。
 * @param {number} level 关卡号 1~30
 * @param {number} seed 随机种子（同 seed 同题；页面"重玩换题"传不同 seed）
 * @returns {{ level, tierIndex, tierName, kind, kindName, known, answer, rule, unit, options }}
 */
function gen(level, seed) {
  var lv = clampLevel(level);
  var ti = tierIndex(lv);
  var tier = TIERS[ti];
  var rnd = rng(seed || (lv * 7919 + 13));
  var kind = pickWeighted(tier.weights, rnd);
  var g = GENERATORS[kind](rnd, ti);
  g.kind = kind;
  var options = buildOptions(g, rnd);
  return {
    level: lv,
    tierIndex: ti,
    tierName: tier.name,
    kind: kind,
    kindName: KIND_NAMES[kind],
    known: g.known,
    answer: g.answer,
    rule: g.rule,
    unit: g.unit,
    options: options
  };
}

/** 生成一整关（默认 10 题）。同 seed 同卷，重玩换 seed 即换题。 */
function genLevel(level, seed, count) {
  var lv = clampLevel(level);
  var n = parseInt(count, 10) || QUESTIONS_PER_LEVEL;
  var base = seed || (lv * 7919 + 13);
  var out = [];
  var seen = {};

  function keyOf(q) {
    return q.known.join('|') + '>' + q.answer;
  }

  for (var i = 0; i < n; i++) {
    // 每题错开种子，避免同种子下游抽到同一种题型的同一组数
    var s = (base + i * 104729) >>> 0;
    var q = gen(lv, s);
    // 同关内题面去重：题型参数范围有限（平方数只有几种 k），10 题里撞两道一模一样的题
    // 玩家一眼就看出来。撞了就换种子重抽，最多重试 20 次（兜底不死循环）。
    var guard = 0;
    while (seen[keyOf(q)] && guard < 20) {
      guard++;
      s = (s + 7919 * guard) >>> 0;
      q = gen(lv, s);
    }
    seen[keyOf(q)] = 1;
    out.push(q);
  }
  return out;
}

/** 满星上限：30 关 × 3 星（首页 getAllStars 会汇总，必须可断言） */
function maxStars() {
  return TOTAL_LEVELS * 3;
}

module.exports = {
  TOTAL_LEVELS: TOTAL_LEVELS,
  QUESTIONS_PER_LEVEL: QUESTIONS_PER_LEVEL,
  TIERS: TIERS,
  KIND_NAMES: KIND_NAMES,
  tierOf: tierOf,
  tierIndex: tierIndex,
  allowedKinds: allowedKinds,
  gen: gen,
  genLevel: genLevel,
  maxStars: maxStars,
  // 单测用（不当公共 API 用）
  _rng: rng
};
