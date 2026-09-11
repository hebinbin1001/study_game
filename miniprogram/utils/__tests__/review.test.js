/**
 * review.test.js —— 错题回流主玩法的抽题策略单测（R2）
 *
 * 覆盖 utils/review.js 的四件事：
 *   ① buildPool：快照不完整 / 未到期 / 分类不符 / 同题面重复 都要被挡掉；
 *   ② usedMapOf：把已出题列表转成题面排重映射；
 *   ③ pickFromPool：只在本局没出过的错题里取，取不到返回 null（调用方据此回退随机）；
 *   ④ shouldUseReview：按概率分流，rate<=0 永远不分流。
 *
 * 随机源全部注入，断言不依赖真实随机。
 *
 * 运行：node miniprogram/utils/__tests__/review.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/review.js');

const review = require('../review');

const NOW = Date.now();
const PAST = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();   // 已到期
const FUTURE = new Date(NOW + 24 * 60 * 60 * 1000).toISOString(); // 未到期

// 题面长度 >= 4 的 c2 视为成语；c1 单字视为词语（与 constants.TYPE_GROUPS 口径一致）
const ITEM_IDIOM = { type: 'c2', q: '守株待兔', a: '守株待兔', hint: '死守经验不知变通' };
const ITEM_WORD_CN = { type: 'c1', q: '花', a: '花', hint: '花朵' };
const ITEM_EN = { type: 'w1', q: 'cat', a: 'cat', hint: '猫' };

function rec(question, nextReviewAt, extra) {
  return Object.assign({ question: question, nextReviewAt: nextReviewAt, mastery: 20 }, extra || {});
}

s.test('buildPool：question 快照不完整的记录被跳过', () => {
  const pool = review.buildPool([
    rec(null, PAST),
    rec({ type: 'w1', q: '', a: '' }, PAST),
    rec({ type: 'w1', q: 'cat' }, PAST),          // 缺 a
    rec(ITEM_EN, PAST)
  ]);
  s.assert.equal(pool.length, 1);
  s.assert.equal(pool[0].item.q, 'cat');
});

s.test('buildPool：默认只保留已到期错题（未来到期的不出）', () => {
  const pool = review.buildPool([
    rec(ITEM_EN, PAST),
    rec(ITEM_IDIOM, FUTURE)
  ]);
  s.assert.equal(pool.length, 1);
  s.assert.equal(pool[0].item.q, 'cat');
});

s.test('buildPool：dueOnly=false 时不再按到期过滤', () => {
  const pool = review.buildPool([
    rec(ITEM_EN, PAST),
    rec(ITEM_IDIOM, FUTURE)
  ], { dueOnly: false });
  s.assert.equal(pool.length, 2);
});

s.test('buildPool：nextReviewAt 缺失视为到期（新错当天即可复习）', () => {
  const pool = review.buildPool([rec(ITEM_EN, null)]);
  s.assert.equal(pool.length, 1, '新错题应当天可复习，不能被到期判定挡掉');
});

s.test('buildPool：同一题面只保留一条', () => {
  const pool = review.buildPool([
    rec(ITEM_EN, PAST),
    rec(ITEM_EN, PAST)
  ]);
  s.assert.equal(pool.length, 1);
});

s.test('buildPool：分类关卡只取该分类的错题（idiom）', () => {
  const pool = review.buildPool([
    rec(ITEM_IDIOM, PAST),
    rec(ITEM_WORD_CN, PAST),
    rec(ITEM_EN, PAST)
  ], { typeKey: 'idiom' });
  s.assert.equal(pool.length, 1);
  s.assert.equal(pool[0].item.q, '守株待兔');
});

s.test('buildPool：分类关卡只取该分类的错题（word）', () => {
  const pool = review.buildPool([
    rec(ITEM_IDIOM, PAST),
    rec(ITEM_WORD_CN, PAST),
    rec(ITEM_EN, PAST)
  ], { typeKey: 'word' });
  s.assert.equal(pool.length, 1);
  s.assert.equal(pool[0].item.q, 'cat');
});

s.test('buildPool：typeKey 为空或 all 表示不限分类', () => {
  const all = [rec(ITEM_IDIOM, PAST), rec(ITEM_EN, PAST)];
  s.assert.equal(review.buildPool(all, { typeKey: '' }).length, 2);
  s.assert.equal(review.buildPool(all, { typeKey: 'all' }).length, 2);
});

s.test('usedMapOf：由已出题列表构造题面映射', () => {
  const m = review.usedMapOf([ITEM_EN, null, ITEM_IDIOM, { q: '' }]);
  s.assert.equal(m.cat, true);
  s.assert.equal(m['守株待兔'], true);
  s.assert.equal(m[''], undefined, '空题面不应登记');
});

s.test('pickFromPool：只在本局没出过的错题里取', () => {
  const pool = review.buildPool([rec(ITEM_EN, PAST), rec(ITEM_IDIOM, PAST)]);
  const used = review.usedMapOf([ITEM_EN]);
  const hit = review.pickFromPool(pool, used, function () { return 0; });
  s.assert.ok(hit !== null);
  s.assert.equal(hit.item.q, '守株待兔', '已出过的 cat 不应再被选中');
});

s.test('pickFromPool：池为空或全部出过时返回 null（调用方据此回退随机）', () => {
  s.assert.equal(review.pickFromPool([], {}), null);
  const pool = review.buildPool([rec(ITEM_EN, PAST)]);
  s.assert.equal(review.pickFromPool(pool, review.usedMapOf([ITEM_EN])), null);
});

s.test('pickFromPool：注入随机源可定位取第几条', () => {
  const pool = review.buildPool([rec(ITEM_EN, PAST), rec(ITEM_IDIOM, PAST)]);
  s.assert.equal(review.pickFromPool(pool, {}, function () { return 0; }).item.q, 'cat');
  s.assert.equal(review.pickFromPool(pool, {}, function () { return 0.99; }).item.q, '守株待兔');
});

s.test('shouldUseReview：按概率分流（random < rate 才走错题）', () => {
  s.assert.equal(review.shouldUseReview(0.25, function () { return 0.24; }), true);
  s.assert.equal(review.shouldUseReview(0.25, function () { return 0.25; }), false);
  s.assert.equal(review.shouldUseReview(0.25, function () { return 0.99; }), false);
});

s.test('shouldUseReview：rate<=0 或缺失时走默认值', () => {
  s.assert.equal(review.shouldUseReview(0, function () { return 0; }), false, 'rate=0 应恒不分流');
  s.assert.equal(review.shouldUseReview(undefined, function () { return 0.1; }), true, '缺省用 DEFAULT_REVIEW_RATE');
});

s.test('DEFAULT_REVIEW_RATE：落在需求约定的 20%~30% 区间', () => {
  s.assert.ok(review.DEFAULT_REVIEW_RATE >= 0.2, '不得低于 20%');
  s.assert.ok(review.DEFAULT_REVIEW_RATE <= 0.3, '不得高于 30%');
});

s.done();
