/** 错题本 / 题库两层信息架构与筛选护栏。 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('错题本与题库信息架构');

const wrongBook = require('../../server/wrong-book');
const view = require('../../miniprogram/utils/wrong-book-view');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
}

s.test('错题本支持题型筛选和三种排序', () => {
  const now = new Date().toISOString();
  const rows = [
    { question: { type: 'w1' }, wrongCount: 1, mastery: 20, nextReviewAt: now },
    { question: { type: 'w1' }, wrongCount: 5, mastery: 10, nextReviewAt: now },
    { question: { type: 'c1' }, wrongCount: 9, mastery: 0, nextReviewAt: now }
  ];
  const r = wrongBook.buildListResponse(rows, {
    page: 1, pageSize: 20, scope: 'pending', type: 'w1', sort: 'wrong'
  });
  s.assert.equal(r.total, 2);
  s.assert.equal(r.items[0].wrongCount, 5);
  s.assert.ok(r.counts.dueToday >= 1);
});

s.test('错题本请求地址带筛选与排序参数', () => {
  const url = view.listUrl('pending', 2, 20, 'apple', { type: 'w1', sort: 'mastery' });
  s.assert.contains(url, 'page=2');
  s.assert.contains(url, 'q=apple');
  s.assert.contains(url, 'type=w1');
  s.assert.contains(url, 'sort=mastery');
});

s.test('错题本卡片默认隐藏答案，并提供一行分段与筛选面板', () => {
  const wxml = read('miniprogram/pages/wrong-book/wrong-book.wxml');
  const js = read('miniprogram/pages/wrong-book/wrong-book.js');
  // 2026-10-25 信息架构重排：原来的「独立计划卡 + 3 tab + 常驻筛选行」合并成
  // 一行分段（统计与 tab 二合一），筛选收进顶栏 ⋯，主操作固定在底部。
  s.assert.contains(wxml, 'wb-chips');
  s.assert.contains(wxml, '复习中');
  s.assert.contains(wxml, 'wb-foot');
  s.assert.contains(wxml, 'filter-btn');
  s.assert.contains(wxml, 'wx:if="{{item.it.showAnswer}}"');
  s.assert.contains(wxml, '点击查看答案');
  s.assert.contains(wxml, 'filter-sheet');
  s.assert.contains(wxml, '按错误次数');
  s.assert.contains(js, 'searchOpen'); // 搜索默认收起，不再常驻占一行
  s.assert.contains(js, "due ? '?due=1' : ''");
});

s.test('整池复习可按今日到期过滤，没有到期题时回退薄弱题', () => {
  const review = read('miniprogram/pages/wrong-review/wrong-review.js');
  s.assert.contains(review, "this._dueOnly = String(opt.due || '') === '1'");
  s.assert.contains(review, 'self._dueOnly');
  s.assert.contains(review, 't <= now');
});

s.test('题库使用词库书架 → 详情两层，管理操作收进更多', () => {
  const js = read('miniprogram/pages/bank/bank.js');
  const wxml = read('miniprogram/pages/bank/bank.wxml');
  s.assert.contains(js, "viewMode: 'library'");
  s.assert.contains(js, '_buildLibraryCards');
  s.assert.contains(js, 'openLibrary');
  s.assert.contains(wxml, 'library-grid');
  s.assert.contains(wxml, 'library-card');
  s.assert.contains(wxml, 'detail-back');
  s.assert.contains(wxml, 'openItemMore');
  s.assert.ok(wxml.indexOf('class="bk-chip--bank') === -1, '详情页不应再平铺词库 chips');
});

s.test('题库详情层：控件压到两行，题型/排序收进筛选弹层', () => {
  const js = read('miniprogram/pages/bank/bank.js');
  const wxml = read('miniprogram/pages/bank/bank.wxml');

  // 搜索默认收起（点顶栏 🔍 才展开），不再常驻占一行
  s.assert.contains(js, 'searchOpen: false');
  s.assert.contains(js, 'toggleSearch');
  s.assert.contains(wxml, 'wx:if="{{searchOpen}}"');

  // 题型与排序收进 ⋯ 弹层
  s.assert.contains(js, 'openFilter');
  s.assert.contains(wxml, 'filter-sheet');
  s.assert.ok(wxml.indexOf('bk-sortbar') === -1, '排序不应再常驻占一整行');
  s.assert.ok(wxml.indexOf('bk-stat') === -1, '统计应并入标题副行，不再单独一行');

  // 筛选入口不能叫 .bk-mf —— E2E 断言 .bk-mf 恰好 3 个（掌握状态三档）
  s.assert.contains(wxml, 'bk-mf-filter');

  // 详情层要藏掉页级 .bk-head，否则会出现三层头部（原生导航栏 + bk-head + detail-head）
  s.assert.contains(wxml, 'wx:if="{{viewMode === \'library\'}}"');

  // 英文词 q === a 时只显示一次，避免「apple apple」
  s.assert.contains(wxml, 'item.a !== item.q');
});

s.done();
