/**
 * game/math24.js —— 算 24 点引擎（B6-4）
 *
 * 职责：
 *   1. 有理数四则（精确分数，避免浮点误差）
 *   2. hasSolution(nums)：给定 4 数（任意顺序/括号）能否用 +−×÷ 得 24（穷举）
 *   3. 生成固定关卡：随机 4 数（1~13）过滤出「有解」，供 UI 逐步合成
 *
 * UI 交互（pages/math24）：用户每次选 2 张当前数字牌 + 运算符 → 合成为新牌，
 * 集合 4→3→2→1；最后一张 =24 即胜（与任意括号等价的合成路径）。
 * 本模块提供数值与判定，页面负责交互与状态。
 */

'use strict';

/**
 * 有理数：{ n: 分子(可为负), d: 分母(>0) }
 */
function frac(n, d) {
  if (d === 0) return null; // 除以 0 无意义
  var g = gcd(Math.abs(n), Math.abs(d));
  n /= g; d /= g;
  if (d < 0) { n = -n; d = -d; }
  return { n: n, d: d };
}

function gcd(a, b) {
  while (b) { var t = a % b; a = b; b = t; }
  return a;
}

function add(a, b) { return frac(a.n * b.d + b.n * a.d, a.d * b.d); }
function sub(a, b) { return frac(a.n * b.d - b.n * a.d, a.d * b.d); }
function mul(a, b) { return frac(a.n * b.n, a.d * b.d); }
function div(a, b) { return b.n === 0 ? null : frac(a.n * b.d, a.d * b.n); }

function eq24(x) { return x !== null && x.n === 24 && x.d === 1; }

/**
 * 穷举一组数（递归合并任两数）能否得 target（默认 24）。
 * @param {Array<number>} vals 整数数组（长度 1..4）
 * @param {number} target 目标整数
 */
function hasSolution(vals, target) {
  if (typeof target !== 'number') target = 24;
  var nums = vals.map(function (v) { return { n: v, d: 1 }; });

  function solve(list) {
    if (list.length === 1) return list[0].n === target && list[0].d === 1;
    // 任取两数，任意 op
    for (var i = 0; i < list.length; i++) {
      for (var j = 0; j < list.length; j++) {
        if (i === j) continue;
        var rest = [];
        for (var k = 0; k < list.length; k++) {
          if (k !== i && k !== j) rest.push(list[k]);
        }
        var ops = [
          add(list[i], list[j]),
          sub(list[i], list[j]),
          mul(list[i], list[j]),
          div(list[i], list[j])
        ];
        for (var o = 0; o < ops.length; o++) {
          if (ops[o] === null) continue;
          if (solve(rest.concat([ops[o]]))) return true;
        }
      }
    }
    return false;
  }
  return solve(nums);
}

/**
 * 能否「只用整数中间结果」凑出 target —— 难度分档的判据。
 *
 * 与 hasSolution 同构，但要求每一步的中间结果都是整数：
 * 像 3 3 8 8 必须借助分数（8 ÷ (3 − 8÷3) = 24）才能解出，这里会判为 false，
 * 因此「有解但整数解不出」= 需要分数的高难题。
 *
 * @param {Array<number>} vals 整数数组（长度 1..4）
 * @param {number} [target=24] 目标整数
 * @returns {boolean}
 */
function hasIntegerSolution(vals, target) {
  var goal = typeof target === 'number' ? target : 24;

  function walk(list) {
    if (list.length === 1) return list[0].n === goal && list[0].d === 1;
    for (var i = 0; i < list.length; i++) {
      for (var j = 0; j < list.length; j++) {
        if (i === j) continue;
        var rest = [];
        for (var k = 0; k < list.length; k++) {
          if (k !== i && k !== j) rest.push(list[k]);
        }
        var cands = [
          add(list[i], list[j]),
          sub(list[i], list[j]),
          mul(list[i], list[j]),
          div(list[i], list[j])
        ];
        for (var o = 0; o < cands.length; o++) {
          var c = cands[o];
          if (!c || c.d !== 1) continue;   // 只接受整数中间结果
          if (walk(rest.concat([c]))) return true;
        }
      }
    }
    return false;
  }

  return walk(vals.map(function (v) { return { n: v, d: 1 }; }));
}

/**
 * 生成有解关卡（4 数 1~13，确保可达 24）。
 * @param {number} count 关卡数
 * @param {number} maxN 数字上限（早期简单用小值）
 */
function generateLevels(count, maxN) {
  var out = [];
  var seen = {};
  var guard = 0;
  while (out.length < count && guard++ < 20000) {
    var nums = [];
    for (var i = 0; i < 4; i++) nums.push(1 + Math.floor(Math.random() * maxN));
    var key = nums.slice().sort().join(',');
    if (seen[key]) continue;
    if (!hasSolution(nums)) continue;
    seen[key] = 1;
    out.push(nums);
  }
  return out;
}

/**
 * 把有理数渲染为可读串（整数直接显示；分数显示 n/d 或 a 又 b/d 的简化形式）
 */
function fracText(f) {
  if (!f) return '—';
  if (f.d === 1) return String(f.n);
  if (Math.abs(f.n) < Math.abs(f.d)) return f.n + '/' + f.d;
  var whole = Math.floor(f.n / f.d);
  var rem = Math.abs(f.n % f.d);
  return whole + '又' + rem + '/' + f.d;
}

/**
 * 解析并求值带括号的四则表达式（支持 + - * / 与 ()，空格忽略）。
 * 返回精确有理数 {n,d}；语法错误/除零返回 null。
 * @param {string} expr 如 "(10-4)*(2+2)"
 * @returns {{n:number,d:number}|null}
 */
function evaluateExpr(expr) {
  if (typeof expr !== 'string') return null;
  var s = expr.replace(/\s+/g, '');
  if (!s.length) return null;
  var pos = 0;

  function parseExpr() {
    var v = parseTerm();
    if (v === null) return null;
    for (;;) {
      var ch = s.charAt(pos);
      if (ch === '+') { pos++; var r = parseTerm(); if (r === null) return null; v = add(v, r); }
      else if (ch === '-') { pos++; var r2 = parseTerm(); if (r2 === null) return null; v = sub(v, r2); }
      else break;
    }
    return v;
  }
  function parseTerm() {
    var v = parseFactor();
    if (v === null) return null;
    for (;;) {
      var ch = s.charAt(pos);
      if (ch === '*') { pos++; var r = parseFactor(); if (r === null) return null; v = mul(v, r); }
      else if (ch === '/' || ch === '÷') { pos++; var r2 = parseFactor(); if (r2 === null) return null; v = div(v, r2); if (v === null) return null; }
      else break;
    }
    return v;
  }
  function parseFactor() {
    var ch = s.charAt(pos);
    if (ch === '(') {
      pos++;
      var v = parseExpr();
      if (v === null) return null;
      if (s.charAt(pos) !== ')') return null;
      pos++;
      return v;
    }
    if (ch === '-') { pos++; var neg = parseFactor(); return neg === null ? null : frac(-neg.n, neg.d); }
    // 数字（整数或小数）
    var m = /^(\d+(?:\.\d+)?)/.exec(s.slice(pos));
    if (!m) return null;
    pos += m[1].length;
    var num = parseFloat(m[1]);
    // 转分数（小数按 10^decimals）
    var decPart = m[1].split('.')[1];
    if (decPart) {
      var den = Math.pow(10, decPart.length);
      var num2 = Math.round(num * den);
      return frac(num2, den);
    }
    return frac(num, 1);
  }

  var result = parseExpr();
  if (result === null) return null;
  if (pos !== s.length) return null; // 尾部有未消费字符（如多余括号）
  return result;
}

module.exports = {
  hasSolution: hasSolution,
  generateLevels: generateLevels,
  hasSolution: hasSolution,
  hasIntegerSolution: hasIntegerSolution,
  evaluateExpr: evaluateExpr,
  add: add, sub: sub, mul: mul, div: div,
  eq24: eq24,
  frac: frac,
  fracText: fracText
};
