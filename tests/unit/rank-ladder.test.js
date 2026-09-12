/**
 * rank-ladder.test.js —— 段位阶梯校验（需求 ①）
 *
 * 段位体系：8 个大段位 × 每段 9 个小级 = 72 级，按「累计星数」晋升，越往后每级越贵。
 * 本文件守三件事：
 *   ① 阶梯完整覆盖 72 级、名称连续（青铜 1~9 → 白银 1~9 → … → 荣耀王者 1~9）；
 *   ② 门槛严格递增（否则会出现「升级反而更容易」的倒挂）；
 *   ③ rankOf / progressOf 与门槛表自洽（边界取到正确一级、进度百分比不越界）。
 *
 * 运行：node tests/unit/rank-ladder.test.js
 */

'use strict';

const { suite } = require('./_runner');
const s = suite('server/rank-ladder.js 段位阶梯');

const ladder = require('../../server/rank-ladder');

s.test('阶梯规模：8 大段 × 9 小级 = 72 级', () => {
  s.assert.equal(ladder.BIG_RANKS.length, 8);
  s.assert.equal(ladder.LEVELS_PER_RANK, 9);
  s.assert.equal(ladder.TOTAL_CELLS, 72);
  s.assert.equal(ladder.TOTAL_CELLS, ladder.BIG_RANKS.length * ladder.LEVELS_PER_RANK);
});

s.test('名称连续：青铜 1 → 青铜 9 → 白银 1 → … → 荣耀王者 9', () => {
  let expectSeq = [];
  ladder.BIG_RANKS.forEach(function (b) {
    for (let i = 1; i <= ladder.LEVELS_PER_RANK; i++) expectSeq.push(b.name + ' ' + i);
  });
  s.assert.equal(expectSeq.length, 72);

  const actual = [];
  for (let c = 1; c <= ladder.TOTAL_CELLS; c++) {
    actual.push(ladder.rankOf(ladder.starsForCell(c)).rankName);
  }
  s.assert.deepEqual(actual, expectSeq);
  s.assert.equal(actual[0], '青铜 1');
  s.assert.equal(actual[8], '青铜 9');
  s.assert.equal(actual[9], '白银 1');
  s.assert.equal(actual[71], '荣耀王者 9');
});

s.test('门槛严格递增：每一级都比上一级更贵（越往后越难）', () => {
  let prev = -1;
  for (let c = 1; c <= ladder.TOTAL_CELLS; c++) {
    const need = ladder.starsForCell(c);
    s.assert.ok(need > prev, '第 ' + c + ' 级门槛 ' + need + ' 未高于上一级 ' + prev);
    prev = need;
  }
  s.assert.equal(ladder.starsForCell(1), 0, '第 1 级应为 0 星入门');
});

s.test('单级涨幅单调不减（后段每级明显更贵）', () => {
  for (let i = 1; i < ladder.TOTAL_CELLS - 1; i++) {
    s.assert.ok(ladder.starsToAdvance(i) >= ladder.starsToAdvance(i - 1),
      '第 ' + (i + 1) + ' 级的涨幅不应小于上一级');
  }
  const early = ladder.starsToAdvance(0);
  const late = ladder.starsToAdvance(ladder.TOTAL_CELLS - 2);
  s.assert.ok(late > early * 4, '后段涨幅应显著高于前段（青铜 ' + early + ' → 荣耀 ' + late + '）');
});

s.test('rankOf：边界星数落到正确的一级', () => {
  for (let c = 1; c <= ladder.TOTAL_CELLS; c++) {
    const need = ladder.starsForCell(c);
    s.assert.equal(ladder.rankOf(need).cell, c, need + ' 星应恰好进入第 ' + c + ' 级');
    if (c > 1) {
      s.assert.equal(ladder.rankOf(need - 1).cell, c - 1, (need - 1) + ' 星应还停在第 ' + (c - 1) + ' 级');
    }
  }
});

s.test('rankOf：rankId 仍是大段位 1~8（皮肤解锁口径不受影响）', () => {
  s.assert.equal(ladder.rankOf(0).rankId, 1);
  s.assert.equal(ladder.rankOf(ladder.starsForCell(10)).rankId, 2, '白银 1 段位编号应为 2');
  s.assert.equal(ladder.rankOf(99999).rankId, 8, '满级应封顶在荣耀王者（8）');
  s.assert.equal(ladder.rankOf(99999).cell, 72, '星数超出上限应封顶第 72 级');
  s.assert.equal(ladder.rankOf(-5).cell, 1, '负数星数应兜底到第 1 级');
});

s.test('progressOf：进度百分比落在 0~100 且与门槛自洽', () => {
  for (let c = 1; c < ladder.TOTAL_CELLS; c++) {
    const from = ladder.starsForCell(c);
    const to = ladder.starsForCell(c + 1);
    const mid = ladder.progressOf(Math.floor((from + to) / 2));
    s.assert.equal(mid.cell, c);
    s.assert.ok(mid.progressPercent >= 0 && mid.progressPercent <= 100, '进度越界：' + mid.progressPercent);
    s.assert.equal(mid.starsNeeded, to - Math.floor((from + to) / 2), '还差星数计算有误');
    s.assert.equal(mid.nextRankName, ladder.rankOf(to).rankName);
    s.assert.equal(mid.isMaxRank, false);
  }
});

s.test('progressOf：满级时 isMaxRank=true、进度 100、没有下一段位', () => {
  const p = ladder.progressOf(ladder.starsForCell(72) + 500);
  s.assert.equal(p.isMaxRank, true);
  s.assert.equal(p.progressPercent, 100);
  s.assert.equal(p.nextRankName, null);
  s.assert.equal(p.starsNeeded, 0);
});

s.test('端到端读数：0 星青铜 1；练满一个学段（30 星）升入白银', () => {
  s.assert.equal(ladder.rankOf(0).rankName, '青铜 1');
  // 一个学段 10 关 × 3 星 = 30 星；按当前曲线，青铜 9 需 18 星、白银 1 需 21 星
  s.assert.equal(ladder.starsForCell(9), 18, '青铜 9 的门槛应为 18 星');
  s.assert.equal(ladder.starsForCell(10), 21, '白银 1 的门槛应为 21 星');
  const r = ladder.rankOf(30);
  s.assert.equal(r.rankId, 2, '30 星应升入白银大段');
  s.assert.ok(r.rankLevel >= 1 && r.rankLevel <= 9, '小级应在 1~9');
  // 记录满级门槛，便于以后调参时对照（当前设计：527 星）
  s.assert.equal(ladder.starsForCell(72), 527, '满级（荣耀王者 9）门槛应稳定在 527 星');
});

s.test('徽章图：按小级拼 72 张图路径，且能回退大段位图', () => {
  // 2026-09-12 美术交付 72 张小级徽章：/assets/ranks/rank-<段key>-<1~9>-256.png
  s.assert.equal(ladder.rankOf(0).icon, '/assets/ranks/rank-bronze-1-256.png');
  s.assert.equal(ladder.rankOf(30).icon, '/assets/ranks/rank-silver-4-256.png');
  s.assert.ok(/^\/assets\/ranks\/[a-z]+\.png$/.test(ladder.rankOf(0).iconBig),
    '应同时给出大段位图路径作为兜底');
  // 72 级每级的图路径都不重复，且级号落在 1~9
  const paths = [];
  for (let c = 1; c <= ladder.TOTAL_CELLS; c++) {
    const cur = ladder.rankOf(ladder.starsForCell(c));
    s.assert.equal(cur.cell, c, '第 ' + c + ' 级门槛处应恰好是第 ' + c + ' 级');
    s.assert.ok(/-\d-256\.png$/.test(cur.icon), '图路径应带小级号：' + cur.icon);
    paths.push(cur.icon);
  }
  s.assert.equal(paths.length, 72);
  s.assert.allDistinct(paths, '72 级徽章图路径不应重复');
});

s.done();
