/**
 * rel-time.test.js —— 相对时间文案（管理端用户列表用）
 *
 * 背景（2026-09-29）：管理端原来直接显示服务端返回的 ISO 时间戳，运营看不出
 * 「这人是新用户还是三天没来了」。改成相对文案后，有两个坑必须挡住：
 *   1. iOS 的 `new Date('2026-09-29 03:50:00')` 返回 Invalid Date（空格要换 T）；
 *   2. 服务端时钟可能比手机快一点 → 不能显示「-3 分钟前」。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('相对时间文案');

const rt = require('../../miniprogram/utils/rel-time');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// 基准时刻：2026-09-29T04:00:00Z（北京时间 12:00），避免依赖运行机器时区
const NOW = Date.UTC(2026, 8, 29, 4, 0, 0);

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

/** 把时间戳格式化成「本机时区」的 'YYYY-MM-DD HH:mm:ss'（模拟服务端返回的写法） */
function localStamp(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
    + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
}

s.test('一分钟内 = 刚刚（包含「正好现在」）', () => {
  s.assert.equal(rt.relTime(NOW, NOW), '刚刚');
  s.assert.equal(rt.relTime(NOW - 59 * 1000, NOW), '刚刚');
  s.assert.equal(rt.relTime(NOW - MIN, NOW), '1 分钟前');
});

s.test('分钟 / 小时 / 天 三档边界', () => {
  s.assert.equal(rt.relTime(NOW - 59 * MIN, NOW), '59 分钟前');
  s.assert.equal(rt.relTime(NOW - HOUR, NOW), '1 小时前');
  s.assert.equal(rt.relTime(NOW - 23 * HOUR, NOW), '23 小时前');
  s.assert.equal(rt.relTime(NOW - DAY, NOW), '1 天前');
  s.assert.equal(rt.relTime(NOW - 29 * DAY, NOW), '29 天前');
});

s.test('超过 30 天改用日期（不显示「412 天前」）', () => {
  s.assert.equal(rt.relTime(NOW - 40 * DAY, NOW), '08-20');                     // 同年 → MM-DD
  s.assert.equal(rt.relTime(Date.UTC(2025, 11, 1, 4, 0, 0), NOW), '2025-12-01'); // 跨年 → 带年份
});

s.test('时钟偏差：服务端时间比手机快 → 显示「刚刚」而不是负数', () => {
  s.assert.equal(rt.relTime(NOW + 5 * MIN, NOW), '刚刚');
});

s.test('iOS 不认的空格写法（服务端常见格式）也能解析', () => {
  s.assert.equal(rt.relTime(localStamp(NOW - 10 * MIN), NOW), '10 分钟前');
});

s.test('ISO 字符串（Sequelize 默认输出）能正确解析', () => {
  s.assert.equal(rt.relTime(new Date(NOW - 3 * HOUR).toISOString(), NOW), '3 小时前');
});

s.test('无效输入返回空串（页面据此不显示这一项）', () => {
  s.assert.equal(rt.relTime('', NOW), '');
  s.assert.equal(rt.relTime(null, NOW), '');
  s.assert.equal(rt.relTime(undefined, NOW), '');
  s.assert.equal(rt.relTime('不是时间', NOW), '');
});

s.test('toMs：秒级与毫秒级时间戳都认，Date 对象直接用', () => {
  s.assert.equal(rt.toMs(1700000000), 1700000000 * 1000);
  s.assert.equal(rt.toMs(1700000000000), 1700000000000);
  const d = new Date(NOW);
  s.assert.equal(rt.toMs(d), NOW);
});

s.done();
