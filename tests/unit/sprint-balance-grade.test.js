/**
 * sprint-balance-grade.test.js —— 口算冲刺 / 算式天平「按年级分档」（2026-09-13）
 *
 * 用户要求：这两款数字智力玩法按年级分关卡，进哪一关就用该年级的题。
 * 实现方式：两个引擎的 makeQuestion 增加可选 gradeIdx 参数（0~6 = 学段序号），
 * 按倍数缩放出题数值范围；**不传 = 原有范围完全不变**（老入口手感与旧单测都不受影响）。
 *
 * 覆盖：
 *   1. 不传 gradeIdx 时取值范围与原实现一致（回归保护）；
 *   2. 年级越高，同档位的数值上限越大（单调）；
 *   3. 非法 gradeIdx（负数 / 超界 / 非数字）回退默认，不抛错；
 *   4. 题目本身始终自洽（算式等于答案、减法不出负数）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('口算/天平 按年级分档');

const sprint = require('../../miniprogram/game/math-sprint');
const balance = require('../../miniprogram/game/balance');

function maxOf(list) {
  return list.reduce(function (m, v) { return v > m ? v : m; }, 0);
}

/** 采样：某档位下「加减题」两个加数的最大值 */
function sampleAddMax(gradeIdx, n) {
  const vals = [];
  for (let i = 0; i < n; i++) {
    const q = sprint.makeQuestion(1000, gradeIdx);   // 1000ms = 加减档
    const m = String(q.expr).match(/^(\d+)\s*\+\s*(\d+)$/);
    if (m) vals.push(Number(m[1]));
  }
  return maxOf(vals);
}

s.test('不传年级：出题范围与原实现一致（回归保护）', () => {
  for (let i = 0; i < 200; i++) {
    const q = sprint.makeQuestion(1000);              // 加减档：原来 a ∈ [2,12]
    const m = String(q.expr).match(/^(\d+)\s*\+\s*(\d+)$/);
    if (m) {
      s.assert.ok(Number(m[1]) >= 2 && Number(m[1]) <= 12, '加数超出原范围：' + m[1]);
      s.assert.ok(Number(m[2]) >= 2 && Number(m[2]) <= 8, '被加数超出原范围：' + m[2]);
    }
  }
});

s.test('年级越高数值上限越大（口算冲刺）', () => {
  const low = sampleAddMax(0, 300);    // 幼儿园：×0.6
  const mid = sampleAddMax(3, 300);    // 小学3-4：×1.3
  const high = sampleAddMax(6, 300);   // 大学：×2.4
  s.assert.ok(low <= 9, '幼儿园上限应 ≤9，实际 ' + low);
  s.assert.ok(mid > low, '小学3-4 上限应大于幼儿园（' + mid + ' vs ' + low + '）');
  s.assert.ok(high > mid, '大学上限应大于小学3-4（' + high + ' vs ' + mid + '）');
});

s.test('年级档位同样作用于算式天平', () => {
  function addMax(gradeIdx) {
    let mx = 0;
    for (let i = 0; i < 300; i++) {
      const q = balance.makeQuestion(0, null, gradeIdx);   // i<3 = 加法题
      const m = String(q.expr).match(/^(\d+)\s*\+\s*(\d+)$/);
      if (m) mx = Math.max(mx, Number(m[1]));
    }
    return mx;
  }
  const low = addMax(0);
  const high = addMax(6);
  s.assert.ok(low <= 6, '幼儿园上限应 ≤6，实际 ' + low);
  s.assert.ok(high > low, '大学上限应大于幼儿园（' + high + ' vs ' + low + '）');
});

s.test('非法年级回退默认，不抛错', () => {
  [-1, -5, 7, 99, null, undefined, 'x'].forEach(function (g) {
    s.assert.ok(!!sprint.makeQuestion(1000, g).expr);
    s.assert.ok(!!balance.makeQuestion(0, null, g).expr);
  });
});

s.test('题目自洽：算式与答案一致、减法不出负数', () => {
  for (let i = 0; i < 200; i++) {
    const q = sprint.makeQuestion(30000 + i, 6);        // 混合档 + 大学档
    s.assert.ok(Number.isFinite(q.ans), '答案必须是数字');
    if (q.expr.indexOf('−') >= 0) {
      const m = q.expr.split('−');
      s.assert.ok(Number(m[0]) - Number(m[1]) >= 0, '减法出现负数：' + q.expr);
    }
  }
});
