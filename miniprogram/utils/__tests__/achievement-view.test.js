/**
 * achievement-view.test.js —— 成就页纯逻辑单测（需求④）
 *
 * 覆盖 utils/achievement-view.js：
 *   1. 卡片装饰：进度百分比、进度文案（未解锁 current/threshold、解锁显示日期）、图标兜底标记；
 *   2. 分类推导：由数据推导 tab（含「全部」「已解锁」），数量与已解锁数正确，未知分类追加在末尾；
 *   3. 筛选：全部 / 已解锁 / 具体分类；
 *   4. 渲染行：仅「全部」视图插分类分组标题，具体分类下不插；
 *   5. 汇总与日期格式化边界（null / 非法日期 / Date 对象）。
 *
 * 运行：node miniprogram/utils/__tests__/achievement-view.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('成就页逻辑（utils/achievement-view.js）');

const view = require('../achievement-view');

function item(id, category, extra) {
  return Object.assign({
    achievementId: id,
    name: id,
    description: id + ' 描述',
    category: category,
    icon: '/assets/achievements/' + id + '.png',
    current: 0,
    threshold: 10,
    progress: 0,
    unlocked: false,
    unlockedAt: null,
  }, extra || {});
}

// ============ 1. 卡片装饰 ============
s.test('装饰：未解锁显示 current/threshold，解锁显示日期', () => {
  const list = view.decorate([
    item('a', 'answer', { current: 5, threshold: 10, progress: 50 }),
    item('b', 'level', { current: 10, threshold: 10, progress: 100, unlocked: true, unlockedAt: '2026-09-12T02:00:00.000Z' }),
  ]);
  s.assert.equal(list[0].progressText, '5/10');
  s.assert.equal(list[0].unlocked, false);
  s.assert.equal(list[0].iconErr, false, '默认不标记图片失败');
  s.assert.equal(list[1].progressText, '已达成');
  s.assert.ok(/^2026-09-12$/.test(list[1].unlockedText), '解锁日期应格式化为 YYYY-MM-DD，实际 ' + list[1].unlockedText);
  s.assert.equal(list[0].emoji, view.CATEGORY_EMOJI.answer);
});

s.test('装饰：缺 progress 字段时由 current/threshold 现算，越界封顶', () => {
  const list = view.decorate([
    item('a', 'answer', { current: 3, threshold: 4, progress: undefined }),
    item('b', 'answer', { current: 99, threshold: 4, progress: undefined }),
  ]);
  s.assert.equal(list[0].progress, 75);
  s.assert.equal(list[1].progress, 100, '进度不能超过 100');
});

s.test('装饰：空输入安全', () => {
  s.assert.deepEqual(view.decorate(null), []);
  s.assert.deepEqual(view.decorate([]), []);
});

// ============ 2. 分类推导 ============
s.test('分类：推导出「全部」+「已解锁」+ 数据里出现的分类，数量正确', () => {
  const list = view.decorate([
    item('a1', 'answer', { unlocked: true }),
    item('a2', 'answer'),
    item('l1', 'level', { unlocked: true }),
  ]);
  const cats = view.buildCategories(list);
  s.assert.equal(cats[0].key, 'all');
  s.assert.equal(cats[0].total, 3);
  s.assert.equal(cats[0].unlocked, 2);
  s.assert.equal(cats[1].key, 'unlocked');
  s.assert.equal(cats[1].unlocked, 2);
  const answer = cats.find(function (c) { return c.key === 'answer'; });
  const level = cats.find(function (c) { return c.key === 'level'; });
  s.assert.equal(answer.total, 2);
  s.assert.equal(answer.unlocked, 1);
  s.assert.equal(level.total, 1);
  s.assert.equal(cats.some(function (c) { return c.key === 'habit'; }), false, '没有数据的分类不应出现');
});

s.test('分类：未知分类追加在已知分类之后（后端加分类前端自动出现）', () => {
  const cats = view.buildCategories(view.decorate([
    item('x', 'brand_new'),
    item('a', 'answer'),
  ]));
  const keys = cats.map(function (c) { return c.key; });
  s.assert.equal(keys[0], 'all');
  s.assert.equal(keys[1], 'unlocked');
  s.assert.ok(keys.indexOf('answer') < keys.indexOf('brand_new'), '未知分类应排在末尾');
});

// ============ 3. 筛选 ============
s.test('筛选：全部 / 已解锁 / 具体分类', () => {
  const list = view.decorate([
    item('a1', 'answer', { unlocked: true }),
    item('a2', 'answer'),
    item('l1', 'level', { unlocked: true }),
  ]);
  s.assert.equal(view.filterByCategory(list, 'all').length, 3);
  s.assert.equal(view.filterByCategory(list, '').length, 3, '空 key 视为全部');
  s.assert.equal(view.filterByCategory(list, 'unlocked').length, 2);
  s.assert.equal(view.filterByCategory(list, 'answer').length, 2);
  s.assert.equal(view.filterByCategory(list, 'habit').length, 0);
});

// ============ 4. 渲染行（分组标题） ============
s.test('渲染行：「全部」视图按分类插分组标题，且每个分类只插一次', () => {
  const list = view.decorate([
    item('a1', 'answer', { unlocked: true }),
    item('a2', 'answer'),
    item('l1', 'level'),
  ]);
  const cats = view.buildCategories(list);
  const rows = view.buildRows(list, 'all', cats);
  const headers = rows.filter(function (r) { return r.t === 'g'; });
  s.assert.equal(headers.length, 2, '两个分类应有两个分组标题');
  s.assert.equal(headers[0].text, '答题');
  s.assert.equal(headers[0].unlocked, 1);
  s.assert.equal(headers[0].count, 2);
  s.assert.equal(rows.length, 5, '2 个标题 + 3 张卡片');
  s.assert.equal(rows[1].t, 'c');
  s.assert.equal(rows[1].it.achievementId, 'a1');
});

s.test('渲染行：具体分类下不插分组标题', () => {
  const list = view.decorate([item('a1', 'answer'), item('a2', 'answer')]);
  const cats = view.buildCategories(list);
  const rows = view.buildRows(list, 'answer', cats);
  s.assert.equal(rows.length, 2);
  rows.forEach(function (r) { s.assert.equal(r.t, 'c'); });
});

s.test('渲染行：「已解锁」是筛选态，不插分类标题（仅「全部」视图分组）', () => {
  const list = view.decorate([
    item('a1', 'answer', { unlocked: true }),
    item('a2', 'answer'),
    item('l1', 'level', { unlocked: true }),
  ]);
  const cats = view.buildCategories(list);
  const rows = view.buildRows(list, 'unlocked', cats);
  s.assert.equal(rows.filter(function (r) { return r.t === 'c'; }).length, 2);
  s.assert.equal(rows.filter(function (r) { return r.t === 'g'; }).length, 0,
    '「已解锁」是筛选态，不需要分类标题');
});

// ============ 5. 汇总与日期 ============
s.test('汇总：总数 / 已解锁 / 百分比（空列表为 0 不除零）', () => {
  const list = view.decorate([
    item('a', 'answer', { unlocked: true }),
    item('b', 'answer'),
    item('c', 'answer'),
    item('d', 'answer'),
  ]);
  const sum = view.summaryOf(list);
  s.assert.equal(sum.total, 4);
  s.assert.equal(sum.unlocked, 1);
  s.assert.equal(sum.percent, 25);
  s.assert.deepEqual(view.summaryOf([]), { total: 0, unlocked: 0, percent: 0 });
});

s.test('日期格式化：null / 非法值返回空串，Date 对象正常', () => {
  s.assert.equal(view.formatDate(null), '');
  s.assert.equal(view.formatDate(undefined), '');
  s.assert.equal(view.formatDate('not-a-date'), '');
  s.assert.equal(view.formatDate(new Date(2026, 8, 12)), '2026-09-12');
});

s.done();
