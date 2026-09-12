/**
 * balance.test.js —— 算式天平引擎单测（玩法落地：demo g5）
 *
 * 覆盖 game/balance.js：分档出题（加/减/乘/混合）、错项生成、天平倾斜方向、
 * 托盘状态、星级。倾斜方向是玩法的"教学反馈"，方向写反就等于教错，所以逐档断言。
 *
 * 运行：node tests/unit/balance.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/balance.js');

const g = require('../../miniprogram/game/balance');

function seededRandom(seed) {
  let x = seed || 1;
  return function () {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

s.test('常量：每局 10 题、3 条命、每题 10 分', () => {
  s.assert.equal(g.ROUND_Q, 10);
  s.assert.equal(g.LIVES, 3);
  s.assert.equal(g.POINTS, 10);
});

s.test('出题分档：0~2 加、3~5 减、6~7 乘、8~9 混合', () => {
  const labels = [];
  for (let i = 0; i < g.ROUND_Q; i++) labels.push(g.makeQuestion(i).label);
  s.assert.deepEqual(labels, ['加法', '加法', '加法', '减法', '减法', '减法', '乘法', '乘法', '混合', '混合']);
});

s.test('出题：答案永远是非负整数，算式与答案一致（抽样 300 题）', () => {
  for (let i = 0; i < 300; i++) {
    const q = g.makeQuestion(i % g.ROUND_Q, seededRandom(i + 1));
    s.assert.true(Number.isInteger(q.ans), '答案应为整数：' + q.ans);
    s.assert.ok(q.ans >= 0, '低龄心算不应出现负数：' + q.expr);
    s.assert.ok(q.expr.length > 0);
    // 用同一算式换算出答案，校验出题没有自相矛盾
    const tokens = q.expr.split(' ');
    if (tokens.length === 3) {
      const a = Number(tokens[0]);
      const op = tokens[1];
      const b = Number(tokens[2]);
      const expect = op === '+' ? a + b : (op === '−' ? a - b : a * b);
      s.assert.equal(q.ans, expect, '算式 ' + q.expr + ' 的答案应为 ' + expect);
    } else {
      const a = Number(tokens[0]);
      const b = Number(tokens[2]);
      const c = Number(tokens[4]);
      s.assert.equal(tokens[3], '+', '混合档目前只有 a × b + c');
      s.assert.equal(q.ans, a * b + c, '算式 ' + q.expr + ' 的答案应为 ' + (a * b + c));
    }
  }
});

s.test('减法档：被减数永远大于减数（不出现 8 − 9）', () => {
  for (let i = 0; i < 200; i++) {
    const q = g.makeQuestion(3 + (i % 3), seededRandom(i + 31));
    s.assert.equal(q.label, '减法');
    const a = Number(q.expr.split(' ')[0]);
    const b = Number(q.expr.split(' ')[2]);
    s.assert.ok(a > b, '被减数应更大：' + q.expr);
  }
});

s.test('选项：含正确答案、互不重复、都是 1~99 的正数（抽样 200 题）', () => {
  for (let i = 0; i < 200; i++) {
    const q = g.makeQuestion(i % g.ROUND_Q, seededRandom(i + 7));
    const opts = g.optionSet(q.ans, 4, seededRandom(i + 101));
    s.assert.equal(opts.length, 4);
    s.assert.equal(new Set(opts).size, 4, '选项不应重复：' + JSON.stringify(opts));
    s.assert.ok(opts.indexOf(q.ans) !== -1, '必须包含正确答案');
    opts.forEach(function (v) {
      s.assert.ok(Number.isInteger(v) && v >= 1 && v <= 99, '选项越界：' + v);
    });
  }
});

s.test('错项：与答案的差不超过 5（否则一眼看穿）', () => {
  for (let i = 0; i < 100; i++) {
    const ans = 20 + (i % 40);
    g.makeOptions(ans, 4, seededRandom(i + 3)).forEach(function (v) {
      s.assert.ok(Math.abs(v - ans) <= 5, '错项应靠近答案：' + v + ' vs ' + ans);
    });
  }
});

s.test('天平倾斜：右盘更重就下沉（正角度），更轻就上翘（负角度）', () => {
  s.assert.equal(g.tiltDeg(8, 10), -g.TILT_DEG);
  s.assert.equal(g.tiltDeg(12, 10), g.TILT_DEG);
  s.assert.equal(g.tiltDeg(10, 10), 0);
  s.assert.equal(g.tiltDeg(null, 10), 0, '还没放数字时天平是平的');
  s.assert.true(g.tiltDeg(11, 10) > 0);
  s.assert.true(g.tiltDeg(9, 10) < 0);
});

s.test('托盘状态：未放=空 / 放对=ok / 放错=bad', () => {
  s.assert.equal(g.panState(null, 10), '');
  s.assert.equal(g.panState(10, 10), 'ok');
  s.assert.equal(g.panState(11, 10), 'bad');
  s.assert.equal(g.panState(9, 10), 'bad');
});

s.test('倾斜提示：指出哪边偏了，且不在放对时催错', () => {
  s.assert.equal(g.tiltHint(12, 10), '右盘太重了');
  s.assert.equal(g.tiltHint(8, 10), '右盘太轻了');
  s.assert.equal(g.tiltHint(10, 10), '平衡了！');
});

s.test('星级：按答对比例 90% / 70% / 40% 分三档', () => {
  s.assert.equal(g.starsFor(10, 10), 3);
  s.assert.equal(g.starsFor(9, 10), 3);
  s.assert.equal(g.starsFor(7, 10), 2);
  s.assert.equal(g.starsFor(6, 10), 1, '60% 不足 70%，落到 1 星档');
  s.assert.equal(g.starsFor(4, 10), 1);
  s.assert.equal(g.starsFor(3, 10), 0);
  s.assert.equal(g.starsFor(0, 10), 0);
  s.assert.equal(g.starsFor(0, 0), 0);
});

s.done();
