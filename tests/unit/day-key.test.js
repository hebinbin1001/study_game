/**
 * day-key.test.js —— 端上东八区日期与后端口径一致
 *
 * 每日挑战的「今天」在端上用于显示与种子兜底，服务端用于落库与榜单。
 * 两边差一天就会出现「页面显示 10-08、提交后落到 10-07」这类错乱。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('端上东八区日期');

const front = require('../../miniprogram/utils/day-key');
const back = require('../../server/beijing-time');

s.test('与后端 todayKey 逐样本一致', () => {
  const samples = [
    '2026-10-08T00:30:00+08:00',
    '2026-10-08T23:30:00+08:00',
    '2026-10-09T00:00:00+08:00',
    '2026-01-05T12:00:00+08:00',
    '2026-02-28T16:00:00Z'
  ];
  samples.forEach(function (t) {
    s.assert.equal(front.todayKey(t), back.todayKey(t), '样本 ' + t);
  });
});

s.test('凌晨边界：北京时间 0 点整就翻到新的一天', () => {
  s.assert.equal(front.todayKey('2026-10-08T23:59:59+08:00'), '2026-10-08');
  s.assert.equal(front.todayKey('2026-10-09T00:00:00+08:00'), '2026-10-09');
  // UTC 深夜 = 北京早上，必须算「今天」而不是 UTC 的昨天
  s.assert.equal(front.todayKey('2026-10-07T16:00:00Z'), '2026-10-08');
});

s.test('默认参数返回当天的 key（格式正确）', () => {
  s.assert.match(front.todayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

s.done();
