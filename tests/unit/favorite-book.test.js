/**
 * favorite-book.test.js —— 生词本纯逻辑（2026-10-28）
 *
 * 为什么值得测：
 *   · 收藏是**幂等写**：唯一键是 (openid, word)，如果 word 在入库前没被规范化，
 *     「 apple」和「apple」会变成两条，用户看到生词本里同一个词出现两次；
 *   · 分页越界必须报错而不是悄悄纠正 —— 端上会以为翻到了第 999 页，
 *     实际拿回第一页，问题被藏住；
 *   · shapeRow 不能把 openid 带出去，这是别人的标识。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('生词本');

const fav = require('../../server/favorite-book');

s.test('normalizeItem：缺词条直接拒绝（空记录会在组局时出废题）', () => {
  ['', '   ', null, undefined].forEach((v) => {
    const r = fav.normalizeItem(v === null || v === undefined ? {} : { word: v });
    s.assert.equal(r.ok, false);
  });
  // 完全没有 body / body 里没有 word
  s.assert.equal(fav.normalizeItem({}).ok, false);
  s.assert.equal(fav.normalizeItem(null).ok, false);
});

s.test('normalizeItem：首尾空白与连续空白被压平（否则同一个词会存成两条）', () => {
  const r = fav.normalizeItem({ word: '  take   off  ' });
  s.assert.equal(r.ok, true);
  s.assert.equal(r.value.word, 'take off');
});

s.test('normalizeItem：超长按字符截断，不报错（用户不该因为音标太长而收藏失败）', () => {
  const longWord = 'a'.repeat(200);
  const longHint = '很'.repeat(300);
  const r = fav.normalizeItem({ word: longWord, hint: longHint, ipa: 'i'.repeat(200) });
  s.assert.equal(r.ok, true);
  s.assert.equal(r.value.word.length, fav.MAX_WORD);
  s.assert.equal(r.value.hint.length, fav.MAX_HINT);
  s.assert.equal(r.value.ipa.length, fav.MAX_IPA);
});

s.test('normalizeItem：来源只认白名单，其余落回 manual', () => {
  s.assert.equal(fav.normalizeItem({ word: 'a', source: 'wrong' }).value.source, 'wrong');
  s.assert.equal(fav.normalizeItem({ word: 'a', source: 'result' }).value.source, 'result');
  s.assert.equal(fav.normalizeItem({ word: 'a', source: 'preview' }).value.source, 'preview');
  s.assert.equal(fav.normalizeItem({ word: 'a', source: 'hack' }).value.source, 'manual');
  s.assert.equal(fav.normalizeItem({ word: 'a' }).value.source, 'manual');
});

s.test('parsePaging：不带参数 → 第 1 页 20 条', () => {
  const p = fav.parsePaging({});
  s.assert.equal(p.page, 1);
  s.assert.equal(p.pageSize, fav.DEFAULT_PAGE_SIZE);
  // 空串也当成没传（端上拼 query 时容易产生 page=）
  const q = fav.parsePaging({ page: '', pageSize: '' });
  s.assert.equal(q.page, 1);
});

s.test('parsePaging：越界一律返回 null（不悄悄纠正）', () => {
  s.assert.equal(fav.parsePaging({ page: 0, pageSize: 20 }), null);
  s.assert.equal(fav.parsePaging({ page: -1, pageSize: 20 }), null);
  s.assert.equal(fav.parsePaging({ page: 1, pageSize: 0 }), null);
  s.assert.equal(fav.parsePaging({ page: 1, pageSize: fav.MAX_PAGE_SIZE + 1 }), null);
  s.assert.equal(fav.parsePaging({ page: 'abc', pageSize: 20 }), null);
  s.assert.equal(fav.parsePaging({ page: 2, pageSize: fav.MAX_PAGE_SIZE }).page, 2);
});

s.test('buildListResponse：hasMore 的边界在 total == page*pageSize', () => {
  const a = fav.buildListResponse([], 20, 1, 20);
  s.assert.equal(a.hasMore, false); // 正好一页，没有下一页
  const b = fav.buildListResponse([], 21, 1, 20);
  s.assert.equal(b.hasMore, true);
  const c = fav.buildListResponse([], 40, 2, 20);
  s.assert.equal(c.hasMore, false); // 第 2 页刚好取完
  const d = fav.buildListResponse(null, 0, 1, 20);
  s.assert.deepEqual(d.items, []);
  s.assert.equal(d.total, 0);
});

s.test('shapeRow：不把 openid 与自增 id 带出去', () => {
  const row = {
    id: 12,
    openid: 'oABC',
    word: 'apple',
    grade: 'g3',
    type: 'w1',
    hint: '苹果',
    ipa: 'ˈæpl',
    source: 'result',
    updatedAt: new Date('2026-10-28T14:35:00.000Z'),
  };
  const out = fav.shapeRow(row);
  s.assert.equal(out.openid, undefined);
  s.assert.equal(out.id, undefined);
  s.assert.equal(out.word, 'apple');
  s.assert.equal(out.hint, '苹果');
  s.assert.equal(typeof out.at, 'number');
  s.assert.equal(out.at, new Date('2026-10-28T14:35:00.000Z').getTime());
});

s.test('shapeRow：空行不炸（表里有历史脏数据时页面还能渲染）', () => {
  const out = fav.shapeRow(null);
  s.assert.equal(out.word, '');
  s.assert.equal(out.at, 0);
});

s.done();
