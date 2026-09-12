/**
 * challenge-rewards.test.js —— 挑战主线里程碑宝箱单测（P3）
 *
 * 覆盖：通关数统计口径（≥1 星才算通）、宝箱可达判定、领取幂等、奖励累加、
 *      跨学段互不影响、未达标不给领。
 *
 * 运行：node miniprogram/utils/__tests__/challenge-rewards.test.js
 */

'use strict';

const { suite } = require('./_runner');
const s = suite('挑战主线里程碑宝箱');

const rewards = require('../challenge-rewards');
const storage = require('../storage');

const G = 't_chest_g';        // 用独立学段 key 隔离用例，避免污染其它存档
const G2 = 't_chest_g2';

function reset() {
  storage.set(rewards.CLAIM_KEY, {});
  storage.set('ww_stars', {});
}

/** 给某学段造 n 关「已通关（≥1 星）」 */
function seedCleared(grade, n) {
  for (let i = 1; i <= n; i++) storage.saveStars(grade, i, 1, 'challenge');
}

s.test('里程碑定义：每 10 关一个宝箱，奖励递增', () => {
  s.assert.deepEqual(rewards.CHESTS.map(function (c) { return c.at; }), [10, 20, 30]);
  rewards.CHESTS.forEach(function (c, i) {
    s.assert.ok(c.stars > 0, '奖励应为正数');
    if (i > 0) s.assert.ok(c.stars >= rewards.CHESTS[i - 1].stars, '越深的宝箱奖励不应更低');
  });
});

s.test('通关数：只有 ≥1 星的关卡算通过（0 星不算）', () => {
  reset();
  s.assert.equal(rewards.clearedCount(G), 0);
  storage.saveStars(G, 1, 0, 'challenge');    // 0 星：没通
  s.assert.equal(rewards.clearedCount(G), 0, '0 星不应计入');
  storage.saveStars(G, 2, 1, 'challenge');
  s.assert.equal(rewards.clearedCount(G), 1);
  storage.saveStars(G, 3, 3, 'challenge');
  s.assert.equal(rewards.clearedCount(G), 2);
  // 自由练/其它命名空间的星不应该被算进来
  storage.saveStars(G, 9, 3);                 // 自由练（无 typeKey）
  s.assert.equal(rewards.clearedCount(G), 2, '自由练存档不应计入挑战关卡数');
});

s.test('宝箱状态：未达标 → 可达 → 已领取 三态', () => {
  reset();
  seedCleared(G, 9);
  let st = rewards.chestState(G);
  s.assert.equal(st[0].reached, false, '9 关还没到 10 关宝箱');
  s.assert.equal(st[0].claimable, false);

  seedCleared(G, 10);
  st = rewards.chestState(G);
  s.assert.equal(st[0].reached, true);
  s.assert.equal(st[0].claimable, true);
  s.assert.equal(st[1].claimable, false, '20 关宝箱还没到');

  const r = rewards.claim(G, 10);
  s.assert.equal(r.ok, true);
  s.assert.equal(r.stars, 10);
  st = rewards.chestState(G);
  s.assert.equal(st[0].claimed, true);
  s.assert.equal(st[0].claimable, false, '领过就不能再领');
});

s.test('领取：幂等（重复领取不给星、不报错）', () => {
  reset();
  seedCleared(G, 10);
  s.assert.equal(rewards.claim(G, 10).stars, 10);
  const again = rewards.claim(G, 10);
  s.assert.equal(again.ok, true, '重复领取仍返回 ok（幂等）');
  s.assert.equal(again.already, true);
  s.assert.equal(again.stars, 0, '重复领取不再给星');
});

s.test('领取：没达标不给领，并说明原因', () => {
  reset();
  seedCleared(G, 5);
  const r = rewards.claim(G, 10);
  s.assert.equal(r.ok, false);
  s.assert.equal(r.stars, 0);
  s.assert.ok(/还没通到/.test(r.reason), '应说明原因，实际 = ' + r.reason);
  const bad = rewards.claim(G, 15);
  s.assert.equal(bad.ok, false);
  s.assert.ok(/没有这个宝箱/.test(bad.reason));
});

s.test('跨学段独立：一个学段的通关数/领取状态不影响另一个', () => {
  reset();
  seedCleared(G, 30);
  seedCleared(G2, 3);
  s.assert.equal(rewards.clearedCount(G), 30);
  s.assert.equal(rewards.clearedCount(G2), 3);
  s.assert.equal(rewards.claim(G, 10).stars, 10);
  s.assert.equal(rewards.claim(G2, 10).ok, false, '另一个学段没达标不能领');
  const st2 = rewards.chestState(G2);
  s.assert.equal(st2[0].claimed, false, '领取状态按学段隔离');
});

s.test('全通奖励：30 关毕业宝箱累计 60 星（10+20+30）', () => {
  reset();
  seedCleared(G, 30);
  let total = 0;
  rewards.CHESTS.forEach(function (c) { total += rewards.claim(G, c.at).stars; });
  s.assert.equal(total, 60, '三个宝箱合计 60 星');
  const st = rewards.chestState(G);
  s.assert.ok(st.every(function (c) { return c.claimed; }), '三个宝箱都应显示已领取');
});

s.done();
