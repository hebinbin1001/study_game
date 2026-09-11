/**
 * game/math-sprint.js —— 口算冲刺引擎（纯逻辑，无 wx 依赖，可单测）
 *
 * 玩法：限时口算，连对越多倍率越高，答错扣时间。
 * 难度按已用时间自动升档（前段加减、中段乘除、后段混合），不需要预设关卡。
 */

'use strict';

var TOTAL_MS = 60000;        // 单局时长
var WRONG_PENALTY_MS = 2500; // 答错扣时

function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

/**
 * 按已用时间出题。
 * @param {number} elapsedMs 本局已用毫秒
 * @returns {{expr:string, ans:number, tier:string}}
 */
function makeQuestion(elapsedMs) {
  var t = elapsedMs || 0;
  var a, b, c, expr, ans, tier;
  if (t < 20000) {
    tier = '加减';
    if (Math.random() < 0.5) { a = rnd(2, 12); b = rnd(2, 8); expr = a + ' + ' + b; ans = a + b; }
    else {
      // 减法必须保证被减数更大：否则会出「8 − 9 = −1」这种负数题（低龄心算不该出现负数）
      a = rnd(9, 20);
      b = rnd(2, Math.min(9, a - 1));
      expr = a + ' − ' + b; ans = a - b;
    }
  } else if (t < 42000) {
    tier = '乘除';
    if (Math.random() < 0.55) { a = rnd(2, 9); b = rnd(2, 9); expr = a + ' × ' + b; ans = a * b; }
    else { a = rnd(20, 60); b = rnd(5, 19); expr = a + ' + ' + b; ans = a + b; }
  } else {
    tier = '混合';
    if (Math.random() < 0.5) {
      a = rnd(2, 9); b = rnd(2, 9); c = rnd(1, 9);
      expr = a + ' × ' + b + ' + ' + c; ans = a * b + c;
    } else {
      a = rnd(40, 99); b = rnd(11, 39); expr = a + ' − ' + b; ans = a - b;
    }
  }
  return { expr: expr, ans: ans, tier: tier };
}

/**
 * 生成 4 个选项（含正确答案，两两不同）。
 * @param {number} ans 正确答案
 * @param {number} [n=4] 选项个数
 * @returns {number[]} 打乱后的选项
 */
function makeOptions(ans, n) {
  var count = n || 4;
  var set = {};
  set[ans] = true;
  var out = [];
  var spread = ans > 30 ? 6 : 4;
  var guard = 0;
  while (out.length < count - 1 && guard++ < 200) {
    var v = ans + rnd(1, spread) * (Math.random() < 0.5 ? -1 : 1);
    if (v < 0 || set[v]) continue;
    set[v] = true;
    out.push(v);
  }
  var all = [ans].concat(out);
  for (var i = all.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = all[i]; all[i] = all[j]; all[j] = t;
  }
  return all;
}

/** 连击倍率：每连对 3 题 +1 倍，最高 3 倍 */
function multiplier(combo) {
  return 1 + Math.min(2, Math.floor((combo || 0) / 3));
}

/** 答对一题的得分 = 10 × 倍率 */
function scoreOf(combo) {
  return 10 * multiplier(combo);
}

/** 星级：按总分（400 / 250 / 120 三档） */
function starsFor(score) {
  if (score >= 400) return 3;
  if (score >= 250) return 2;
  if (score >= 120) return 1;
  return 0;
}

module.exports = {
  TOTAL_MS: TOTAL_MS,
  WRONG_PENALTY_MS: WRONG_PENALTY_MS,
  makeQuestion: makeQuestion,
  makeOptions: makeOptions,
  multiplier: multiplier,
  scoreOf: scoreOf,
  starsFor: starsFor
};
