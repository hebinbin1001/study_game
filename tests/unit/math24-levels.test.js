/**
 * math24-levels.test.js —— 「算 24 点」固定关卡库校验
 *
 * 关卡库由 e2e/gen-math24-levels.js 自动生成（穷举 1~13 全部四数组合 + 精确求解器校验）。
 * 本文件守的是「题库质量」这条底线 —— 任何一关无解、重复、或难度分档标错，都必须被拦住：
 *   · 无解 → 玩家怎么算都过不去；
 *   · 重复 → 关卡列表出现两道一模一样的题；
 *   · 分档错 → 入门档出现必须用分数的题，会直接劝退。
 *
 * 运行：node tests/unit/math24-levels.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('data/math24-levels.js 关卡库');

const db = require('../../miniprogram/data/math24-levels');
const m24 = require('../../miniprogram/game/math24');

s.test('结构：60 关、编号连续、每关 4 个数字', () => {
  s.assert.equal(db.total, db.levels.length, 'total 应与实际关卡数一致');
  s.assert.equal(db.levels.length, 60);
  db.levels.forEach(function (lv, i) {
    s.assert.equal(lv.no, i + 1, '第 ' + (i + 1) + ' 项编号应为 ' + (i + 1));
    s.assert.equal(lv.nums.length, 4, '第 ' + lv.no + ' 关应有 4 个数字');
  });
});

s.test('数字范围：全部落在 1~13（扑克牌点数）', () => {
  db.levels.forEach(function (lv) {
    lv.nums.forEach(function (n) {
      s.assert.ok(Number.isInteger(n) && n >= 1 && n <= 13,
        '第 ' + lv.no + ' 关出现非法数字 ' + n);
    });
  });
});

s.test('每关都有解（无解关卡玩家永远过不去）', () => {
  db.levels.forEach(function (lv) {
    s.assert.ok(m24.hasSolution(lv.nums, 24),
      '第 ' + lv.no + ' 关无解：' + lv.nums.join(','));
  });
});

s.test('题面全局唯一（不出现两道一样的题）', () => {
  const seen = {};
  db.levels.forEach(function (lv) {
    const key = lv.nums.slice().sort(function (a, b) { return a - b; }).join(',');
    s.assert.ok(!seen[key], '第 ' + lv.no + ' 关与第 ' + seen[key] + ' 关重复：' + key);
    seen[key] = lv.no;
  });
});

s.test('分档：入门只用小数字且整数可解', () => {
  const easy = db.levels.filter(function (lv) { return lv.tier === '入门'; });
  s.assert.equal(easy.length, 20, '入门档应为 20 关');
  easy.forEach(function (lv) {
    s.assert.ok(Math.max.apply(null, lv.nums) <= 9,
      '第 ' + lv.no + ' 关（入门）含 10 以上数字：' + lv.nums.join(','));
    s.assert.ok(m24.hasIntegerSolution(lv.nums, 24),
      '第 ' + lv.no + ' 关（入门）整数解不出，对新手过难：' + lv.nums.join(','));
  });
});

s.test('分档：中级用到 10~13 且整数可解', () => {
  const mid = db.levels.filter(function (lv) { return lv.tier === '中级'; });
  s.assert.equal(mid.length, 24, '中级档应为 24 关');
  mid.forEach(function (lv) {
    s.assert.ok(Math.max.apply(null, lv.nums) >= 10,
      '第 ' + lv.no + ' 关（中级）全是小数字，应归入门：' + lv.nums.join(','));
    s.assert.ok(m24.hasIntegerSolution(lv.nums, 24),
      '第 ' + lv.no + ' 关（中级）整数解不出：' + lv.nums.join(','));
  });
});

s.test('分档：高级必须借助分数中间结果（1~13 里共 16 组）', () => {
  const hard = db.levels.filter(function (lv) { return lv.tier === '高级'; });
  s.assert.equal(hard.length, 16, '高级档应为 16 关（数学上限）');
  hard.forEach(function (lv) {
    s.assert.ok(m24.hasSolution(lv.nums, 24),
      '第 ' + lv.no + ' 关（高级）无解：' + lv.nums.join(','));
    s.assert.ok(!m24.hasIntegerSolution(lv.nums, 24),
      '第 ' + lv.no + ' 关（高级）整数即可解，不该标为高级：' + lv.nums.join(','));
  });
});

s.test('档位顺序：入门 → 中级 → 高级 依次排列且不交叉', () => {
  const order = ['入门', '中级', '高级'];
  let last = 0;
  db.levels.forEach(function (lv) {
    const idx = order.indexOf(lv.tier);
    s.assert.ok(idx >= 0, '第 ' + lv.no + ' 关档位未知：' + lv.tier);
    s.assert.ok(idx >= last, '第 ' + lv.no + ' 关档位回退（' + lv.tier + '）');
    last = idx;
  });
});

s.test('难度递增：入门档最大数字 < 中级档最大数字', () => {
  const easyMax = Math.max.apply(null, db.levels
    .filter(function (lv) { return lv.tier === '入门'; })
    .map(function (lv) { return Math.max.apply(null, lv.nums); }));
  const midMin = Math.min.apply(null, db.levels
    .filter(function (lv) { return lv.tier === '中级'; })
    .map(function (lv) { return Math.max.apply(null, lv.nums); }));
  s.assert.ok(easyMax < midMin, '入门(' + easyMax + ") 与中级(" + midMin + ') 的数字规模应有区分');
});

s.done();
