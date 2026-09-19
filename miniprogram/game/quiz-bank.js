/**
 * game/quiz-bank.js —— 限时抢答的「题目组装」（2026-09-19）
 *
 * 从一条词条 + 同段词库造出「一句话题干 + 4 个候选词」。
 * 单独拆出来是因为这里规则最多（题干怎么取、干扰项怎么选、什么时候这题不能用），
 * 拆成纯函数就能单测（见 tests/unit/quiz-bank.test.js）。
 *
 * 题干口径：
 *   · 优先用释义/提示（hint）——「看释义抢词」是抢答最自然的形态；
 *   · hint 缺失时退用题面（把 w2/c2 的 `*` 模板去掉星号当提示）；
 *   · 若题干与答案相同（如 c1 的 q=云、a=云），说明提示没信息量 → 该题判为不可用。
 *
 * 干扰项口径：同段词库里**同题型**的其它答案优先，不足时用同段其它答案补齐；
 * 仍不足（词库太小）时用兜底池。保证恰好 4 个互不相同的候选，且正确答案出现一次。
 */

'use strict';

var question = require('./question');

/** 选项数量（1 正确 + 3 干扰） */
var OPTION_COUNT = 4;

/** 兜底候选（词库过小时用来凑数） */
var FALLBACK = ['苹果', '学校', '朋友', '春天', 'water', 'apple', 'happy', 'music'];

/** 判断题面是否「没信息量」：去掉挖空星号后等于答案 */
function stemOf(item) {
  var hint = String(item.hint || '').trim();
  if (hint) return hint;
  var q = String(question.getWord(item) || '').replace(/\*/g, '').trim();
  return q;
}

/** 答案取完整词（w2/c2 的 a 是完整答案；其余 a 即答案） */
function answerOf(item) {
  return String(item.a || '').trim();
}

/** 从候选中抽 n 个互不相同的（排除 exclude 里的值） */
function pickDistinct(pool, n, exclude) {
  var out = [];
  var seen = {};
  (exclude || []).forEach(function (x) { seen[x] = true; });
  (pool || []).forEach(function (w) {
    if (out.length >= n) return;
    var t = String(w || '').trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    out.push(t);
  });
  return out;
}

/** 洗牌（用 question 的可注入随机源，保证挑战关卡同种子同牌面） */
function shuffle(arr) {
  var rnd = question.getRandom();
  var f = (typeof rnd === 'function') ? rnd : Math.random;
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(f() * (i + 1));
    var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/**
 * 造题。
 * @param {Object} item 词条
 * @param {Array} bank 同段词库
 * @returns {Object|null} { stem, answer, options:[{text, ok}] }；该词条不适合抢答时返回 null
 */
function buildOptions(item, bank) {
  if (!item) return null;
  var answer = answerOf(item);
  var stem = stemOf(item);
  if (!answer || !stem) return null;
  if (stem === answer) return null;          // 题干=答案（如 c1 的 q/a 相同）→ 不能用

  var list = bank || [];
  var sameType = [];
  var otherType = [];
  list.forEach(function (w) {
    if (!w) return;
    var a = answerOf(w);
    if (!a || a === answer) return;
    if (w.type === item.type) sameType.push(a);
    else otherType.push(a);
  });

  var distract = pickDistinct(sameType, OPTION_COUNT - 1, [answer]);
  if (distract.length < OPTION_COUNT - 1) {
    distract = distract.concat(
      pickDistinct(otherType, OPTION_COUNT - 1 - distract.length, [answer].concat(distract))
    );
  }
  if (distract.length < OPTION_COUNT - 1) {
    distract = distract.concat(
      pickDistinct(FALLBACK, OPTION_COUNT - 1 - distract.length, [answer].concat(distract))
    );
  }
  if (distract.length < OPTION_COUNT - 1) return null;   // 凑不齐 4 选项就跳过这题

  var options = shuffle([answer].concat(distract)).map(function (t) {
    return { text: t, ok: t === answer };
  });
  // 正确答案必须恰好出现一次（防御：理论上不会重复，这里兜一层）
  var okCount = options.filter(function (o) { return o.ok; }).length;
  if (okCount !== 1) return null;

  return { stem: stem, answer: answer, options: options };
}

module.exports = {
  OPTION_COUNT: OPTION_COUNT,
  FALLBACK: FALLBACK,
  stemOf: stemOf,
  answerOf: answerOf,
  pickDistinct: pickDistinct,
  shuffle: shuffle,
  buildOptions: buildOptions
};
