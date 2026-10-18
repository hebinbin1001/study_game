/**
 * game/clock.js —— 「认钟表」引擎（2026-10-18 新增，数字智力第 10 款）
 *
 * 口径（复核意见 §1.2 / §2.2）：
 *   · **不接年级**：难度只靠关卡序号（tierOf），引擎里没有任何 grade 依赖；
 *   · 30 关封顶（30 × 3 = 90 星），星星会被首页 getAllStars() 汇总，不能无限刷；
 *   · 表盘不画 canvas：页面用 12 个绝对定位刻度 + 两根 rotate 指针 + repeating-conic-gradient
 *     刻度环，纯 CSS，不用图片素材；
 *   · 25~30 关按复核意见做「跨小时 + 24 时制双向换算」。**时间比较没有单独成题**——
 *     它和认读同构（都是"读出一个时刻"），单独出纯文本比较题反而更弱，这里把它并进
 *     h12/h24 的选项干扰（同一题的四个选项就是四个时刻，选错就是比较错）。
 *
 * 纯函数、无 wx 依赖：题面、答案、干扰项、角度全在这里算，页面只渲染。
 */
'use strict';

var TOTAL_LEVELS = 30;
var QUESTIONS_PER_LEVEL = 10;

/**
 * 五档表 —— 唯一难度闸门。
 * 集合逐档累加（高关偶尔出低档题当送分），单测据此断言「不倒退」。
 */
var TIERS = [
  {
    from: 1, to: 6, name: '认整点', desc: '整点与半点',
    weights: { read: 1 }
  },
  {
    from: 7, to: 12, name: '5 分刻度', desc: '分针走大格',
    weights: { read: 3, elapsed: 1 }
  },
  {
    from: 13, to: 18, name: '1 分刻度', desc: '精确到每一分钟',
    weights: { read: 3, elapsed: 2 }
  },
  {
    from: 19, to: 24, name: '经过时间', desc: '分钟相加不进位',
    weights: { read: 1, elapsed: 4 }
  },
  {
    from: 25, to: 30, name: '跨小时', desc: '24 时制与跨小时',
    weights: { read: 1, elapsed: 3, h24: 3, h12: 2 }
  }
];

var KIND_NAMES = {
  read: '认读时刻',
  elapsed: '经过时间',
  h24: '转 24 时制',
  h12: '转 12 时制'
};

// ============ 随机数（mulberry32，同 seed 同卷） ============

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

function pick(arr, rnd) {
  return arr[randInt(rnd, 0, arr.length - 1)];
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
  return { index: i, from: t.from, to: t.to, name: t.name, desc: t.desc, kinds: Object.keys(t.weights) };
}

function allowedKinds(level) {
  return tierOf(level).kinds;
}

// ============ 时刻工具 ============

function pad2(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 12 小时制写法（小时不补零：3:05，而不是 03:05） */
function fmt12(h, m) {
  return h + ':' + pad2(m);
}

/** 24 小时制写法（小时补零：15:05 / 09:05，列宽一致） */
function fmt24(h, m) {
  return pad2(h) + ':' + pad2(m);
}

/** 12 小时制回绕（h 1~12） */
function wrap12(h) {
  var x = h % 12;
  return x === 0 ? 12 : x;
}

/** 加 delta 分钟，返回 12 小时制 { h, m } */
function addMinutes(h, m, delta) {
  var total = (wrap12(h) * 60 + m + delta) % 720;
  if (total < 0) total += 720;
  var nh = Math.floor(total / 60);
  var nm = total % 60;
  return { h: nh === 0 ? 12 : nh, m: nm };
}

/** 指针角度：时针要随分钟连续走，否则半点时仍指着整点（一眼假） */
function anglesOf(h, m) {
  return {
    hour: (h % 12) * 30 + m * 0.5,
    minute: m * 6
  };
}

/** 分钟取值范围（按档位收窄，整点档只出 0/30） */
function minuteOf(rnd, ti) {
  if (ti <= 0) return pick([0, 30], rnd);
  if (ti === 1) return randInt(rnd, 0, 11) * 5;
  return randInt(rnd, 0, 59);
}

/** 合法 12 时制时刻（1:00 ~ 12:59） */
var RE12 = /^(1[0-2]|[1-9]):([0-5][0-9])$/;
/** 合法 24 时制时刻（00:00 ~ 23:59） */
var RE24 = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

// ============ 各题型生成器 ============
//
// 统一返回：
//   { kind, prompt, sub, face:{show,h,m,text}, answer, distractors:[...], rule, unit }
//   · face.show=false 时页面改显一个大号数字牌（face.text），题板高度不变，布局不会跳。

/** 认读：表盘 → 选时刻 */
function genRead(rnd, ti) {
  var h = randInt(rnd, 1, 12);
  var m = minuteOf(rnd, ti);
  var ans = fmt12(h, m);
  var rule;
  if (m === 0) {
    rule = '分针指向 12，时针正好指向 ' + h + ' → ' + ans;
  } else if (m === 30) {
    rule = '分针指向 6，时针走过了 ' + h + ' 到了两格中间 → ' + ans;
  } else {
    // 只有整格时才提「大格」：13 分写成 2.6 大格是错的（1 分刻度档会出现）
    var big = m % 5 === 0 ? '（' + (m / 5) + ' 大格）' : '';
    rule = '分针走 ' + m + ' 小格' + big + '，时针在 ' + h + ' 之后 → ' + ans;
  }

  var cands = [];
  // ① 分针当小时（最常见的错法）
  if (m > 0 && m <= 12) cands.push(fmt12(m, 0));
  // ② 时针看错一格
  cands.push(fmt12(wrap12(h + 1), m));
  cands.push(fmt12(wrap12(h - 1), m));
  // ③ 分钟读错一档
  if (m > 0) cands.push(fmt12(h, (m + 5) % 60));
  cands.push(fmt12(h, (m + 30) % 60));
  if (m >= 5) cands.push(fmt12(h, m - 5));
  // ④ 12/24 混淆（只在有"下午"语义的档位出现，低档不懂 24 时制不能出）
  if (ti >= 2) cands.push(fmt24(h + 12, m));

  return {
    kind: 'read',
    prompt: '现在是几点？',
    sub: '看时针和分针的位置',
    face: { show: true, h: h, m: m, text: '' },
    answer: ans,
    distractors: cands,
    rule: rule,
    unit: 'time12'
  };
}

/** 经过时间：给起始时刻 + 走过多少分钟 */
function genElapsed(rnd, ti) {
  var h;
  var m;
  var delta;
  if (ti <= 3) {
    // 不进位档（13~24 关都是"分钟相加不进位"）：m + delta ≤ 59
    h = randInt(rnd, 1, 12);
    if (ti <= 1) {
      // 整点 / 5 分刻度：分钟与步长都是 5 的倍数
      m = randInt(rnd, 0, 5) * 5;                     // 0~25
      delta = randInt(rnd, 1, 4) * 5;                 // 5~20
      if (m + delta > 55) delta = Math.max(5, 55 - m);
    } else {
      // 1 分刻度 / 经过时间档：任意分钟。先把 m 卡在 49 以内，再按剩余空间取 5 的倍数，
      // 这样 delta ≥ 5 且 m + delta ≤ 59（不会意外进位）
      m = randInt(rnd, 0, 49);
      delta = randInt(rnd, 1, Math.max(1, Math.floor((59 - m) / 5))) * 5;
    }
  } else {
    // 跨小时档：步长可以到 90 分钟，会跨过整点
    m = randInt(rnd, 0, 11) * 5;
    delta = randInt(rnd, 1, 18) * 5;
    h = randInt(rnd, 1, 12);
  }
  var to = addMinutes(h, m, delta);
  var ans = fmt12(to.h, to.m);

  var cands = [];
  if (m + delta >= 60) {
    // 忘了进位：小时不变、分钟也减了 60
    cands.push(fmt12(h, (m + delta) % 60));
    // 进位但小时算错
    cands.push(fmt12(wrap12(to.h + 1), to.m));
  } else {
    // 不该进位却进位了
    cands.push(fmt12(wrap12(h + 1), to.m));
  }
  cands.push(fmt12(to.h, (to.m + 5) % 60));
  cands.push(fmt12(wrap12(to.h - 1), to.m));
  cands.push(fmt12(h, (m + delta) % 60));   // 小时完全没动

  return {
    kind: 'elapsed',
    prompt: '现在是 ' + fmt12(h, m),
    sub: '再过 ' + delta + ' 分钟是几点？',
    face: { show: true, h: h, m: m, text: '' },
    answer: ans,
    distractors: cands,
    rule: m + delta >= 60
      ? (m + ' + ' + delta + ' = ' + (m + delta) + ' 分钟，满 60 进 1 小时 → ' + ans)
      : ('分钟相加：' + m + ' + ' + delta + ' = ' + (m + delta) + '，不到 60 不进位 → ' + ans),
    unit: 'time12'
  };
}

/** 下午 → 24 时制（h+12；12 点特殊：下午 12 点仍是 12:xx） */
function genH24(rnd, ti) {
  var h = randInt(rnd, 1, 12);
  var m = ti >= 4 ? randInt(rnd, 0, 11) * 5 : randInt(rnd, 0, 5) * 5;
  var hh = h === 12 ? 12 : h + 12;
  var ans = fmt24(hh, m);
  var hint = h === 12 ? '下午 12 点在 24 时制里就是 12:xx' : '下午的时刻 + 12';

  var cands = [
    fmt12(h, m),                 // 没换算
    fmt24(hh + 1 > 23 ? 0 : hh + 1, m),   // 加 12 时多加了 1
    fmt24(hh - 1, m),
    fmt24(hh, (m + 15) % 60)
  ];

  return {
    kind: 'h24',
    prompt: '下午 ' + fmt12(h, m),
    sub: '用 24 时制怎么写？',
    face: { show: true, h: h, m: m, text: '' },
    answer: ans,
    distractors: cands,
    rule: hint + ' → ' + ans,
    unit: 'time24'
  };
}

/** 24 时制 → 下午几点（h>12 减 12；12:xx 就是中午，13 点起才减） */
function genH12(rnd, ti) {
  var hh = randInt(rnd, 13, 21);
  var m = ti >= 4 ? randInt(rnd, 0, 11) * 5 : randInt(rnd, 0, 5) * 5;
  var h = hh - 12;
  var ans = fmt12(h, m);

  var cands = [
    fmt24(hh, m),                          // 原样照抄（"13:15" 这种，会被 RE12 挡掉，留作 time24 兜底）
    fmt12(wrap12(h + 1), m),
    fmt12(wrap12(h - 1), m),
    fmt12(h, (m + 15) % 60),               // 分钟混淆
    fmt12(wrap12(h + 2), m)                // 13−11 之类的粗心
  ];

  return {
    kind: 'h12',
    prompt: fmt24(hh, m),
    sub: '是下午几点？',
    face: { show: false, h: 1, m: 0, text: fmt24(hh, m) },
    answer: ans,
    distractors: cands,
    rule: hh + ' − 12 = ' + h + '，所以是下午 ' + ans,
    unit: 'time12'
  };
}

var GENERATORS = {
  read: genRead,
  elapsed: genElapsed,
  h24: genH24,
  h12: genH12
};

// ============ 选项 ============

/**
 * 4 选 1：正确答案 + 3 个干扰项。
 * 干扰项按「错规则优先」排列（不放随机打乱），保证抽到的都是像但不对的时刻；
 * 只保留格式与本题一致的合法时刻，避免 12 时制题里冒出 25:00。
 */
function buildOptions(g, rnd) {
  var re = g.unit === 'time24' ? RE24 : RE12;
  var picked = [];
  var cands = g.distractors || [];
  for (var i = 0; i < cands.length && picked.length < 3; i++) {
    var v = cands[i];
    if (!v || v === g.answer) continue;
    if (!re.test(v)) continue;
    if (picked.indexOf(v) >= 0) continue;
    picked.push(v);
  }
  // 兜底：干扰项被过滤光（极少见）时用邻近分钟补，保证永远是 4 个
  var fill = 5;
  while (picked.length < 3 && fill < 200) {
    var v2 = g.unit === 'time24' ? fmt24((fill * 7) % 24, 0) : fmt12((fill % 12) + 1, (fill * 5) % 60);
    if (v2 !== g.answer && picked.indexOf(v2) < 0 && re.test(v2)) picked.push(v2);
    fill++;
  }
  var options = [{ v: g.answer, ok: true }];
  picked.forEach(function (v3) { options.push({ v: v3, ok: false }); });
  return shuffled(options, rnd);
}

// ============ 主入口 ============

function gen(level, seed) {
  var lv = clampLevel(level);
  var ti = tierIndex(lv);
  var tier = TIERS[ti];
  var rnd = rng(seed || (lv * 7919 + 13));
  var kind = pickWeighted(tier.weights, rnd);
  var g = GENERATORS[kind](rnd, ti);
  g.kind = kind;
  var ang = anglesOf(g.face.h, g.face.m);
  return {
    level: lv,
    tierIndex: ti,
    tierName: tier.name,
    kind: kind,
    kindName: KIND_NAMES[kind],
    prompt: g.prompt,
    sub: g.sub,
    face: g.face,
    hourDeg: ang.hour,
    minDeg: ang.minute,
    answer: g.answer,
    rule: g.rule,
    unit: g.unit,
    options: buildOptions(g, rnd)
  };
}

/** 一整关（10 题），同关去重：时钟题参数空间不大，撞题很容易 */
function genLevel(level, seed, count) {
  var lv = clampLevel(level);
  var n = parseInt(count, 10) || QUESTIONS_PER_LEVEL;
  var base = seed || (lv * 7919 + 13);
  var out = [];
  var seen = {};
  for (var i = 0; i < n; i++) {
    var s = (base + i * 104729) >>> 0;
    var q = gen(lv, s);
    var k = q.kind + '|' + q.face.h + ':' + q.face.m + '|' + q.prompt + '|' + q.answer;
    var guard = 0;
    while (seen[k] && guard < 20) {
      guard++;
      s = (s + 7919 * guard) >>> 0;
      q = gen(lv, s);
      k = q.kind + '|' + q.face.h + ':' + q.face.m + '|' + q.prompt + '|' + q.answer;
    }
    seen[k] = 1;
    out.push(q);
  }
  return out;
}

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
  // 工具（页面/单测共用，避免两边各写一份时刻格式化）
  fmt12: fmt12,
  fmt24: fmt24,
  addMinutes: addMinutes,
  anglesOf: anglesOf,
  _rng: rng
};
