/**
 * game/balance.js —— 算式天平引擎（纯逻辑，无 wx 依赖，可单测）
 *
 * 玩法（来自 demo g5）：左盘给一道算式，从下面四个数字里挑一个放到右盘；
 * 放对了天平平衡（横梁归零），放错了右盘下沉（数字偏大）或上翘（数字偏小）。
 *
 * 难度随题号爬坡：加 → 减 → 乘 → 混合；每题 4 个选项，错项与答案相邻不超 5。
 * 关联：pages/math-balance
 */

'use strict';

var ROUND_Q = 10;     // 每局题数
var LIVES = 3;        // 初始命数
var POINTS = 10;      // 每题得分
var TILT_DEG = 11;    // 天平倾斜角度（视觉反馈用）

function rnd(a, b, random) {
  var r = random || Math.random;
  return a + Math.floor(r() * (b - a + 1));
}

/**
 * 出题：题号越大越难。
 * @param {number} idx 题号（0 起）
 * @param {Function} [random] 随机源（单测可注入）
 * @returns {{expr:string, ans:number, label:string}}
 */
function makeQuestion(idx, random) {
  var i = Math.max(0, idx || 0);
  var a, b, c, expr, ans, label;
  if (i < 3) {
    a = rnd(2, 9, random); b = rnd(2, 9, random);
    expr = a + ' + ' + b; ans = a + b; label = '加法';
  } else if (i < 6) {
    a = rnd(11, 20, random); b = rnd(2, 9, random);
    expr = a + ' − ' + b; ans = a - b; label = '减法';
  } else if (i < 8) {
    a = rnd(2, 9, random); b = rnd(2, 9, random);
    expr = a + ' × ' + b; ans = a * b; label = '乘法';
  } else {
    a = rnd(2, 5, random); b = rnd(2, 5, random); c = rnd(1, 9, random);
    expr = a + ' × ' + b + ' + ' + c; ans = a * b + c; label = '混合';
  }
  return { expr: expr, ans: ans, label: label };
}

/**
 * 错项（不含正确答案）：与答案的差在 1~5 以内，全部为正数、互不重复。
 * @returns {number[]} 长度 <= count-1
 */
function makeOptions(ans, count, random) {
  var n = count || 4;
  var used = {};
  used[ans] = true;
  var out = [];
  var guard = 0;
  while (out.length < n - 1 && guard++ < 400) {
    var v = ans + rnd(1, 5, random) * (rnd(0, 1, random) ? 1 : -1);
    if (v < 1 || v > 99 || used[v]) continue;
    used[v] = true;
    out.push(v);
  }
  return out;
}

/** 选项全量（含答案）并打乱 */
function optionSet(ans, count, random) {
  var all = [ans].concat(makeOptions(ans, count, random));
  var r = random || Math.random;
  for (var i = all.length - 1; i > 0; i--) {
    var j = Math.floor(r() * (i + 1));
    var t = all[i]; all[i] = all[j]; all[j] = t;
  }
  return all;
}

/** 横梁角度（度）：右盘重 → 右下沉（正角度）；右盘轻 → 右上翘（负角度） */
function tiltDeg(picked, ans) {
  if (picked === null || picked === undefined || picked === ans) return 0;
  return picked > ans ? TILT_DEG : -TILT_DEG;
}

/** 托盘状态类名：'' | 'ok' | 'bad' */
function panState(picked, ans) {
  if (picked === null || picked === undefined) return '';
  return picked === ans ? 'ok' : 'bad';
}

/** 放错时的提示文案（指出哪边偏了，不直接给答案） */
function tiltHint(picked, ans) {
  if (picked === ans) return '平衡了！';
  return picked > ans ? '右盘太重了' : '右盘太轻了';
}

/** 星级：按答对比例（90% / 70% / 40%） */
function starsFor(right, total) {
  if (!total) return 0;
  var rate = right / total;
  if (rate >= 0.9) return 3;
  if (rate >= 0.7) return 2;
  if (rate >= 0.4) return 1;
  return 0;
}

module.exports = {
  ROUND_Q: ROUND_Q,
  LIVES: LIVES,
  POINTS: POINTS,
  TILT_DEG: TILT_DEG,
  makeQuestion: makeQuestion,
  makeOptions: makeOptions,
  optionSet: optionSet,
  tiltDeg: tiltDeg,
  panState: panState,
  tiltHint: tiltHint,
  starsFor: starsFor
};
