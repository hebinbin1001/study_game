/**
 * backfill-exam-tier.test.js —— 老用户段位封顶的存量修复
 *
 * 线上事故复现：老账号 exam_cleared_tier 为空 → 334 星被展示成 26 星。
 * 这段逻辑只在生产启动时跑一次，写错了要么修不好、要么把用户已考出的成绩覆盖掉，
 * 所以把「补谁、补成什么段」钉死在单测里。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('段位封顶存量修复');

const backfill = require('../../server/backfill-exam-tier');
const ladder = require('../../server/rank-ladder');
const examGate = require('../../server/exam-gate');

s.test('只补「从没考过 + 星数 > 0」的账号', () => {
  const plan = backfill.planBackfill([
    { openid: 'oA', stars: 334, examClearedTier: '' },
    { openid: 'oB', stars: 50, examClearedTier: null },
    { openid: 'oC', stars: 200, examClearedTier: 'bronze' },   // 已考过 → 不动
    { openid: 'oD', stars: 0, examClearedTier: '' },            // 0 星 → 不用补
    { openid: '', stars: 100, examClearedTier: '' }             // 脏数据 → 跳过
  ]);
  const ids = plan.map(function (p) { return p.openid; });
  s.assert.deepEqual(ids, ['oA', 'oB']);
});

s.test('补录后不再被封顶：真实星数 == 展示星数', () => {
  const stars = 334;
  const tier = ladder.rankOf(stars).rankKey;
  s.assert.equal(examGate.cappedStars(stars, tier), stars);
  s.assert.false(examGate.needsExam(stars, tier), '补录后不该再提示考试');
});

s.test('各档星数补录后都不封顶（从 1 星到满级逐档抽查）', () => {
  [1, 26, 27, 80, 161, 300, 500, 900, 1187].forEach(function (n) {
    const tier = ladder.rankOf(n).rankKey;
    s.assert.equal(examGate.cappedStars(n, tier), n, n + ' 星补录到 ' + tier + ' 后仍被封顶');
  });
});

s.test('边界：星数正好等于某大段第一级门槛时，补到该大段', () => {
  // 取第二个大段的起点星数
  const cellStart = ladder.starsForCell(ladder.LEVELS_PER_RANK + 1);
  const tier = ladder.rankOf(cellStart).rankKey;
  s.assert.equal(examGate.cappedStars(cellStart, tier), cellStart);
});

s.done();
