/**
 * math-sprint.test.js —— 口算冲刺引擎单测（玩法落地：demo g6）
 *
 * 覆盖 game/math-sprint.js：按用时升档出题、选项生成、连击倍率、计分与星级。
 * 这些规则直接决定「玩起来公不公平」，所以逐条锁死。
 *
 * 运行：node tests/unit/math-sprint.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/math-sprint.js');

const m = require('../../miniprogram/game/math-sprint');

s.test('常量：单局 60 秒、答错扣 2.5 秒', () => {
  s.assert.equal(m.TOTAL_MS, 60000);
  s.assert.equal(m.WRONG_PENALTY_MS, 2500);
});

s.test('出题升档：前 20s 加减、20~42s 乘除、之后混合', () => {
  for (let i = 0; i < 30; i++) {
    const a = m.makeQuestion(0);
    s.assert.equal(a.tier, '加减');
    s.assert.ok(a.expr.indexOf('+') !== -1 || a.expr.indexOf('−') !== -1, '加减档不应出现乘号：' + a.expr);
    s.assert.ok(Number.isInteger(a.ans) && a.ans >= 1, '答案应为正整数（不应出现负数题）：' + a.expr + ' = ' + a.ans);
  }
  for (let i = 0; i < 30; i++) {
    const b = m.makeQuestion(25000);
    s.assert.equal(b.tier, '乘除');
    s.assert.ok(b.ans >= 0);
  }
  for (let i = 0; i < 30; i++) {
    const c = m.makeQuestion(50000);
    s.assert.equal(c.tier, '混合');
    s.assert.ok(c.ans >= 0);
  }
});

s.test('出题正确性：算式求值等于答案（抽查 200 题）', () => {
  for (let i = 0; i < 200; i++) {
    const q = m.makeQuestion([0, 15000, 25000, 40000, 50000][i % 5]);
    // 把展示用符号换成 JS 可求值的形式（× → *，− → -），按先乘后加求值
    const js = q.expr.replace(/×/g, '*').replace(/−/g, '-').replace(/\s+/g, '');
    s.assert.equal(eval(js), q.ans, '算式应等于答案：' + q.expr + ' 期望 ' + q.ans);
  }
});

s.test('选项：4 个、两两不同、必含正确答案', () => {
  for (let i = 0; i < 100; i++) {
    const ans = 7 + i;
    const opts = m.makeOptions(ans, 4);
    s.assert.equal(opts.length, 4);
    s.assert.equal(new Set(opts).size, 4, '选项不应重复：' + JSON.stringify(opts));
    s.assert.ok(opts.indexOf(ans) !== -1, '必须包含正确答案 ' + ans);
    opts.forEach(function (v) {
      s.assert.ok(Number.isInteger(v) && v >= 0, '选项应为非负整数：' + v);
    });
  }
});

s.test('连击倍率：每连对 3 题 +1 倍，最高 3 倍', () => {
  s.assert.equal(m.multiplier(0), 1);
  s.assert.equal(m.multiplier(2), 1);
  s.assert.equal(m.multiplier(3), 2);
  s.assert.equal(m.multiplier(5), 2);
  s.assert.equal(m.multiplier(6), 3);
  s.assert.equal(m.multiplier(99), 3, '倍率应封顶在 3');
});

s.test('计分：10 分 × 当前倍率', () => {
  s.assert.equal(m.scoreOf(0), 10);
  s.assert.equal(m.scoreOf(2), 10);
  s.assert.equal(m.scoreOf(3), 20);
  s.assert.equal(m.scoreOf(6), 30);
});

s.test('星级阈值：400 / 250 / 120', () => {
  s.assert.equal(m.starsFor(0), 0);
  s.assert.equal(m.starsFor(119), 0);
  s.assert.equal(m.starsFor(120), 1);
  s.assert.equal(m.starsFor(249), 1);
  s.assert.equal(m.starsFor(250), 2);
  s.assert.equal(m.starsFor(399), 2);
  s.assert.equal(m.starsFor(400), 3);
});

s.test('满分局可达：60 秒理想节奏下能拿到 3 星阈值', () => {
  // 每秒答 1 题、连对到底：前 3 题 ×10、接着 3 题 ×20、其余 ×30
  let score = 0;
  for (let combo = 0; combo < 60; combo++) score += m.scoreOf(combo);
  s.assert.ok(score >= 400, '连对到底应远超 3 星阈值，实际 ' + score);
});

s.done();
