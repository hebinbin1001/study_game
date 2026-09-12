/**
 * wrong-book-view.test.js —— 错题本列表页纯逻辑单测（需求② 错题本优化）
 *
 * 覆盖 utils/wrong-book-view.js：
 *   1. 请求地址拼装（scope / page / pageSize 边界）；
 *   2. 分页追加：第 2 页接着第 1 页排，**分组标题不重复**（最容易写错的回归点）；
 *   3. 切 tab 重载（reset=true 用新数据替换，而不是继续往后拼）；
 *   4. 老服务端全量返回的兼容路径；
 *   5. 本地移除后的计数调整（删最后一条计数不为负、删未加载的条目不乱改计数）。
 *
 * 运行：node tests/unit/wrong-book-view.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('错题本列表页逻辑（utils/wrong-book-view.js）');

const view = require('../../miniprogram/utils/wrong-book-view');
const ebbinghaus = require('../../miniprogram/utils/ebbinghaus');

function rec(i, extra) {
  const base = {
    recordId: 'r' + i,
    questionId: 'q' + i,
    question: { type: 'w1', q: 'word' + i, a: 'word' + i, hint: '词' + i },
    wrongCount: 1,
    mastery: 20,
    reviewCount: 0,
    nextReviewAt: new Date(2026, 8, 12),
  };
  return Object.assign(base, extra || {});
}

function state(extra) {
  return Object.assign({
    activeTab: 'pending',
    pending: [],
    mastered: [],
    renderList: [],
    visible: [],
    visibleN: 0,
    page: 1,
    hasMore: false,
    moreCount: 0,
    stats: { total: 0, pending: 0, mastered: 0 }
  }, extra || {});
}

// ============ 1. 请求地址 ============
s.test('请求地址：带 scope/page/pageSize，非法 page 回退 1', () => {
  s.assert.equal(view.listUrl('pending', 2, 20), '/api/wrong/list?scope=pending&page=2&pageSize=20');
  s.assert.equal(view.listUrl('mastered', 3, 10), '/api/wrong/list?scope=mastered&page=3&pageSize=10');
  s.assert.equal(view.listUrl('pending', 0, 20), '/api/wrong/list?scope=pending&page=1&pageSize=20');
  s.assert.equal(view.listUrl('whatever', 1, 20), '/api/wrong/list?scope=pending&page=1&pageSize=20',
    '未知 scope 回退 pending');
  s.assert.equal(view.PAGE_SIZE, 20);
});

// ============ 2. 展示字段 ============
s.test('展示字段：到期文案 / 复习进度 / 阶段文案来自艾宾浩斯模块', () => {
  const d = view.decorate(rec(1, { mastery: 40, reviewCount: 2 }));
  s.assert.equal(d.recordId, 'r1');
  s.assert.equal(d.dueLabel, ebbinghaus.getNextReviewText(d.nextReviewAt));
  s.assert.equal(d.nextReviewText, d.dueLabel);
  s.assert.equal(d.reviewProgress, ebbinghaus.getReviewProgress(40));
  s.assert.equal(d.reviewStageText, ebbinghaus.getReviewStageText(2));
  const m = view.decorateMastered(rec(2, { mastery: 100 }));
  s.assert.equal(m.mastery, 100);
  s.assert.equal(m.dueLabel, undefined, '已掌握卡片不需要复习计划字段');
});

// ============ 3. 分组 ============
s.test('分组：相同到期文案只插一个分组标题', () => {
  const list = [
    view.decorate(rec(1, { nextReviewAt: new Date(2020, 0, 1) })),  // 早就到期
    view.decorate(rec(2, { nextReviewAt: new Date(2020, 0, 1) })),
  ];
  const rows = view.groupPending(list);
  s.assert.equal(rows.length, 3, '1 个分组标题 + 2 张卡片');
  s.assert.equal(rows[0].t, 'g');
  s.assert.equal(rows[1].t, 'c');
  s.assert.equal(rows[2].t, 'c');
  s.assert.equal(view.groupPending([]).length, 0);
  s.assert.equal(view.groupPending(null).length, 0, '空输入安全');
});

// ============ 4. 分页追加（关键回归点） ============
s.test('分页追加：第 2 页接着第 1 页排，分组标题不重复', () => {
  const sameDay = new Date(2026, 8, 12);
  const page1 = { items: [rec(1, { nextReviewAt: sameDay }), rec(2, { nextReviewAt: sameDay })], page: 1, total: 4, hasMore: true, counts: { total: 4, pending: 4, mastered: 0 } };
  const page2 = { items: [rec(3, { nextReviewAt: sameDay }), rec(4, { nextReviewAt: sameDay })], page: 2, total: 4, hasMore: false, counts: { total: 4, pending: 4, mastered: 0 } };

  const after1 = view.applyPage(state(), page1, true);
  s.assert.equal(after1.pending.length, 2);
  s.assert.equal(after1.renderList.length, 3, '第 1 页：1 个分组标题 + 2 张卡片');
  s.assert.equal(after1.hasMore, true);
  s.assert.equal(after1.moreCount, 2, '还有 2 条可加载');

  const after2 = view.applyPage(state(after1), page2, false);
  s.assert.equal(after2.pending.length, 4, '两页应累加');
  s.assert.equal(after2.renderList.length, 5, '分组标题只能有 1 个（4 卡 + 1 头）');
  s.assert.equal(after2.renderList.filter(function (r) { return r.t === 'g'; }).length, 1,
    '同一到期日不应出现重复分组标题');
  s.assert.equal(after2.hasMore, false);
  s.assert.equal(after2.moreCount, 0);
  s.assert.equal(after2.page, 2);
});

s.test('分页追加：reset=true 用新数据替换（切 tab 后不会把上一 tab 的数据拼进来）', () => {
  const first = { items: [rec(1), rec(2)], page: 1, total: 2, hasMore: false, counts: { total: 2, pending: 2, mastered: 0 } };
  const after1 = view.applyPage(state(), first, true);
  const replaced = view.applyPage(state(after1), { items: [rec(9)], page: 1, total: 1, hasMore: false, counts: { total: 1, pending: 1, mastered: 0 } }, true);
  s.assert.equal(replaced.pending.length, 1);
  s.assert.equal(replaced.pending[0].recordId, 'r9');
});

s.test('已掌握 tab：使用 mastered 列表与 counts', () => {
  const page = { items: [rec(1, { mastery: 100 })], page: 1, total: 1, hasMore: false, counts: { total: 6, pending: 5, mastered: 1 } };
  const next = view.applyPage(state({ activeTab: 'mastered' }), page, true);
  s.assert.equal(next.mastered.length, 1);
  s.assert.equal(next.stats.total, 6);
  s.assert.equal(next.stats.pending, 5);
  s.assert.equal(next.stats.mastered, 1);
  s.assert.equal(next.pending, undefined, '已掌握 tab 不应改动待复习列表');
});

// ============ 5. 老服务端兼容 ============
s.test('老服务端（全量返回）：一次渲染全部，hasMore=false', () => {
  const legacy = view.applyLegacy({
    pending: [rec(1), rec(2)],
    mastered: [rec(3, { mastery: 100 })],
    total: 3
  });
  s.assert.equal(legacy.pending.length, 2);
  s.assert.equal(legacy.mastered.length, 1);
  s.assert.equal(legacy.hasMore, false);
  s.assert.equal(legacy.moreCount, 0);
  s.assert.equal(legacy.stats.total, 3);
  s.assert.equal(legacy.renderList.filter(function (r) { return r.t === 'c'; }).length, 2);
});

// ============ 6. 本地移除 ============
s.test('本地移除：待复习删一条 → 卡片与三个计数都 -1', () => {
  const page = { items: [rec(1), rec(2), rec(3)], page: 1, total: 3, hasMore: false, counts: { total: 8, pending: 3, mastered: 5 } };
  const before = state(view.applyPage(state(), page, true));
  const after = view.removeRecord(before, 'r2');
  s.assert.equal(after.pending.length, 2);
  s.assert.equal(after.renderList.filter(function (r) { return r.t === 'c'; }).length, 2);
  s.assert.equal(after.stats.total, 7);
  s.assert.equal(after.stats.pending, 2);
  s.assert.equal(after.stats.mastered, 5, '已掌握计数不受影响');
});

s.test('本地移除：已掌握删一条 → 只减 mastered 与 total', () => {
  const page = { items: [rec(1, { mastery: 100 })], page: 1, total: 1, hasMore: false, counts: { total: 8, pending: 6, mastered: 2 } };
  const before = state(view.applyPage(state({ activeTab: 'mastered' }), page, true));
  const after = view.removeRecord(before, 'r1');
  s.assert.equal(after.mastered.length, 0);
  s.assert.equal(after.stats.total, 7);
  s.assert.equal(after.stats.pending, 6);
  s.assert.equal(after.stats.mastered, 1);
});

s.test('本地移除：删未加载的条目 → 计数保持原样（等 onShow 重载纠正）', () => {
  const page = { items: [rec(1)], page: 1, total: 10, hasMore: true, counts: { total: 10, pending: 10, mastered: 0 } };
  const before = state(view.applyPage(state(), page, true));
  const after = view.removeRecord(before, 'r999');
  s.assert.equal(after.pending.length, 1);
  s.assert.equal(after.stats.total, 10);
  s.assert.equal(after.stats.pending, 10);
});

s.test('本地移除：删成空列表且计数不为负', () => {
  const page = { items: [rec(1)], page: 1, total: 1, hasMore: false, counts: { total: 1, pending: 1, mastered: 0 } };
  const before = state(view.applyPage(state(), page, true));
  const after = view.removeRecord(before, 'r1');
  s.assert.equal(after.pending.length, 0);
  s.assert.equal(after.stats.total, 0);
  s.assert.equal(after.stats.pending, 0);
  s.assert.equal(after.visible.length, 0);
  const again = view.removeRecord(after, 'r1');
  s.assert.equal(again.stats.total, 0, '重复删除不应出现负数');
});

s.done();
