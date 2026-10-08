/**
 * season-rewards.test.js —— 赛季奖励档位
 *
 * 为什么值得测：档位判定直接发星，写错了就会出现「没参赛也领 30 星」。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('赛季奖励档位');

const R = require('../../server/season-rewards');

s.test('前三名 → 30 星', () => {
  s.assert.equal(R.tierOf(1, 500).stars, 30);
  s.assert.equal(R.tierOf(3, 0).stars, 30);
  s.assert.equal(R.tierOf(1, 500).tier, 'top3');
});

s.test('4~10 名 → 15 星', () => {
  s.assert.equal(R.tierOf(4, 0).stars, 15);
  s.assert.equal(R.tierOf(10, 0).stars, 15);
  s.assert.equal(R.tierOf(10, 0).tier, 'top10');
});

s.test('榜外但赛季积分 ≥ 10 → 参与奖 5 星', () => {
  s.assert.equal(R.tierOf(0, 10).stars, 5);
  s.assert.equal(R.tierOf(300, 88).stars, 5);
  s.assert.equal(R.tierOf(0, 10).tier, 'active');
});

s.test('既没名次也没积分 → 无奖励', () => {
  s.assert.equal(R.tierOf(0, 9), null);
  s.assert.equal(R.tierOf(0, 0), null);
  s.assert.equal(R.tierOf(null, null), null);
});

s.test('档位列表对外可用（端上展示奖励说明）', () => {
  const list = R.tiers();
  s.assert.equal(list.length, 3);
  s.assert.true(list.every(function (t) { return t.tier && t.stars > 0 && t.label; }));
  // 返回的是副本，改它不影响内部常量
  list[0].stars = 999;
  s.assert.equal(R.TIERS[0].stars, 30);
});

s.done();
