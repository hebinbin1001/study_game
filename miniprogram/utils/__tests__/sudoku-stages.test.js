/**
 * sudoku-stages.test.js —— 数独关卡档位与生成质量校验
 *
 * 数独题库不需要外部素材：game/sudoku.js 是「生成合法终盘 → 按唯一解校验挖洞」的生成器。
 * 关卡只是「阶数 + 期望给定数」的档位，所以扩关卡的成本几乎为零。
 *
 * 本文件守两条底线：
 *   ① 每一档生成的题目必须**唯一解**（否则玩家填出另一种合法解会被判错）；
 *   ② 实际给定数只能 ≥ 期望值（挖不动就停），且档位期望值必须严格递减（难度单调）。
 *
 * 运行：node miniprogram/utils/__tests__/sudoku-stages.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('数独关卡档位');

const sudoku = require('../../game/sudoku');

// 与 pages/sudoku/sudoku.js 的 STAGES 保持一致
const STAGES = [
  { from: 1, to: 6, n: 4, givens: 10, name: '4×4 入门' },
  { from: 7, to: 12, n: 4, givens: 7, name: '4×4 挑战' },
  { from: 13, to: 20, n: 6, givens: 22, name: '6×6 入门' },
  { from: 21, to: 28, n: 6, givens: 17, name: '6×6 挑战' },
  { from: 29, to: 38, n: 9, givens: 40, name: '9×9 初级' },
  { from: 39, to: 48, n: 9, givens: 34, name: '9×9 中级' },
  { from: 49, to: 55, n: 9, givens: 29, name: '9×9 高级' },
  { from: 56, to: 60, n: 9, givens: 25, name: '9×9 大师' }
];
const TOTAL_LEVELS = 60;

function givensOf(puzzle) {
  let c = 0;
  puzzle.forEach(function (row) {
    row.forEach(function (v) { if (v !== 0) c++; });
  });
  return c;
}

s.test('档位覆盖：连续覆盖 1..60 关且无空隙', () => {
  let expect = 1;
  STAGES.forEach(function (st) {
    s.assert.equal(st.from, expect, st.name + ' 的起始关应接上一档');
    s.assert.ok(st.to >= st.from, st.name + ' 的区间非法');
    expect = st.to + 1;
  });
  s.assert.equal(expect - 1, TOTAL_LEVELS, '档位应恰好覆盖到第 ' + TOTAL_LEVELS + ' 关');
});

s.test('难度单调：同一阶数内给定数占比逐档下降', () => {
  // 注意不能用「给定数」直接跨阶数比较：4×4 只有 16 格、9×9 有 81 格，
  // 绝对数量没有可比性。正确的度量是「给定数 / 格子数」的占比。
  // 换阶数时占比回升是有意设计 —— 新阶数等于重新起步（6×6 入门应比 4×4 挑战宽松）。
  let prev = null;
  STAGES.forEach(function (st) {
    const ratio = st.givens / (st.n * st.n);
    if (prev && prev.n === st.n) {
      s.assert.ok(ratio < prev.ratio,
        st.name + ' 给定占比 ' + ratio.toFixed(3) + ' 应低于 ' + prev.name + ' 的 ' + prev.ratio.toFixed(3));
    }
    s.assert.ok(ratio > 0 && ratio < 1, st.name + ' 给定占比越界：' + ratio);
    prev = { n: st.n, ratio: ratio, name: st.name };
  });
});

s.test('生成质量：每档题目都是唯一解、给定数不少于期望、终盘完整', () => {
  STAGES.forEach(function (st) {
    const gen = sudoku.generate(st.n, st.givens);
    s.assert.ok(gen && gen.puzzle && gen.answer, st.name + ' 生成失败');

    s.assert.equal(gen.puzzle.length, st.n, st.name + ' 题面阶数应为 ' + st.n);
    s.assert.equal(gen.answer.length, st.n, st.name + ' 终盘阶数应为 ' + st.n);

    // 唯一解（countSolutions 数到 2 就停；=1 才是唯一）
    s.assert.equal(sudoku.countSolutions(gen.puzzle, 2), 1,
      st.name + ' 出现多解 —— 玩家填另一种合法解会被误判');

    // 给定数：挖不动就停，所以只会 ≥ 期望；也不该留太多（允许 +8 的余量）
    const g = givensOf(gen.puzzle);
    s.assert.ok(g >= st.givens, st.name + ' 实际给定 ' + g + ' 少于期望 ' + st.givens);
    s.assert.ok(g <= st.givens + 8, st.name + ' 实际给定 ' + g + ' 远多于期望 ' + st.givens + '（挖洞效率异常）');

    // 题面必须是终盘的子集（同位置要么留空，要么与终盘一致）
    for (let r = 0; r < st.n; r++) {
      for (let c = 0; c < st.n; c++) {
        const pv = gen.puzzle[r][c];
        if (pv !== 0) {
          s.assert.equal(pv, gen.answer[r][c], st.name + ' 第 ' + (r + 1) + ' 行第 ' + (c + 1) + ' 格与终盘不符');
        }
      }
    }
  });
});

s.test('终盘合法：每行/每列/每宫都是 1..n 的一个排列', () => {
  [4, 6, 9].forEach(function (n) {
    const solved = sudoku.fillSolved(n);
    s.assert.ok(!!solved, n + '×' + n + ' 终盘生成失败');
    const box = sudoku.makeBoxes(n);
    const full = [];
    for (let i = 1; i <= n; i++) full.push(i);
    const want = full.join(',');

    for (let r = 0; r < n; r++) {
      s.assert.equal(solved[r].slice().sort(function (a, b) { return a - b; }).join(','), want,
        n + '×' + n + ' 第 ' + (r + 1) + ' 行不是 1..' + n);
    }
    for (let c = 0; c < n; c++) {
      const col = [];
      for (let r = 0; r < n; r++) col.push(solved[r][c]);
      s.assert.equal(col.sort(function (a, b) { return a - b; }).join(','), want,
        n + '×' + n + ' 第 ' + (c + 1) + ' 列不是 1..' + n);
    }
    for (let br = 0; br < n; br += box.br) {
      for (let bc = 0; bc < n; bc += box.bc) {
        const cells = [];
        for (let r = br; r < br + box.br; r++) {
          for (let c = bc; c < bc + box.bc; c++) cells.push(solved[r][c]);
        }
        s.assert.equal(cells.sort(function (a, b) { return a - b; }).join(','), want,
          n + '×' + n + ' 宫 (' + br + ',' + bc + ') 不是 1..' + n);
      }
    }
  });
});

s.done();
