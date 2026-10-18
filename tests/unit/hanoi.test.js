/**
 * hanoi.test.js —— 「汉诺塔」引擎护栏（2026-10-18 新增玩法）
 *
 * 复核意见 §1.4 明确了两件事，这里都用测试守住：
 *   ① **只做 3 柱**（4 柱没有闭式解），所以 `2ⁿ−1` 必须逐关能验算；
 *   ② 最少步数必须是"真的能走出来的"——不只是公式算出来的数字。
 *      办法：用标准递归解生成 2ⁿ−1 步，逐步调 move()，最后必须 isSolved。
 * 顺带钉死 move 的合法性（空柱取不出、大盘压不了小盘）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('汉诺塔（hanoi）');

const fs = require('fs');
const path = require('path');
const H = require('../../miniprogram/game/hanoi');

/** 标准 3 柱递归解：把 n 个盘从 from 挪到 to（via 是中转柱） */
function solve(n, from, to, via, out) {
  if (n === 0) return;
  solve(n - 1, from, via, to, out);
  out.push([from, to]);
  solve(n - 1, via, to, from, out);
}

s.test('6 关小品：3~8 盘，关卡号与盘数一一对应', () => {
  s.assert.equal(H.LEVELS.length, 6);
  const ns = H.LEVELS.map(function (lv) { return lv.n; });
  s.assert.deepEqual(ns, [3, 4, 5, 6, 7, 8]);
  s.assert.equal(H.levelOf(1).n, 3);
  s.assert.equal(H.levelOf(6).n, 8);
  // 脏参数按边界处理
  s.assert.equal(H.levelOf(0).n, 3);
  s.assert.equal(H.levelOf(99).n, 8);
  s.assert.equal(H.levelOf('abc').n, 3);
});

s.test('最少步数 = 2ⁿ − 1（3 柱闭式解，逐关验算）', () => {
  s.assert.equal(H.minMoves(1), 1);
  s.assert.equal(H.minMoves(3), 7);
  s.assert.equal(H.minMoves(4), 15);
  s.assert.equal(H.minMoves(5), 31);
  s.assert.equal(H.minMoves(6), 63);
  s.assert.equal(H.minMoves(7), 127);
  s.assert.equal(H.minMoves(8), 255);
  for (let n = 1; n <= 12; n++) {
    s.assert.equal(H.minMoves(n), Math.pow(2, n) - 1);
  }
});

s.test('初始状态：所有盘在第 1 根柱子，数组尾部是顶部（最大盘在底）', () => {
  for (let n = 1; n <= 8; n++) {
    const st = H.initial(n);
    s.assert.equal(st.length, 3);
    s.assert.equal(st[0].length, n);
    s.assert.equal(st[1].length, 0);
    s.assert.equal(st[2].length, 0);
    // 从底到顶必须是 n, n-1, … 1
    for (let i = 0; i < n; i++) s.assert.equal(st[0][i], n - i);
    s.assert.equal(H.top(st, 0), 1, '顶部应该是最小的 1 号盘');
    s.assert.equal(H.top(st, 1), 0, '空柱顶部取 0');
  }
});

s.test('move 合法性：空柱取不出、大盘压不了小盘、不能原地放', () => {
  const st = H.initial(3);
  s.assert.equal(H.move(st, 1, 0), null, '空柱不能取盘');
  s.assert.equal(H.move(st, 0, 0), null, '不能原地放');
  const after = H.move(st, 0, 2);
  s.assert.ok(after, '1 号盘应该能放到空柱');
  s.assert.equal(after[0].length, 2);
  s.assert.equal(after[2].length, 1);
  // 原状态不能被改动（move 必须返回新状态，撤销依赖这一点）
  s.assert.equal(st[0].length, 3, 'move 改动了入参状态');
  // 2 号盘不能压到 1 号盘上
  s.assert.equal(H.move(after, 0, 2), null, '大盘不能压小盘');
});

s.test('每关都能用 2ⁿ−1 步真正走完（不是只靠公式）', () => {
  H.LEVELS.forEach(function (lv) {
    let st = H.initial(lv.n);
    const seq = [];
    solve(lv.n, 0, 2, 1, seq);
    s.assert.equal(seq.length, H.minMoves(lv.n), lv.n + ' 盘解法步数不等于 2ⁿ−1');
    seq.forEach(function (mv, i) {
      const next = H.move(st, mv[0], mv[1]);
      s.assert.ok(next, '第 ' + (i + 1) + ' 步非法：' + mv.join('→') + '（' + lv.n + ' 盘）');
      st = next;
    });
    s.assert.true(H.isSolved(st, lv.n), lv.n + ' 盘按解法走完却没完成');
    s.assert.equal(st[2].length, lv.n);
  });
});

s.test('步数少一步就到不了（最少步数的下界不是随口写的）', () => {
  // 3 盘：用 6 步不可能完成。穷举 6 步内的所有走法，确认没有一条能到终点。
  const n = 3;
  const target = H.minMoves(n);
  let found = false;
  function dfs(st, left) {
    if (found) return;
    if (H.isSolved(st, n)) { found = true; return; }
    if (left === 0) return;
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 3; b++) {
        const nx = H.move(st, a, b);
        if (nx) dfs(nx, left - 1);
        if (found) return;
      }
    }
  }
  dfs(H.initial(n), target - 1);
  s.assert.equal(found, false, target - 1 + ' 步竟然能完成 3 盘，说明最少步数算错了');
});

s.test('星级按步数倍率：1.15 倍内 3★ / 1.5 倍内 2★ / 其余 1★，0 步 0★', () => {
  s.assert.equal(H.starsFor(7, 0), 0);
  s.assert.equal(H.starsFor(7, 7), 3);
  s.assert.equal(H.starsFor(7, 8), 3);    // 1.14 倍
  s.assert.equal(H.starsFor(7, 9), 2);    // 1.29 倍
  s.assert.equal(H.starsFor(7, 10), 2);   // 1.43 倍
  s.assert.equal(H.starsFor(7, 11), 1);   // 1.57 倍
  s.assert.equal(H.starsFor(7, 40), 1);
  // 8 盘也一样
  s.assert.equal(H.starsFor(255, 255), 3);
  s.assert.equal(H.starsFor(255, 300), 2);
  s.assert.equal(H.starsFor(255, 400), 1);
});

s.test('盘子宽度：随编号递增、最大不超过柱子间距', () => {
  for (let n = 3; n <= 8; n++) {
    let prev = 0;
    for (let size = 1; size <= n; size++) {
      const d = H.diskStyle(size, n);
      s.assert.ok(d.w > prev, '盘宽没有随编号递增');
      s.assert.ok(d.w <= 196, '盘宽超了 196rpx（三根柱子挤不下）');
      s.assert.ok(d.w >= 78, '最宽盘不能小于 78rpx');
      prev = d.w;
    }
    s.assert.equal(prev, 196, n + ' 盘时最大的盘应该占满 196rpx');
  }
});

s.test('关卡页数据与引擎同源', () => {
  const list = H.levelsForPage();
  s.assert.equal(list.length, H.LEVELS.length);
  list.forEach(function (it, i) {
    s.assert.equal(it.no, i + 1);
    s.assert.contains(it.label, H.LEVELS[i].name);
    s.assert.contains(it.sub, String(H.minMoves(H.LEVELS[i].n)));
    s.assert.equal(it.params.n, H.LEVELS[i].n);
  });
});

s.test('星上限 = 6 关 × 3 星 = 18（不参与无限刷星）', () => {
  s.assert.equal(H.maxStars(), 18);
});

s.test('引擎源码不得出现年级依赖（数字智力统一 grade:all）', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/game/hanoi.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
  ['gradeScale', 'getLastGrade', 'GRADES', 'grade'].forEach(function (k) {
    s.assert.equal(code.indexOf(k) < 0, true, 'hanoi.js 代码里出现了年级相关标识：' + k);
  });
});

s.done();
