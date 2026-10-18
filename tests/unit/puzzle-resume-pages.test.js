/**
 * tests/unit/puzzle-resume-pages.test.js —— 断点续玩「页面接线」回归
 *
 * 为什么要有这一层：puzzle-resume 模块本身测通了，只代表存取规则对；
 * 「页面有没有真的把局面存进去 / 恢复得对不对」是另一回事（踩过：
 * 存档写了但恢复时把步数丢成 0、棋子恢复后叠在一起）。
 *
 * 做法：用最小 wx 桩 + Page 捕获，直接拿到页面对象，调页面自己的
 *   _saveProgress / _restore（不渲染、不跑真机），做「存 → 恢复」往返断言。
 * 覆盖：华容道（棋子局面）、2048（棋盘+步数）、汉诺塔（三柱盘面）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('pages 断点续玩接线');

// ---- 最小 wx 桩（storage 会走真实分支读写内存表） ----
const store = {};
global.wx = {
  getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''; },
  setStorageSync: function (k, v) { store[k] = v; },
  removeStorageSync: function (k) { delete store[k]; },
  showToast: function () {},
  navigateBack: function () {},
  createSelectorQuery: function () {
    return {
      select: function () {
        return { boundingClientRect: function (cb) { cb(null); }, in: function () { return this; } };
      },
      in: function () { return this; },
      exec: function () {}
    };
  }
};

const resume = require('../../miniprogram/utils/puzzle-resume');

/** 加载页面定义（捕获 Page({...})），并清 require 缓存以便重复加载 */
function loadPage(rel) {
  const abs = require.resolve('../../miniprogram/pages/' + rel);
  let def = null;
  const prevPage = global.Page;
  global.Page = function (o) { def = o; };
  delete require.cache[abs];
  require(abs);
  global.Page = prevPage;
  return def;
}

/** 造一个页面实例：隔离 data，setData 只做浅合并（这三个页面没有路径式 setData） */
function makePage(def) {
  const p = Object.create(def);
  p.data = JSON.parse(JSON.stringify(def.data || {}));
  p.setData = function (patch) {
    Object.keys(patch).forEach(function (k) { p.data[k] = patch[k]; });
  };
  return p;
}

function reset(game) { resume.clear(game); }

// ==================== 华容道 ====================
s.test('华容道：走子后存盘，重进能恢复同一局面与步数', () => {
  reset('klotski');
  const def = loadPage('klotski/klotski');
  const K = require('../../miniprogram/game/klotski');
  const LEVELS = require('../../miniprogram/data/klotski-levels');

  const a = makePage(def);
  a._pieces = K.parseGrid(LEVELS.levels[0].grid);
  a.data.playing = true;
  a.data.over = false;
  a.data.curLevel = 1;
  a.data.moves = 7;
  a.data.demoUsed = false;
  a._saveProgress();

  const snap = resume.load('klotski');
  s.assert.ok(snap, '应写入断点');
  s.assert.equal(snap.level, 1);

  const b = makePage(def);
  b._render = function () {};         // 渲染与布局无关，这里只验状态
  b._measureBoard = function () {};
  const ok = b._restore(snap);
  s.assert.true(ok, '应恢复成功');
  s.assert.equal(b._pieces.length, a._pieces.length, '棋子数量不能变');
  s.assert.deepEqual(
    b._pieces.map(function (p) { return [p.glyph, p.x, p.y]; }),
    a._pieces.map(function (p) { return [p.glyph, p.x, p.y]; }),
    '棋子坐标必须逐一对上（防止恢复后叠子）'
  );
  s.assert.equal(b.data.moves, 7, '步数要一起恢复');
  s.assert.equal(b.data.curLevel, 1);
  s.assert.true(b.data.playing);
  s.assert.equal(b.data.canUndo, false, '撤销栈不入档，恢复后不可撤销');
});

s.test('华容道：脏坐标的存档不恢复，并清掉', () => {
  reset('klotski');
  const def = loadPage('klotski/klotski');
  resume.save('klotski', 1, {
    pieces: [{ glyph: '曹', name: '曹操', kind: 'cao', x: 99, y: -3, w: 2, h: 2 }],
    moves: 3
  });
  const p = makePage(def);
  p._render = function () {};
  s.assert.false(p._restore(resume.load('klotski')), '越界坐标必须拒绝恢复');
  s.assert.equal(resume.load('klotski'), null, '脏档应被清掉');
});

// ==================== 2048 ====================
s.test('2048：棋盘与步数/得分一起恢复', () => {
  reset('g2048');
  const def = loadPage('g2048/g2048');
  const a = makePage(def);
  a._board = [[2, 4, 0, 0], [8, 0, 0, 0], [16, 32, 0, 0], [64, 0, 0, 512]];
  a.data.playing = true;
  a.data.over = false;
  a.data.challenge = false;
  a.data.curLevel = 3;
  a.data.score = 128;
  a.data.usedSteps = 21;
  a.data.maxTile = 512;
  a._levelStartAt = Date.now();
  a._saveProgress();

  const b = makePage(def);
  const ok = b._restore(resume.load('g2048'), 0);
  s.assert.true(ok);
  s.assert.deepEqual(b._board, a._board, '棋盘必须完全一致');
  s.assert.equal(b.data.usedSteps, 21);
  s.assert.equal(b.data.score, 128);
  s.assert.equal(b.data.maxTile, 512);
  s.assert.equal(b.data.target, 64, '目标应随关卡还原');
  s.assert.true(b.data.playing);
});

s.test('2048：指定了别的关卡时不抢恢复，但存档保留', () => {
  reset('g2048');
  const def = loadPage('g2048/g2048');
  resume.save('g2048', 5, { board: new Array(16).fill(0), score: 1, usedSteps: 2, maxTile: 4 });
  const p = makePage(def);
  s.assert.false(p._restore(resume.load('g2048'), 9), '不是这一关就不恢复');
  s.assert.ok(resume.load('g2048'), '存档不能被误删');
});

s.test('2048：通关 / 死局会清掉断点', () => {
  reset('g2048');
  const def = loadPage('g2048/g2048');
  const p = makePage(def);
  p.data.curLevel = 1;
  p.data.par = 24;
  p.data.usedSteps = 3;
  p.data.maxTile = 32;
  p.data.target = 32;
  p.data.challenge = false;
  p.data.playing = true;
  resume.save('g2048', 1, { board: new Array(16).fill(0), score: 0, usedSteps: 3, maxTile: 32 });
  // 结算链路依赖的进度模块真实存在，直接调用即可
  p._win();
  s.assert.equal(resume.load('g2048'), null, '通关后不该留下残局');
});

// ==================== 汉诺塔 ====================
s.test('汉诺塔：三柱盘面与步数恢复', () => {
  reset('hanoi');
  const def = loadPage('hanoi/hanoi');
  const a = makePage(def);
  a._lv = 2;                          // 第 2 关 = 4 盘
  a._n = 4;
  a._state = [[4, 3], [2], [1]];
  a._steps = 6;
  a.data.settle = false;
  a._saveProgress();

  const b = makePage(def);
  b._paint = function () {};
  const ok = b._restore(resume.load('hanoi'));
  s.assert.true(ok);
  s.assert.equal(b._n, 4);
  s.assert.equal(b._steps, 6);
  s.assert.deepEqual(b._state, [[4, 3], [2], [1]]);
});

s.test('汉诺塔：盘子缺失/重复的存档拒绝恢复', () => {
  reset('hanoi');
  const def = loadPage('hanoi/hanoi');
  resume.save('hanoi', 2, { state: [[4, 3, 3], [2], []], steps: 6 });  // 3 重复、缺 1
  const p = makePage(def);
  p._paint = function () {};
  s.assert.false(p._restore(resume.load('hanoi')));
  s.assert.equal(resume.load('hanoi'), null);
});

// ==================== 24 点 ====================
s.test('24 点：牌面（分数）+ 步数 + 选中态恢复', () => {
  reset('math24');
  const def = loadPage('math24/math24');
  const a = makePage(def);
  a.data.curLevel = 2;
  a.data.over = false;
  a.data.deadEnd = false;
  a.data.steps = 1;
  a.data.tiles = [
    { id: 't1', frac: { n: 8, d: 1 }, text: '8', sel: true },
    { id: 't2', frac: { n: 3, d: 1 }, text: '3', sel: false },
    { id: 't3', frac: { n: 2, d: 3 }, text: '2/3', sel: false }
  ];
  a._tileId = 3;
  a._history = [];
  a._saveProgress();

  const b = makePage(def);
  b._selPreview = function () { return ''; };
  const ok = b._restore(resume.load('math24'));
  s.assert.true(ok);
  s.assert.equal(b.data.tiles.length, 3);
  s.assert.deepEqual(b.data.tiles[2].frac, { n: 2, d: 3 }, '分数中间结果必须原样恢复');
  s.assert.equal(b.data.steps, 1);
  s.assert.equal(b.data.picked, 1, '选中态一起恢复，玩家不用重新点牌');
});

// ==================== 一笔画 ====================
s.test('一笔画：已走路径与提示次数恢复', () => {
  reset('one-stroke');
  const def = loadPage('one-stroke/one-stroke');
  const a = makePage(def);
  a._li = 0;
  a._path = [0, 1];
  a._used = { '0-1': 1 };
  a._steps = 1;
  a.data.hintLeft = 2;
  a.data.settle = false;
  a._hints = 1;
  a._saveProgress();

  const b = makePage(def);
  const ok = b._restore(resume.load('one-stroke'));
  s.assert.true(ok);
  s.assert.equal(b._li, 0);
  s.assert.deepEqual(b._path, [0, 1]);
  s.assert.equal(b._steps, 1);
  s.assert.equal(b.data.hintLeft, 2, '提示次数也要恢复，否则退出可以刷提示');
});

s.test('一笔画：越界点号的存档拒绝恢复', () => {
  reset('one-stroke');
  const def = loadPage('one-stroke/one-stroke');
  resume.save('one-stroke', 1, { li: 0, path: [9999], used: {}, steps: 1, hintLeft: 3 });
  const p = makePage(def);
  p._render = function () {};
  s.assert.false(p._restore(resume.load('one-stroke')));
  s.assert.equal(resume.load('one-stroke'), null);
});

// ==================== 迷宫 ====================
s.test('迷宫：seed + 位置 + 门状态恢复（地图必须一模一样）', () => {
  reset('maze');
  const mazeEngine = require('../../miniprogram/game/maze');
  const def = loadPage('maze/maze');
  const a = makePage(def);
  a._lv = 1;
  a._seed = 123456789;
  a._g = mazeEngine.gen(1, 123456789);
  a._pos = a._g.start;
  a._steps = 3;
  a._lives = 2;
  a._gateState = {};
  a._chestOpen = {};
  a._qs = {};
  a._visited = {};
  a._visited[a._g.start] = 1;
  a.data.settle = false;
  a._saveProgress();

  const b = makePage(def);
  b._paint = function () {};
  const ok = b._restore(resume.load('maze'));
  s.assert.true(ok);
  s.assert.equal(b._seed, 123456789, 'seed 必须还原，否则是另一张地图');
  s.assert.equal(b._pos, a._pos);
  s.assert.equal(b._steps, 3);
  s.assert.equal(b._lives, 2);
  s.assert.deepEqual(
    b._g.cells.map(function (c) { return c.walls; }),
    a._g.cells.map(function (c) { return c.walls; }),
    '重建出来的迷宫墙必须与存档时完全一致'
  );
});

// ==================== 数独 ====================
s.test('数独：题面 + 答案 + 已填值 + 扣命恢复', () => {
  reset('sudoku');
  const def = loadPage('sudoku/sudoku');
  const n = 4;
  const puzzle = [[1, 0, 0, 0], [0, 2, 0, 0], [0, 0, 3, 0], [0, 0, 0, 4]];
  const answer = [[1, 2, 3, 4], [3, 4, 2, 1], [2, 1, 4, 3], [4, 3, 1, 2]];
  const values = [[1, 2, 0, 0], [0, 2, 0, 0], [0, 0, 3, 0], [0, 0, 0, 4]];
  const a = makePage(def);
  a.data.curLevel = 3;
  a.data.playing = true;
  a.data.settle = false;
  a.data.n = n;
  a.data.lives = 2;
  a.data.mistakes = 1;
  a.data.doneCells = 3;
  a._puzzle = puzzle;
  a._answer = answer;
  a.data.grid = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      a.data.grid.push({ r: i, c: j, v: values[i][j], given: puzzle[i][j] > 0, sel: false, err: false });
    }
  }
  a._saveProgress();

  const b = makePage(def);
  const ok = b._restore(resume.load('sudoku'));
  s.assert.true(ok);
  s.assert.equal(b.data.n, 4);
  s.assert.equal(b.data.grid.length, 16);
  s.assert.equal(b.data.grid[1].v, 2, '已填对的值不能丢');
  s.assert.equal(b.data.lives, 2, '扣过的命不能回满');
  s.assert.equal(b.data.mistakes, 1);
  s.assert.deepEqual(b._answer, answer, '答案必须原样恢复，否则后面全判错');
});

// ==================== 源码级护栏 ====================
// 七个玩法都应该接上断点续玩；以后新增同类玩法忘了接，这里直接红。
s.test('七个玩法页面都接了断点续玩（存 / 读 / 清 三件套）', () => {
  const fs = require('fs');
  const path = require('path');
  const GAMES = ['klotski', 'sudoku', 'g2048', 'math24', 'one-stroke', 'maze', 'hanoi'];
  GAMES.forEach(function (g) {
    const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages', g, g + '.js'), 'utf8');
    s.assert.contains(src, "require('../../utils/puzzle-resume')", g + ' 未引入断点模块');
    s.assert.contains(src, 'resume.load(', g + ' 未在进入页面时读档');
    s.assert.contains(src, '_restore: function', g + ' 缺恢复实现');
    s.assert.contains(src, '_saveProgress: function', g + ' 缺存盘实现');
    s.assert.contains(src, 'resume.clear(', g + ' 缺清理点（通关/重开必须清）');
  });
});

// 2026-10-18 发现：2048 页面头部漏了 game / storage 两个 require，
// 语法检查抓不到，真机一进页面就 ReferenceError。这里加一道护栏。
s.test('2048 页面必须引入 game 与 storage（防再次漏 require）', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/pages/g2048/g2048.js'), 'utf8');
  s.assert.contains(src, "require('../../game/tw2048')");
  s.assert.contains(src, "require('../../utils/storage')");
});

// 收尾：清掉本文件写入的存档，避免影响其它单测
['klotski', 'g2048', 'hanoi'].forEach(reset);

s.done();
