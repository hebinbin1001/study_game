/**
 * state.test.js —— game/state.js 全局状态工厂单测
 *
 * 覆盖：createInitialState() 含 maxCombo 字段且初始为 0；resetGame 后 maxCombo 归 0。
 *
 * 运行：node tests/unit/state.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/state.js');

const { createInitialState, resetGame } = require('../../miniprogram/game/state');

s.test('createInitialState：返回对象含 maxCombo 字段且初始为 0', () => {
  const G = createInitialState();
  s.assert.ok('maxCombo' in G, '缺少 maxCombo 字段');
  s.assert.equal(G.maxCombo, 0, 'maxCombo 初始应为 0');
  // 既有字段不回归
  s.assert.equal(G.combo, 0);
  s.assert.equal(G.score, 0);
  s.assert.equal(G.correctCount, 0);
});

s.test('resetGame：复位后 maxCombo 归 0（含原地复位保持引用）', () => {
  const G = createInitialState();
  G.maxCombo = 5;
  G.combo = 3;
  G.score = 400;
  const out = resetGame(G);
  s.assert.strictEqual(out, G, '原地复位应保持引用不变');
  s.assert.equal(G.maxCombo, 0, 'maxCombo 复位后应为 0');
  s.assert.equal(G.combo, 0);
  s.assert.equal(G.score, 0);
});

s.done();