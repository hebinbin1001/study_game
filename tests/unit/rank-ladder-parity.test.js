/**
 * rank-ladder-parity.test.js —— 段位阶梯「前后端同源」护栏（第三批 · 第 8 条）
 *
 * 前端 utils/rank-ladder.js 是 server/rank-ladder.js 的副本（小程序打包目录不能引后端代码），
 * 这里**逐级**比对两端的累计门槛，并在若干星数上比对「当前段位 / 距下一段差多少星」，
 * 防止两边算得不一样（段位详情页与排行榜/我的页口径必须一致）。
 *
 * 注意：后端阶梯自身的用例在 rank-ladder.test.js（另一份），两者别混。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('段位阶梯（前后端同源）');

const fe = require('../../miniprogram/utils/rank-ladder');
const be = require('../../server/rank-ladder');

s.test('规模一致：8 大段 × 9 小级 = 72 级', () => {
  s.assert.equal(fe.TOTAL_CELLS, 72);
  s.assert.equal(fe.BIG_RANKS.length, 8);
  s.assert.equal(fe.LEVELS_PER_RANK, 9);
  s.assert.equal(be.TOTAL_CELLS, 72);
});

s.test('逐级累计门槛与后端完全一致', () => {
  for (let c = 1; c <= fe.TOTAL_CELLS; c++) {
    s.assert.equal(fe.starsForCell(c), be.starsForCell(c), '第 ' + c + ' 级门槛不一致');
  }
});

s.test('升级所需星数递增（越往上越贵）', () => {
  for (let i = 1; i < fe.TOTAL_CELLS; i++) {
    s.assert.ok(fe.starsToAdvance(i) >= fe.starsToAdvance(i - 1), '第 ' + i + ' 级不应比上一级便宜');
  }
  s.assert.ok(fe.starsToAdvance(fe.TOTAL_CELLS - 2) > fe.starsToAdvance(0));
});

s.test('progressOf 与后端一致（当前段位 + 还差多少星）', () => {
  [0, 1, 5, 20, 87, 200, 400, 527, 9999].forEach(function (star) {
    const a = fe.progressOf(star);
    const b = be.progressOf(star);
    s.assert.equal(a.starsNeeded, b.starsNeeded, star + ' 星：还差星数不一致');
  });
});

s.test('cells()：72 行、名称形如「大段 罗马数字」、门槛单调不减', () => {
  const cells = fe.cells();
  s.assert.equal(cells.length, 72);
  s.assert.equal(cells[0].name, '青铜 I');
  s.assert.equal(cells[71].name, '荣耀王者 IX');
  cells.forEach(function (c, i) {
    s.assert.contains(c.name, ' ');
    if (i > 0) s.assert.ok(c.starsToEnter >= cells[i - 1].starsToEnter, '门槛不应回退');
  });
});

s.test('满级：最高段位且不再需要星', () => {
  const p = fe.progressOf(fe.starsForCell(fe.TOTAL_CELLS));
  s.assert.equal(p.isMaxRank, true);
  s.assert.equal(p.starsNeeded, 0);
  s.assert.equal(p.current.name, '荣耀王者 IX');
});
