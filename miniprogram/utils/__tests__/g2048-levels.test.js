/**
 * g2048-levels.test.js —— 2048 关卡可达性回归
 *
 * 背景（真实缺陷）：原关卡表的步数预算是「线性 +6」增长（32/20 → 2048/64），
 * 而 2048 的难度随目标是翻倍增长的 —— 于是后面几关根本不可能通过：
 *   · 合成目标 T 至少需要 (T/2 − 1) 次合并；
 *   · 一次移动最多合并 8 次（4 行 × 2），实战平均约 1.2~1.5 次/步
 *     （自动对局实测：32→17 步、64→34 步、128→57 步）；
 *   · 所以 2048 至少需要 128 步（理论下限）、约 680 步（实战），而原关卡只给了 64 步。
 *
 * 本文件把「可达性下限」固化成断言：任何一关的步数预算低于下限就直接失败，
 * 避免以后再出现「怎么玩都过不去」的关卡。
 *
 * 运行：node miniprogram/utils/__tests__/g2048-levels.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('2048 关卡可达性');

const fs = require('fs');
const path = require('path');

// 直接解析页面源码里的 LEVELS（页面文件会调用 Page()，不能在 Node 里 require）
const SRC = fs.readFileSync(
  path.resolve(__dirname, '../../pages/g2048/g2048.js'), 'utf8');

const LEVELS = (function () {
  const m = SRC.match(/var LEVELS = \[([\s\S]*?)\n\];/);
  if (!m) return null;
  const out = [];
  const re = /\{\s*no:\s*(\d+),\s*target:\s*(\d+),\s*steps:\s*(\d+),\s*tier:\s*'([^']+)'\s*\}/g;
  let one;
  while ((one = re.exec(m[1]))) {
    out.push({ no: +one[1], target: +one[2], steps: +one[3], tier: one[4] });
  }
  return out;
})();

/** 可达性下限：按「每步平均 1.5 次合并」估算需要多少步 */
function minBudget(target) {
  return Math.ceil((target / 2 - 1) / 1.5);
}

/** 理论硬下限：每步最多合并 8 次 */
function hardFloor(target) {
  return Math.ceil((target / 2 - 1) / 8);
}

s.test('关卡表可解析且有 10 关', () => {
  s.assert.ok(LEVELS, '未能从页面源码解析出 LEVELS');
  s.assert.equal(LEVELS.length, 10);
  LEVELS.forEach(function (lv, i) { s.assert.equal(lv.no, i + 1); });
});

s.test('每关步数预算都高于「实战可达性下限」（否则关卡不可通过）', () => {
  LEVELS.forEach(function (lv) {
    const need = minBudget(lv.target);
    s.assert.ok(lv.steps >= need,
      '第 ' + lv.no + ' 关（目标 ' + lv.target + '）只给 ' + lv.steps
      + ' 步，低于可达性下限 ' + need + ' 步 → 玩家怎么玩都过不去');
  });
});

s.test('每关步数预算也高于「理论硬下限」（双保险）', () => {
  LEVELS.forEach(function (lv) {
    s.assert.ok(lv.steps > hardFloor(lv.target),
      '第 ' + lv.no + ' 关步数 ' + lv.steps + ' 低于理论下限 ' + hardFloor(lv.target));
  });
});

s.test('回归：原关卡表的坏参数会被本规则拦住（说明规则有效）', () => {
  // 原关卡表（已修复）：步数线性 +6 增长，与目标翻倍增长不匹配
  const broken = [
    { no: 5, target: 512, steps: 46 },
    { no: 6, target: 1024, steps: 54 },
    { no: 7, target: 2048, steps: 64 }
  ];
  broken.forEach(function (lv) {
    s.assert.ok(lv.steps < minBudget(lv.target),
      '目标 ' + lv.target + ' 给 ' + lv.steps + ' 步竟被认为可达？规则失效');
  });
  // 2048 的理论硬下限是 128 步 —— 原关卡只给 64 步，数学上就不可能
  s.assert.ok(hardFloor(2048) > 64, '2048 的理论下限应大于 64 步');
});

s.test('难度分档：目标不降级、挑战档步数少于同目标的入门档', () => {
  for (let i = 1; i < LEVELS.length; i++) {
    s.assert.ok(LEVELS[i].target >= LEVELS[i - 1].target, '目标数字不应回退');
  }
  const byTarget = {};
  LEVELS.forEach(function (lv) {
    (byTarget[lv.target] = byTarget[lv.target] || []).push(lv);
  });
  Object.keys(byTarget).forEach(function (t) {
    const list = byTarget[t];
    if (list.length < 2) return;
    s.assert.ok(list[0].tier === '入门' && list[1].tier === '挑战',
      '目标 ' + t + ' 的两档应依次为 入门/挑战');
    s.assert.ok(list[1].steps < list[0].steps,
      '目标 ' + t + ' 的挑战档步数应少于入门档');
  });
});

s.done();
