/**
 * 每日一题 → 签到 → 签到日历的回归护栏。
 *
 * 线上曾出现两个问题：
 *   1. milestone_claims 表没进生产补表清单，/api/daily/status 直接 500；
 *   2. 前端提交失败时仍本地标记“已签到”，用户因此没有重试入口。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('每日一题签到链路');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '../..', rel), 'utf8');
}

s.test('生产补表包含 milestone_claims', () => {
  const ensure = require('../../server/ensure-tables');
  const names = ensure.TABLES.map(function (t) { return t.name; });
  s.assert.ok(names.indexOf('milestone_claims') >= 0);
});

s.test('每日一题与签到统一使用北京时间自然日', () => {
  const daily = read('server/routes/daily.js');
  const checkin = read('server/routes/checkin.js');
  [daily, checkin].forEach(function (src) {
    s.assert.contains(src, 'time.todayKey()');
    s.assert.contains(src, 'time.dayKeyOffset(-1)');
    s.assert.doesNotMatch(src, /toISOString\(\)\.split\(["']T["']\)/);
  });
});

s.test('提交失败不能伪造成已签到，并且提供重试入口', () => {
  const js = read('miniprogram/pages/daily-question/daily-question.js');
  const wxml = read('miniprogram/pages/daily-question/daily-question.wxml');
  s.assert.contains(js, 'submitFailed');
  s.assert.contains(js, 'retrySubmit');
  s.assert.contains(js, 'submitting');
  s.assert.contains(js, 'answered: false');
  s.assert.contains(wxml, '重新提交签到');
  s.assert.contains(wxml, '查看签到日历');
});

s.test('签到页面按今日日期显示已签到状态', () => {
  const js = read('miniprogram/pages/checkin/checkin.js');
  s.assert.contains(js, "request.get('/api/checkin?month=' + month)");
  s.assert.contains(js, "request.get('/api/daily/status')");
  s.assert.contains(js, 'checkedIn: !!signedDates[today]');
});

s.done();
