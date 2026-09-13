/**
 * wrong-book-reviewed.test.js —— 错题本「已复习」口径（2026-09-13 用户新增）
 *
 * 背景：原来只有「待复习（熟练度<100）/ 已掌握（=100）」。用户答对一次后发现
 *       「已掌握」还是空的（要连续答对 5 次才满 100），缺少一档「我练过了」。
 *       现在新增第三档：
 *         · 待复习 pending：熟练度 < 100（含从没复习过的）
 *         · 已复习 reviewed：复习过（reviewCount ≥ 1）且熟练度 < 100 —— 是 pending 的子集
 *         · 已掌握 mastered：熟练度 = 100
 *
 * 覆盖：服务端分档/计数/分页 + 端上 listUrl / applyPage / removeRecord。
 *
 * 运行：node tests/unit/wrong-book-reviewed.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('错题本「已复习」口径');

const book = require('../../server/wrong-book');
const view = require('../../miniprogram/utils/wrong-book-view');

function rec(id, mastery, reviewCount) {
  return {
    recordId: id,
    mastery: mastery,
    reviewCount: reviewCount,
    wrongCount: 2,
    nextReviewAt: new Date().toISOString(),
    question: { type: 'w1', q: 'q-' + id, a: 'a-' + id }
  };
}

// 五条样本：从没复习 / 练过 1 次 / 练过 4 次 / 两条已满 100
const ALL = [rec('a', 0, 0), rec('b', 20, 1), rec('c', 80, 4), rec('d', 100, 5), rec('e', 100, 6)];

s.test('服务端：counts 三档各自独立，且 reviewed 是 pending 的子集', () => {
  const resp = book.buildListResponse(ALL, { scope: 'all', page: 1, pageSize: 20 });
  s.assert.equal(resp.counts.total, 5);
  s.assert.equal(resp.counts.pending, 3, 'a/b/c 熟练度 <100');
  s.assert.equal(resp.counts.reviewed, 2, 'b/c 复习过且没满 100');
  s.assert.equal(resp.counts.mastered, 2, 'd/e 满 100');
});

s.test('服务端：scope=reviewed 只出「练过但没满」的题', () => {
  const resp = book.buildListResponse(ALL, { scope: 'reviewed', page: 1, pageSize: 20 });
  s.assert.equal(resp.scope, 'reviewed');
  s.assert.equal(resp.total, 2);
  s.assert.deepEqual(resp.items.map(function (r) { return r.recordId; }), ['b', 'c']);
});

s.test('服务端：reviewed 也按 page/pageSize 分页', () => {
  const first = book.buildListResponse(ALL, { scope: 'reviewed', page: 1, pageSize: 1 });
  s.assert.equal(first.items.length, 1);
  s.assert.equal(first.items[0].recordId, 'b');
  s.assert.equal(first.hasMore, true);
  const second = book.buildListResponse(ALL, { scope: 'reviewed', page: 2, pageSize: 1 });
  s.assert.equal(second.items[0].recordId, 'c');
  s.assert.equal(second.hasMore, false);
});

s.test('服务端：非法 scope 仍然报错（不悄悄纠正）', () => {
  const resp = book.buildListResponse(ALL, { scope: 'doing', page: 1, pageSize: 20 });
  s.assert.ok(!!resp.error, '未知 scope 应返回 error');
});

s.test('端上：listUrl 支持 reviewed（其余非法值回退 pending）', () => {
  s.assert.contains(view.listUrl('reviewed', 2, 10), 'scope=reviewed');
  s.assert.contains(view.listUrl('reviewed', 2, 10), 'page=2');
  s.assert.contains(view.listUrl('mastered', 1, 10), 'scope=mastered');
  s.assert.contains(view.listUrl('doing', 1, 10), 'scope=pending');
});

s.test('端上：applyPage 带回 reviewed 列表与计数', () => {
  const state = { activeTab: 'reviewed', reviewed: [] };
  const page = {
    items: [rec('b', 20, 1)],
    page: 1,
    total: 1,
    hasMore: false,
    counts: { total: 5, pending: 3, mastered: 2, reviewed: 1 }
  };
  const patch = view.applyPage(state, page, true);
  s.assert.equal(patch.reviewed.length, 1);
  s.assert.equal(patch.reviewed[0].recordId, 'b');
  s.assert.equal(patch.reviewed[0].reviewCount, 1, '列表要能显示「复习过 N 次」');
  s.assert.equal(patch.stats.reviewed, 1);
  s.assert.equal(patch.stats.mastered, 2);
});

s.test('端上：applyPage 第二页追加而不是覆盖', () => {
  const state = { activeTab: 'reviewed', reviewed: [rec('b', 20, 1)] };
  const page = {
    items: [rec('c', 40, 2)], page: 2, total: 2, hasMore: false,
    counts: { total: 5, pending: 3, mastered: 2, reviewed: 2 }
  };
  const patch = view.applyPage(state, page, false);
  s.assert.deepEqual(patch.reviewed.map(function (r) { return r.recordId; }), ['b', 'c']);
});

s.test('端上：移除「已复习」条目会同步减计数', () => {
  const state = {
    reviewed: [{ recordId: 'b' }, { recordId: 'c' }],
    pending: [], mastered: [],
    stats: { total: 5, pending: 3, mastered: 2, reviewed: 2 },
    moreCount: 0
  };
  const patch = view.removeRecord(state, 'b');
  s.assert.equal(patch.reviewed.length, 1);
  s.assert.equal(patch.stats.reviewed, 1);
  s.assert.equal(patch.stats.total, 4);
  s.assert.equal(patch.stats.pending, 3, '已复习条目被移除时不该动 pending 计数（列表本身不在这档）');
});

s.test('端上：老服务端（无 reviewed 字段）不会崩', () => {
  const legacy = view.applyLegacy({ pending: [], mastered: [], total: 0 });
  s.assert.ok(legacy.stats, '老形状也要能给出 stats');
  s.assert.equal(legacy.stats.reviewed, 0);
});
