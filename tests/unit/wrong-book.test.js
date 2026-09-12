/**
 * wrong-book.test.js —— 错题本服务端逻辑单测（需求② 错题本优化）
 *
 * 覆盖 server/wrong-book.js：
 *   1. 分页参数校验边界（page=0/-1/非整数、pageSize=0/101/非整数、scope 非法）；
 *   2. 分页切片边界（第一页 / 最后一页 / 越界页 / pageSize 大于总数 / hasMore 计算）；
 *   3. scope 切分（mastery <100 待复习、≥100 已掌握，99/100 边界）；
 *   4. 返回形状：不带参数 = 老的 { pending, mastered, total }（向后兼容旧客户端）；
 *      带参数 = { items, page, pageSize, total, hasMore, scope, counts }；
 *   5. 艾宾浩斯算法与前端 utils/ebbinghaus.js **完全一致**（否则端上展示与后端状态会打架）。
 *
 * 运行：node tests/unit/wrong-book.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('错题本（server/wrong-book.js）');

const book = require('../../server/wrong-book');
const ebbinghaus = require('../../miniprogram/utils/ebbinghaus');

/** 造 n 条错题记录（mastery 从 0 递增，便于按范围挑已掌握） */
function makeRecords(n, options) {
  const opts = options || {};
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      recordId: 'r' + i,
      questionId: 'q' + i,
      mastery: opts.masteries ? opts.masteries[i - 1] : (i % 5 === 0 ? 100 : 20),
      nextReviewAt: new Date(2026, 8, 12),
      reviewCount: 1,
      wrongCount: 2,
    });
  }
  return out;
}

// ============ 1. 参数校验 ============
s.test('分页参数：缺省值（page=1 / pageSize=20 / scope=pending）', () => {
  const p = book.parsePaging({});
  s.assert.equal(p.ok, true);
  s.assert.equal(p.page, 1);
  s.assert.equal(p.pageSize, book.DEFAULT_PAGE_SIZE);
  s.assert.equal(p.scope, 'pending');
});

s.test('分页参数：page 非法被拦下（0 / 负数 / 小数 / 非数字）', () => {
  ['0', '-1', '1.5', 'abc'].forEach(function (v) {
    const p = book.parsePaging({ page: v });
    s.assert.equal(p.ok, false, 'page=' + v + ' 应被拒绝');
    s.assert.ok(!!p.message, '应给出错误原因');
  });
  s.assert.equal(book.parsePaging({ page: '1' }).ok, true);
  s.assert.equal(book.parsePaging({ page: '999' }).page, 999);
});

s.test('分页参数：pageSize 边界（1 与 100 合法，0/101 非法）', () => {
  s.assert.equal(book.parsePaging({ pageSize: '1' }).ok, true);
  s.assert.equal(book.parsePaging({ pageSize: '100' }).ok, true);
  s.assert.equal(book.parsePaging({ pageSize: book.MAX_PAGE_SIZE }).pageSize, 100);
  s.assert.equal(book.parsePaging({ pageSize: '0' }).ok, false);
  s.assert.equal(book.parsePaging({ pageSize: '101' }).ok, false);
  s.assert.equal(book.parsePaging({ pageSize: '3.5' }).ok, false);
});

s.test('分页参数：scope 只接受 pending/mastered/all', () => {
  ['pending', 'mastered', 'all'].forEach(function (v) {
    s.assert.equal(book.parsePaging({ scope: v }).ok, true, v + ' 应合法');
  });
  s.assert.equal(book.parsePaging({ scope: 'done' }).ok, false);
  s.assert.equal(book.parsePaging({ scope: '' }).ok, true, '空串按缺省处理');
});

// ============ 2. 分页切片 ============
s.test('分页切片：第一页 / 最后一页 / 越界页', () => {
  const list = makeRecords(25);
  const p1 = book.paginate(list, 1, 10);
  s.assert.equal(p1.items.length, 10);
  s.assert.equal(p1.total, 25);
  s.assert.equal(p1.hasMore, true);
  s.assert.equal(p1.items[0].recordId, 'r1');

  const p3 = book.paginate(list, 3, 10);
  s.assert.equal(p3.items.length, 5);
  s.assert.equal(p3.hasMore, false, '最后一页 hasMore 应为 false');
  s.assert.equal(p3.items[0].recordId, 'r21');

  const p9 = book.paginate(list, 9, 10);
  s.assert.equal(p9.items.length, 0, '越界页返回空数组而不是报错');
  s.assert.equal(p9.hasMore, false);
  s.assert.equal(p9.total, 25, '越界页仍返回总数，端上据此纠正页码');
});

s.test('分页切片：pageSize 大于总数时一页装下', () => {
  const list = makeRecords(3);
  const p = book.paginate(list, 1, 20);
  s.assert.equal(p.items.length, 3);
  s.assert.equal(p.hasMore, false);
});

s.test('分页切片：恰好整除时不出现多余空页', () => {
  const list = makeRecords(20);
  const p2 = book.paginate(list, 2, 10);
  s.assert.equal(p2.items.length, 10);
  s.assert.equal(p2.hasMore, false);
});

// ============ 3. scope 切分 ============
s.test('scope 切分：mastery <100 待复习、≥100 已掌握（99/100 边界）', () => {
  const list = [
    { recordId: 'a', mastery: 0 },
    { recordId: 'b', mastery: 99 },
    { recordId: 'c', mastery: 100 },
  ];
  const split = book.splitScope(list);
  s.assert.equal(split.pending.length, 2);
  s.assert.equal(split.mastered.length, 1);
  s.assert.equal(split.mastered[0].recordId, 'c');
  s.assert.equal(book.filterByScope(list, 'all').length, 3);
  s.assert.equal(book.filterByScope(list, 'pending').length, 2);
  s.assert.equal(book.filterByScope(list, 'mastered').length, 1);
});

s.test('scope 切分：mastery 缺失按 0（待复习）处理，不抛错', () => {
  const split = book.splitScope([{ recordId: 'x' }, {}]);
  s.assert.equal(split.pending.length, 2);
  s.assert.equal(split.mastered.length, 0);
  s.assert.equal(book.splitScope(null).pending.length, 0, '空输入安全返回');
});

// ============ 4. 返回形状 ============
s.test('老客户端（不带参数）返回旧形状 { pending, mastered, total }', () => {
  const list = makeRecords(5);   // 5 条里 r5 是 100 分
  s.assert.equal(book.isLegacyQuery({}), true);
  s.assert.equal(book.isLegacyQuery({ page: '1' }), false);
  s.assert.equal(book.isLegacyQuery({ scope: 'all' }), false);

  const legacy = book.buildListResponse(list, {});
  s.assert.equal(legacy.total, 5);
  s.assert.equal(legacy.pending.length, 4);
  s.assert.equal(legacy.mastered.length, 1);
  s.assert.equal(legacy.items, undefined, '老形状不应出现 items 字段');
});

s.test('新客户端（带参数）返回分页形状与三个口径计数', () => {
  const list = makeRecords(25);
  const res = book.buildListResponse(list, { scope: 'pending', page: '1', pageSize: '5' });
  s.assert.equal(res.page, 1);
  s.assert.equal(res.pageSize, 5);
  s.assert.equal(res.items.length, 5);
  s.assert.equal(res.total, 20, 'total 是 pending 口径的总数');
  s.assert.equal(res.hasMore, true);
  s.assert.equal(res.scope, 'pending');
  s.assert.equal(res.counts.total, 25);
  s.assert.equal(res.counts.pending, 20);
  s.assert.equal(res.counts.mastered, 5);
  s.assert.equal(res.items[0].mastery < 100, true, 'pending 口径不应混入已掌握');
});

s.test('新客户端：scope=mastered 只出已掌握，scope=all 出全部', () => {
  const list = makeRecords(25);
  const m = book.buildListResponse(list, { scope: 'mastered', page: '1', pageSize: '5' });
  s.assert.equal(m.total, 5);
  s.assert.equal(m.items.length, 5);
  m.items.forEach(function (it) {
    s.assert.equal(it.mastery >= 100, true, '已掌握口径应只含 mastery>=100');
  });

  const all = book.buildListResponse(list, { scope: 'all', page: '2', pageSize: '10' });
  s.assert.equal(all.total, 25);
  s.assert.equal(all.items.length, 10);
  s.assert.equal(all.items[0].recordId, 'r11');
});

s.test('新客户端：参数非法时返回 error（路由层转 4000）', () => {
  const res = book.buildListResponse(makeRecords(3), { page: '0' });
  s.assert.ok(!!res.error, '应带 error 字段');
  s.assert.equal(res.items, undefined);
});

// ============ 5. 两端口径一致性 ============
s.test('艾宾浩斯：服务端与前端算法完全一致（答对 6 次走完 1/2/4/7/15/30 天）', () => {
  const now = new Date(2026, 8, 12, 10, 0, 0);
  let serverState = { mastery: 0, reviewCount: 0 };
  let clientState = { mastery: 0, reviewCount: 0 };
  const expectDays = [1, 2, 4, 7, 15, 30];

  for (let i = 0; i < 6; i++) {
    const a = book.calculateNextReview(serverState.reviewCount, serverState.mastery, true, now);
    const b = ebbinghaus.calculateNextReview(serverState.reviewCount, serverState.mastery, true);
    s.assert.equal(a.mastery, b.mastery, '第 ' + (i + 1) + ' 次答对：熟练度应一致');
    s.assert.equal(a.reviewCount, b.reviewCount, '第 ' + (i + 1) + ' 次答对：复习次数应一致');
    const days = Math.round((a.nextReviewAt - now) / (24 * 60 * 60 * 1000));
    s.assert.equal(days, expectDays[i], '第 ' + (i + 1) + ' 次答对间隔应为 ' + expectDays[i] + ' 天');
    serverState = a;
    clientState = b;
  }
  s.assert.equal(serverState.mastery, 100, '连对 5 次后熟练度封顶 100');
  s.assert.equal(serverState.reviewCount, 6);
});

s.test('艾宾浩斯：答错重置复习次数、熟练度 -10 且不为负（两端一致）', () => {
  const now = new Date(2026, 8, 12, 10, 0, 0);
  const a = book.calculateNextReview(3, 50, false, now);
  const b = ebbinghaus.calculateNextReview(3, 50, false);
  s.assert.equal(a.mastery, b.mastery);
  s.assert.equal(a.reviewCount, 0);
  s.assert.equal(a.mastery, 40);
  s.assert.equal(Math.round((a.nextReviewAt - now) / (24 * 60 * 60 * 1000)), 1, '答错次日再复习');

  const floor = book.calculateNextReview(0, 5, false, now);
  s.assert.equal(floor.mastery, 0, '熟练度不能为负');
});

s.done();
