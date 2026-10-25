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

s.test('错题本卡片默认隐藏答案，并提供计划卡和筛选面板', () => {
  const wxml = read('miniprogram/pages/wrong-book/wrong-book.wxml');
  const js = read('miniprogram/pages/wrong-book/wrong-book.js');
  s.assert.contains(wxml, 'plan-card');
  s.assert.contains(wxml, '今日复习计划');
  s.assert.contains(wxml, 'wx:if="{{item.it.showAnswer}}"');
  s.assert.contains(wxml, '点击查看答案');
  s.assert.contains(wxml, 'filter-sheet');
  s.assert.contains(wxml, '按错误次数');
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

s.done();
