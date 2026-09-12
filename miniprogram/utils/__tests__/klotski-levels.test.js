/**
 * klotski-levels.test.js —— 华容道关卡库校验（data/klotski-levels.js）
 *
 * 守四件事：
 *   ① 结构：30 关、编号连续、网格 5×4、档位合法、最少步数不回落；
 *   ② 每关棋子组合合法（走我们自己的引擎解析，不信任来源数据）；
 *   ③ 每关自带的最优解**长度 = 标注最少步数**，且**回放逐步执行确实通关**（全量 30 关）；
 *   ④ 抽样（每档 1 关 + 经典关）用 BFS **重算**最优步数，必须与标注一致 ——
 *      剩下的关靠 ③ 的回放兜底，兼顾「强校验」与「测试别跑太慢」。
 *
 * 运行：node miniprogram/utils/__tests__/klotski-levels.test.js
 */

'use strict';

const { suite } = require('./_runner');
const s = suite('华容道关卡库（30 关）');

const K = require('../../game/klotski');
const DATA = require('../../data/klotski-levels');

const LEVELS = DATA.levels;
const TIERS = ['入门', '进阶', '困难', '经典', '炼狱'];

// ============ 1. 结构 ============
s.test('结构：30 关、编号连续、字段齐备', () => {
  s.assert.equal(DATA.label, '华容道');
  s.assert.equal(DATA.total, 30);
  s.assert.equal(LEVELS.length, 30);
  LEVELS.forEach(function (lv, i) {
    s.assert.equal(lv.no, i + 1, '编号应连续');
    s.assert.ok(!!lv.name && lv.name.length <= 8, '第 ' + lv.no + ' 关应有短名称');
    s.assert.ok(TIERS.indexOf(lv.tier) !== -1, '档位非法：' + lv.tier);
    s.assert.ok(typeof lv.minMoves === 'number' && lv.minMoves > 0, '应有最少步数');
    s.assert.ok(Array.isArray(lv.grid) && lv.grid.length === K.ROWS, '网格应是 5 行');
    lv.grid.forEach(function (row) {
      s.assert.equal(String(row).length, K.COLS, '每行应是 4 列');
    });
    s.assert.ok(Array.isArray(lv.solution) && lv.solution.length > 0, '应带最优解');
  });
});

s.test('难度：最少步数不回落，且覆盖 8 → 100 的长跨度', () => {
  for (let i = 1; i < LEVELS.length; i++) {
    s.assert.ok(LEVELS[i].minMoves >= LEVELS[i - 1].minMoves,
      '第 ' + LEVELS[i].no + ' 关难度回落：' + LEVELS[i].minMoves + ' < ' + LEVELS[i - 1].minMoves);
  }
  s.assert.equal(LEVELS[0].minMoves, 8, '首关 8 步（入门）');
  s.assert.equal(LEVELS[LEVELS.length - 1].minMoves, 100, '终关 100 步（接近该棋盘理论上限 101 步）');
});

s.test('关卡唯一：没有两个关卡是同一局面', () => {
  const keys = LEVELS.map(function (lv) { return K.keyOf(K.parseGrid(lv.grid)); });
  s.assert.allDistinct(keys, '存在重复局面');
});

s.test('档位分布与经典关：含「横刀立马」90 步', () => {
  const count = {};
  LEVELS.forEach(function (lv) { count[lv.tier] = (count[lv.tier] || 0) + 1; });
  s.assert.equal(count['入门'], 8);
  s.assert.equal(count['进阶'], 10);
  s.assert.equal(count['困难'], 6);
  s.assert.equal(count['炼狱'], 5);
  const classic = LEVELS.filter(function (lv) { return lv.classic; });
  s.assert.equal(classic.length, 1, '应恰好一个经典局');
  s.assert.equal(classic[0].name, '横刀立马');
  s.assert.equal(classic[0].minMoves, 90, '经典局一次连续滑动口径 = 90 步');
});

// ============ 2 & 3. 逐关：合法 + 解可回放 ============
s.test('逐关校验：棋子组合合法、最优解长度=标注步数、回放通关', () => {
  LEVELS.forEach(function (lv) {
    let pieces;
    try {
      pieces = K.parseGrid(lv.grid);
    } catch (e) {
      s.assert.fail('第 ' + lv.no + ' 关（' + lv.name + '）棋形非法：' + e.message);
      return;
    }
    s.assert.equal(pieces.length, 10, '第 ' + lv.no + ' 关应有 10 个棋子');
    s.assert.equal(K.isWin(pieces), false, '第 ' + lv.no + ' 关开局不应已是通关局面');

    s.assert.equal(lv.solution.length, lv.minMoves,
      '第 ' + lv.no + ' 关最优解长度应等于标注步数');
    const r = K.replay(pieces, lv.solution);
    s.assert.equal(r.ok, true, '第 ' + lv.no + ' 关最优解每步都应合法');
    s.assert.equal(r.win, true, '第 ' + lv.no + ' 关最优解应能通关');
  });
});

// ============ 4. 抽样重算最优步数 ============
s.test('抽样重算：每档 1 关 + 经典关，BFS 结果与标注一致', () => {
  const sample = [];
  TIERS.forEach(function (tier) {
    const hit = LEVELS.find(function (lv) { return lv.tier === tier; });
    if (hit) sample.push(hit);
  });
  LEVELS.filter(function (lv) { return lv.classic; }).forEach(function (lv) { sample.push(lv); });
  // 再补一个最难的
  sample.push(LEVELS[LEVELS.length - 1]);

  sample.forEach(function (lv) {
    const pieces = K.parseGrid(lv.grid);
    const sol = K.solve(pieces, true);
    s.assert.ok(!!sol, '第 ' + lv.no + ' 关应有解');
    s.assert.equal(sol.len, lv.minMoves,
      '第 ' + lv.no + ' 关（' + lv.name + '）重算 ' + (sol && sol.len) + ' 步 ≠ 标注 ' + lv.minMoves);
    s.assert.equal(K.replay(pieces, sol.moves).win, true, '重算解应能通关');
  });
});

s.test('星级可达性：每关按最优解走都得 3★，且通关至少 1★（无死区）', () => {
  LEVELS.forEach(function (lv) {
    s.assert.equal(K.starsFor(lv.minMoves, lv.minMoves), 3, '第 ' + lv.no + ' 关按最优解应得 3★');
    s.assert.equal(K.starsFor(lv.minMoves, Math.floor(lv.minMoves * 1.15)), 3, '3★ 档上限（1.15 倍取整）');
    s.assert.equal(K.starsFor(lv.minMoves, Math.ceil(lv.minMoves * 1.16)), 2, '1.16 倍应落到 2★');
    s.assert.ok(K.starsFor(lv.minMoves, lv.minMoves * 10) >= 1, '走得再久通关也有 1★');
  });
});

s.done();
