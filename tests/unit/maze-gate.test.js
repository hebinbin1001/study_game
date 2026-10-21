/**
 * maze-gate.test.js —— 词义迷宫「出口门禁」页面联动
 *
 * 防回归：门只是弹题、答不答都能走到终点，玩家一路冲到出口却 0 星。
 * 现在要求：所有门都答过（对/错都算答过）才解锁出口；未答完站在出口只提示，不结算。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('词义迷宫出口门禁');

const store = {};
global.wx = {
  getStorageSync: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : ''; },
  setStorageSync: function (k, v) { store[k] = v; },
  removeStorageSync: function (k) { delete store[k]; },
  showToast: function () {},
  navigateBack: function () {},
  setNavigationBarTitle: function () {},
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

const M = require('../../miniprogram/game/maze');

function loadPage(rel) {
  const abs = require.resolve('../../miniprogram/pages/' + rel);
  let def = null;
  const prev = global.Page;
  global.Page = function (o) { def = o; };
  delete require.cache[abs];
  require(abs);
  global.Page = prev;
  return def;
}

function makePage(def) {
  const p = Object.create(def);
  p.data = JSON.parse(JSON.stringify(def.data || {}));
  p.setData = function (patch) {
    Object.keys(patch).forEach(function (k) { p.data[k] = patch[k]; });
  };
  return p;
}

s.test('门未答完：站到出口只提示锁定，不结算', () => {
  const def = loadPage('maze/maze');
  const p = makePage(def);
  const g = M.gen(1, 123456789);
  const end = g.end;
  const pos = M.neighborsOf(g.cells, end)[0];
  const picks = [];
  for (let i = 0; i < g.cells.length && picks.length < 3; i++) {
    if (i !== g.start && i !== end && i !== pos) picks.push(i);
  }
  g.gateIds.forEach(function (i) { g.cells[i].kind = 'normal'; });
  g.gateIds = picks;
  picks.forEach(function (i) { g.cells[i].kind = 'gate'; });

  p._g = g;
  p._lv = 1;
  p._seed = 123456789;
  p._pos = pos;
  p._steps = 0;
  p._lives = 3;
  p._gateState = {};
  p._chestOpen = {};
  p._qs = {};
  p._visited = {};
  p._visited[pos] = 1;
  p._gradeLabel = '一年级';

  p.tapCell({ currentTarget: { dataset: { idx: end } } });
  s.assert.false(p.data.settle, '未答完门不应结算');
  s.assert.equal(p.data.bannerMain, '出口还锁着');
  s.assert.ok(String(p.data.bannerSub).indexOf('3 道门') >= 0, '应提示还差几道门');
});

s.test('未答门在空 gateState 下也会弹题（不能因为状态未初始化而静默通过）', () => {
  const def = loadPage('maze/maze');
  const p = makePage(def);
  const g = M.gen(1, 246813579);
  const gate = g.gateIds[0];
  const pos = M.neighborsOf(g.cells, gate)[0];
  p._g = g;
  p._lv = 1;
  p._seed = 246813579;
  p._pos = pos;
  p._steps = 0;
  p._lives = 3;
  p._gateState = {};                 // 模拟老代码/旧存档：门状态还没初始化
  p._chestOpen = {};
  p._qs = {};
  p._visited = {};
  p._visited[pos] = 1;
  p._gradeLabel = '一年级';
  p._pool = [
    { type: 'w1', q: 'cat', a: 'cat', hint: '猫' },
    { type: 'w1', q: 'dog', a: 'dog', hint: '狗' },
    { type: 'w1', q: 'book', a: 'book', hint: '书' },
    { type: 'w1', q: 'water', a: 'water', hint: '水' }
  ];
  p.tapCell({ currentTarget: { dataset: { idx: gate } } });
  s.assert.true(p.data.ask, '进入未答门应弹题');
  s.assert.ok(!!p.data.askPrompt, '应有答题提示');
  s.assert.ok(!!p.data.askText, '应有词面');
  s.assert.equal((p.data.askOptions || []).length, 4);
});

s.test('全部门答过（即使答错）才结算；答对不足 60% 显示「还差一点」', () => {
  const def = loadPage('maze/maze');
  const p = makePage(def);
  const g = M.gen(1, 987654321);
  const end = g.end;
  const pos = M.neighborsOf(g.cells, end)[0];
  const picks = [];
  for (let i = 0; i < g.cells.length && picks.length < 3; i++) {
    if (i !== g.start && i !== end && i !== pos) picks.push(i);
  }
  g.gateIds.forEach(function (i) { g.cells[i].kind = 'normal'; });
  g.gateIds = picks;
  picks.forEach(function (i) { g.cells[i].kind = 'gate'; });

  p._g = g;
  p._lv = 1;
  p._seed = 987654321;
  p._pos = pos;
  p._steps = 0;
  p._lives = 3;
  p._gateState = {};
  picks.forEach(function (i) { p._gateState[i] = 2; });   // 全答错，但都已答过
  p._chestOpen = {};
  p._qs = {};
  p._visited = {};
  p._visited[pos] = 1;
  p._gradeLabel = '一年级';

  p.tapCell({ currentTarget: { dataset: { idx: end } } });
  s.assert.true(p.data.settle, '全部门答过后应结算');
  s.assert.false(p.data.win, '0/3 正确不应过关');
  s.assert.equal(p.data.overTitle, '还差一点');
  s.assert.ok(String(p.data.overHint).indexOf('60%') >= 0, '应提示 60% 门槛');
});

s.done();
