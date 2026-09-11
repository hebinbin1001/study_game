/**
 * memory-grid.test.js —— 记忆矩阵引擎单测（玩法落地：demo g7）
 *
 * 覆盖 game/memory-grid.js：关卡参数（亮几格 / 展示多久）、目标格抽取、星级。
 * 这几条直接决定"这关还能不能玩得下去"（比如一次亮 20 格就是劝退），所以逐条锁死。
 *
 * 运行：node miniprogram/utils/__tests__/memory-grid.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/memory-grid.js');

const g = require('../../game/memory-grid');

s.test('网格规模：5×5 = 25 格', () => {
  s.assert.equal(g.GRID, 25);
});

s.test('亮格数：第 1 关 3 个，逐关 +1，封顶 8', () => {
  s.assert.equal(g.targetCount(1), 3);
  s.assert.equal(g.targetCount(2), 4);
  s.assert.equal(g.targetCount(5), 7);
  s.assert.equal(g.targetCount(6), 8);
  s.assert.equal(g.targetCount(10), 8, '应封顶在 8 格');
  s.assert.equal(g.targetCount(99), g.MAX_TARGETS);
  for (let lv = 1; lv <= 20; lv++) {
    s.assert.ok(g.targetCount(lv) <= g.GRID, '亮格数不应超过网格总数');
  }
});

s.test('展示时长：逐关缩短，且不低于 650ms（低于这个就纯靠蒙）', () => {
  s.assert.equal(g.showMs(1), 1500);
  s.assert.ok(g.showMs(2) < g.showMs(1));
  s.assert.ok(g.showMs(5) < g.showMs(2));
  for (let lv = 1; lv <= 30; lv++) {
    s.assert.ok(g.showMs(lv) >= 650, '第 ' + lv + ' 关展示时长过短：' + g.showMs(lv));
  }
  s.assert.equal(g.showMs(30), 650, '应封底在 650ms');
});

s.test('抽目标格：数量正确、范围合法、互不重复', () => {
  for (let i = 0; i < 200; i++) {
    const n = 3 + (i % 6);
    const t = g.pickTargets(n, g.GRID);
    s.assert.equal(t.length, n);
    s.assert.equal(new Set(t).size, n, '目标格不应重复：' + JSON.stringify(t));
    t.forEach(function (v) {
      s.assert.ok(Number.isInteger(v) && v >= 0 && v < g.GRID, '目标格越界：' + v);
    });
  }
});

s.test('抽目标格：边界（0 个 / 全选 / 超出总数）', () => {
  s.assert.equal(g.pickTargets(0, g.GRID).length, 0);
  s.assert.equal(g.pickTargets(g.GRID, g.GRID).length, g.GRID);
  s.assert.equal(g.pickTargets(999, g.GRID).length, g.GRID, '超出总数时应最多取满');
});

s.test('抽目标格：注入随机源可复现（同种子同结果）', () => {
  const rnd = function () { return 0; };   // 永远取当前池第 0 个
  s.assert.deepEqual(g.pickTargets(3, g.GRID, rnd), [0, 1, 2]);
});

s.test('星级：通过关数 2 / 4 / 6 分三档', () => {
  s.assert.equal(g.starsFor(0), 0);
  s.assert.equal(g.starsFor(1), 0);
  s.assert.equal(g.starsFor(2), 1);
  s.assert.equal(g.starsFor(3), 1);
  s.assert.equal(g.starsFor(4), 2);
  s.assert.equal(g.starsFor(5), 2);
  s.assert.equal(g.starsFor(6), 3);
  s.assert.equal(g.starsFor(99), 3);
});

s.done();
