/**
 * tests/unit/klotski-nudge.test.js —— 华容道方向键
 *
 * 背景（2026-10-18 用户反馈「上下左右键感觉没用」）：
 *   原来方向键一次只滑 1 格却记 1 步，而拖动滑多远都只算 1 步 —— 方向键天然更亏，
 *   玩家自然觉得没用。现在改成「沿方向滑到尽头」，与拖动同一口径（一次滑动 = 1 步）。
 *
 * 覆盖：
 *   1. 选中棋子后按方向 → 滑到尽头（≥2 格）但只记 1 步；
 *   2. 被挡住的方向 → 不移动、也不记步；
 *   3. 没选棋子 → 不动、不记步；
 *   4. 源码护栏：nudge 里不能再传 dist=1。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('pages/klotski 方向键');

const store = {};
global.wx = {
  getStorageSync: (k) => (k in store ? store[k] : ''),
  setStorageSync: (k, v) => { store[k] = v; },
  removeStorageSync: (k) => { delete store[k]; },
  showToast: () => {},
  navigateBack: () => {},
  createSelectorQuery: () => ({ select: () => ({ boundingClientRect: (cb) => cb(null) }), exec: () => {} })
};

const K = require('../../miniprogram/game/klotski');
const LEVELS = require('../../miniprogram/data/klotski-levels');

let def = null;
const prevPage = global.Page;
global.Page = (o) => { def = o; };
require('../../miniprogram/pages/klotski/klotski');
global.Page = prevPage;

function makePage(levelNo) {
  const p = Object.create(def);
  p.data = JSON.parse(JSON.stringify(def.data));
  p.setData = function (patch) { Object.assign(p.data, patch); };
  p._render = function () {};
  p._measureBoard = function () {};
  const lv = LEVELS.levels[levelNo - 1];
  p._pieces = K.parseGrid(lv.grid);
  p._history = [];
  p.data.playing = true;
  p.data.over = false;
  p.data.curLevel = levelNo;
  p.data.moves = 0;
  p.data.selected = -1;
  return p;
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

s.test('选中棋子后按方向：滑到尽头，只记 1 步', () => {
  // 第 7 关：3 号「赵」云向上可滑 2 格（选中它最能验证「一次滑到底」）
  const p = makePage(7);
  const i = 3;
  const before = { x: p._pieces[i].x, y: p._pieces[i].y };
  const slide = K.applyMove(p._pieces, i, 0, -1, 9);
  s.assert.true(slide.moved);
  s.assert.equal(slide.dist, 2, '这一关赵云向上应该能滑 2 格');

  p.data.selected = i;
  p.nudge({ currentTarget: { dataset: { dir: 'up' } } });

  s.assert.equal(p._pieces[i].y, before.y - 2, '应滑到尽头（2 格），而不是只动 1 格');
  s.assert.equal(p.data.moves, 1, '滑 2 格也只算 1 步（与拖动同口径）');
});

s.test('被挡住的方向：不动也不记步', () => {
  const p = makePage(7);
  const i = 3;
  const before = { x: p._pieces[i].x, y: p._pieces[i].y, moves: p.data.moves };
  p.data.selected = i;
  // 赵云在最左列，向左一定被墙挡住
  s.assert.false(K.applyMove(p._pieces, i, -1, 0, 9).moved, '向左本来就走不了');
  p.nudge({ currentTarget: { dataset: { dir: 'left' } } });
  s.assert.equal(p._pieces[i].x, before.x);
  s.assert.equal(p._pieces[i].y, before.y);
  s.assert.equal(p.data.moves, before.moves, '没走动不能记步');
});

s.test('没选棋子时按方向：不动，也不记步', () => {
  const p = makePage(7);
  const before = p.data.moves;
  p.nudge({ currentTarget: { dataset: { dir: 'up' } } });
  s.assert.equal(p.data.moves, before);
});

s.test('源码护栏：nudge 不能再退化成「滑 1 格」', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/klotski/klotski.js'), 'utf8');
  const m = src.match(/nudge: function[\s\S]*?\n  \},/);
  s.assert.ok(m, '应能找到 nudge 实现');
  // 真正的护栏：调用 _doMove 的第三个参数不能是 1
  const call = m[0].match(/_doMove\([^)]*\)/);
  s.assert.ok(call, 'nudge 里应调用 _doMove');
  s.assert.false(/,\s*1\s*\)\s*;?$/.test(call[0].trim()), 'nudge 不能只滑 1 格：' + call[0]);
});

s.done();
