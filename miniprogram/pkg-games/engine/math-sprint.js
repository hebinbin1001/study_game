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
 * 年级档位 → 数值范围倍数（2026-09-13 加，2026-10-09 修）。
 *
 * ⚠️ 修的是一个「高年级反而更简单」的线上 bug：
 *   这张表最初按**旧的 7 档学段**写的，且上界写死 `gradeIdx > 6 → return 1`。
 *   学段按年级细分成 14 档后，初一~大学（idx 7~13）全部落进 fallback，
 *   倍率变回基准 1 —— 实测六年级最大数字 48，初一反而掉到 20（二年级水平）。
 *   现在扩成 14 档、上界用 SCALE.length（再加学段时倍率表会自己兜住，而不是静默回落）。
 *
 * 不传 / 非法 → 返回 1，保持老入口（不传学段的调用）手感不变。
 * @param {number} gradeIdx 学段序号 0~13（对应 constants.GRADES）
 */
var GRADE_SCALE = [0.6, 0.7, 0.8, 0.9, 1.0, 1.15, 1.3, 1.45, 1.6, 1.75, 1.9, 2.05, 2.2, 2.4];

function gradeScale(gradeIdx) {
  if (typeof gradeIdx !== 'number' || gradeIdx < 0 || gradeIdx >= GRADE_SCALE.length) return 1;
  return GRADE_SCALE[gradeIdx];
}

/** 按倍数缩放随机上界（保底 2，避免出现 0/1 这种没意义的题面） */
function scaled(lo, hi, scale) {
  var top = Math.max(2, Math.round(hi * scale));
  var low = Math.min(lo, top);
  return rnd(Math.max(1, Math.round(low)), top);
}

/**
 * 按已用时间出题。
 * @param {number} elapsedMs 本局已用毫秒
 * @returns {{expr:string, ans:number, tier:string}}
 */
function makeQuestion(elapsedMs, gradeIdx) {
  var t = elapsedMs || 0;
  var k = gradeScale(gradeIdx);
  var a, b, c, expr, ans, tier;
  if (t < 20000) {
    tier = '加减';
    if (Math.random() < 0.5) {
      a = scaled(2, 12, k); b = scaled(2, 8, k);
      expr = a + ' + ' + b; ans = a + b;
    }
    else {
      // 减法必须保证被减数更大：否则会出「8 − 9 = −1」这种负数题（低龄心算不该出现负数）
      a = scaled(9, 20, k);
      b = scaled(2, Math.min(9, a - 1), k);
      expr = a + ' − ' + b; ans = a - b;
    }
  } else if (t < 42000) {
    tier = '乘除';
    if (Math.random() < 0.55) {
      a = scaled(2, 9, k); b = scaled(2, 9, k);
      expr = a + ' × ' + b; ans = a * b;
    } else {
      a = scaled(20, 60, k); b = scaled(5, 19, k);
      expr = a + ' + ' + b; ans = a + b;
    }
  } else {
    tier = '混合';
    if (Math.random() < 0.5) {
      a = scaled(2, 9, k); b = scaled(2, 9, k); c = scaled(1, 9, k);
      expr = a + ' × ' + b + ' + ' + c; ans = a * b + c;
    } else {
      a = scaled(40, 99, k); b = scaled(11, 39, k);
      expr = a + ' − ' + b; ans = a - b;
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
  // 导出倍率表与换算函数（2026-10-09）：单测直接断言"14 档单调不减"，
  // 比反复随机采样出题去猜上限稳定得多（BUG-4b 的建议做法）。
  GRADE_SCALE: GRADE_SCALE,
  gradeScale: gradeScale,
  WRONG_PENALTY_MS: WRONG_PENALTY_MS,
  makeQuestion: makeQuestion,
  makeOptions: makeOptions,
  multiplier: multiplier,
  scoreOf: scoreOf,
  starsFor: starsFor
};
