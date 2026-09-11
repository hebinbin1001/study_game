/**
 * constants.test.js —— utils/constants.js 全局常量与计分单测
 *
 * 覆盖：7 学段枚举、8 类型码、starsByRate 星级阈值（90/70/60/0）、存储 key、游戏配置。
 *
 * 运行：node miniprogram/utils/__tests__/constants.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/constants.js');

const c = require('../constants');

s.test('GRADES：7 个学段且 key/file 覆盖 7 个 JS 模块', () => {
  s.assert.equal(c.GRADES.length, 7);
  const keys = c.GRADES.map((g) => g.key);
  s.assert.deepEqual(keys, ['kindergarten', 'primary12', 'primary34', 'primary56', 'junior', 'senior', 'college']);
  for (const g of c.GRADES) {
    s.assert.ok(g.label.length > 0);
    s.assert.ok(/\.js$/.test(g.file));
  }
});

s.test('TYPES/TYPE_CODES：8 类型码覆盖 w1/w2/c1/c2/xhy/zc/fill/trans', () => {
  s.assert.equal(c.TYPE_CODES.length, 8);
  s.assert.deepEqual(Object.keys(c.TYPES).slice().sort(), ['c1', 'c2', 'fill', 'trans', 'w1', 'w2', 'xhy', 'zc']);
  for (const code of ['w1', 'w2', 'c1', 'c2', 'xhy', 'zc', 'fill', 'trans']) {
    s.assert.ok(c.TYPES[code] !== undefined, '缺少类型 ' + code);
    s.assert.ok(c.TYPES[code].name.length > 0);
    s.assert.equal(c.TYPES[code].code, code);
  }
  s.assert.deepEqual(c.TYPE_CODES, Object.keys(c.TYPES));
});

s.test('starsByRate：星级阈值 90/70/60/0 边界', () => {
  s.assert.equal(c.starsByRate(100), 3);
  s.assert.equal(c.starsByRate(90), 3);
  s.assert.equal(c.starsByRate(89), 2);   // 89 未到 90 → 2 星
  s.assert.equal(c.starsByRate(89.9), 2);
  s.assert.equal(c.starsByRate(70), 2);
  s.assert.equal(c.starsByRate(69.9), 1);   // 69.9 未到 70 → 1 星
  s.assert.equal(c.starsByRate(69), 1);
  s.assert.equal(c.starsByRate(60), 1);
  s.assert.equal(c.starsByRate(59.9), 0);
  s.assert.equal(c.starsByRate(0), 0);
  s.assert.equal(c.starsByRate(-1), 0);
});

s.test('STAR_THRESHOLDS：阈值单调递减、星数单调递减', () => {
  s.assert.deepEqual(c.STAR_THRESHOLDS, [
    { minRate: 90, stars: 3 },
    { minRate: 70, stars: 2 },
    { minRate: 60, stars: 1 }
  ]);
});

s.test('STORAGE_KEYS：昵称/头像/星级/待上报 key 均非空', () => {
  for (const k of ['nickname', 'avatar', 'stars', 'pendingScores']) {
    s.assert.ok(c.STORAGE_KEYS[k] && c.STORAGE_KEYS[k].length > 0, '缺少 key ' + k);
  }
});

s.test('GAME_CONFIG：核心配置数值与注释一致', () => {
  s.assert.equal(c.GAME_CONFIG.totalQ, 10);
  // R1：命数 3 → 5，与星级阈值 90/80/60 联动，保证三档星级全部可达
  s.assert.equal(c.GAME_CONFIG.initLives, 5);
  s.assert.equal(c.GAME_CONFIG.sinkSpeed, 13);
  s.assert.equal(c.GAME_CONFIG.approach, 58);
  // R3：答错反馈窗口 0.6s → 1.2s（低龄玩家需要时间看清正确答案）
  s.assert.equal(c.GAME_CONFIG.approachTime, 1.2);
  s.assert.equal(c.GAME_CONFIG.canvasW, 390);
  s.assert.equal(c.GAME_CONFIG.canvasH, 500);
});

s.done();
