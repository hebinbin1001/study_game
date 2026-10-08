/**
 * pk-rules.test.js —— 好友 PK 的胜负判定与奖励封顶
 *
 * 为什么值得测：胜负判定写错了，会出现「我 9 题比他 10 题还赢」这种一眼假的结果；
 * 每日封顶写错了，则会被刷星（规划明确「每人每天最多靠 PK 拿 10 星」）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('好友 PK 规则');

const P = require('../../server/pk-rules');

s.test('normalizeScore：合法成绩归一化', () => {
  s.assert.deepEqual(P.normalizeScore({ correct: '8', total: '10', ms: '32000' }),
    { correct: 8, total: 10, ms: 32000 });
});

s.test('normalizeScore：越界/脏数据一律 null', () => {
  s.assert.equal(P.normalizeScore({ correct: 11, total: 10, ms: 5000 }), null);
  s.assert.equal(P.normalizeScore({ correct: -1, total: 10, ms: 5000 }), null);
  s.assert.equal(P.normalizeScore({ correct: 1, total: 0, ms: 5000 }), null);
  s.assert.equal(P.normalizeScore({ correct: 1, total: 10, ms: 100 }), null);
  s.assert.equal(P.normalizeScore({ correct: 1, total: 10, ms: 99 * 3600 * 1000 }), null);
  s.assert.equal(P.normalizeScore(null), null);
  s.assert.equal(P.normalizeScore({ correct: 'x', total: 'y', ms: 'z' }), null);
});

s.test('outcomeOf：先比答对数（10/10 胜 9/10）', () => {
  s.assert.equal(P.outcomeOf({ correct: 10, total: 10, ms: 90000 }, { correct: 9, total: 10, ms: 10000 }), 'challenger');
  s.assert.equal(P.outcomeOf({ correct: 9, total: 10, ms: 10000 }, { correct: 10, total: 10, ms: 90000 }), 'opponent');
});

s.test('outcomeOf：不同题数时用交叉相乘比正确率', () => {
  // 6/10 (60%) vs 5/8 (62.5%) → 应战方胜
  s.assert.equal(P.outcomeOf({ correct: 6, total: 10, ms: 10000 }, { correct: 5, total: 8, ms: 10000 }), 'opponent');
  // 8/10 (80%) vs 5/8 (62.5%) → 发起方胜
  s.assert.equal(P.outcomeOf({ correct: 8, total: 10, ms: 10000 }, { correct: 5, total: 8, ms: 10000 }), 'challenger');
});

s.test('outcomeOf：正确率相同比用时（少者胜）', () => {
  s.assert.equal(P.outcomeOf({ correct: 8, total: 10, ms: 30000 }, { correct: 8, total: 10, ms: 40000 }), 'challenger');
  s.assert.equal(P.outcomeOf({ correct: 8, total: 10, ms: 40000 }, { correct: 8, total: 10, ms: 30000 }), 'opponent');
  s.assert.equal(P.outcomeOf({ correct: 8, total: 10, ms: 30000 }, { correct: 8, total: 10, ms: 30000 }), 'draw');
});

s.test('rewardOf：胜 3 / 平 1 / 负 0，双方视角各自正确', () => {
  s.assert.equal(P.rewardOf('challenger', true), 3);
  s.assert.equal(P.rewardOf('challenger', false), 0);
  s.assert.equal(P.rewardOf('opponent', false), 3);
  s.assert.equal(P.rewardOf('opponent', true), 0);
  s.assert.equal(P.rewardOf('draw', true), 1);
  s.assert.equal(P.rewardOf('draw', false), 1);
});

s.test('capDaily：每天最多 10 星', () => {
  s.assert.equal(P.capDaily(0, 3), 3);
  s.assert.equal(P.capDaily(8, 3), 2);
  s.assert.equal(P.capDaily(9, 3), 1);
  s.assert.equal(P.capDaily(10, 3), 0);
  s.assert.equal(P.capDaily(12, 3), 0);
  s.assert.equal(P.capDaily(-5, 3), 3);
});

s.test('scoreOf：答对为主，用时短有加分', () => {
  s.assert.equal(P.scoreOf({ correct: 10, total: 10, ms: 0 }), 10 * 100 + 99);
  s.assert.equal(P.scoreOf({ correct: 10, total: 10, ms: 600000 }), 10 * 100 + 0);
  // 少答对一题，速度再快也追不回来（99 < 100）
  s.assert.true(P.scoreOf({ correct: 9, total: 10, ms: 1000 }) < P.scoreOf({ correct: 10, total: 10, ms: 600000 }));
});

s.test('isExpired：超过 7 天算过期', () => {
  const now = new Date('2026-10-08T12:00:00+08:00').getTime();
  s.assert.false(P.isExpired(new Date(now - 3 * 24 * 3600 * 1000), now));
  s.assert.true(P.isExpired(new Date(now - 8 * 24 * 3600 * 1000), now));
  s.assert.false(P.isExpired('不是时间', now));
});

s.done();
