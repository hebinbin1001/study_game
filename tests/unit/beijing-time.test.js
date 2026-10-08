/**
 * beijing-time.test.js —— 每日挑战 / 赛季的东八区时间口径
 *
 * 为什么值得测：容器时区是 UTC，而「每日」「赛季」都是按北京时间切分的。
 * 差 8 小时意味着北京时间 00:00~08:00 的操作会被算到前一天/上一季，
 * 玩家会看到「刚打过的每日挑战显示没打过」「赛季还没切换」这类错乱。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('东八区时间与赛季切分');

const T = require('../../server/beijing-time');

s.test('todayKey：北京时间凌晨算「今天」，不是 UTC 的昨天', () => {
  // 北京时间 2026-10-08 00:30 = UTC 2026-10-07 16:30
  s.assert.equal(T.todayKey('2026-10-08T00:30:00+08:00'), '2026-10-08');
  // 北京时间 2026-10-08 23:30 = UTC 2026-10-08 15:30
  s.assert.equal(T.todayKey('2026-10-08T23:30:00+08:00'), '2026-10-08');
  // 北京时间 2026-10-09 00:00 整 → 已经是 10-09
  s.assert.equal(T.todayKey('2026-10-09T00:00:00+08:00'), '2026-10-09');
});

s.test('todayKey：月份/日期补零', () => {
  s.assert.equal(T.todayKey('2026-01-05T12:00:00+08:00'), '2026-01-05');
});

s.test('seasonOf：自然双月一季（1-2 / 3-4 / … / 11-12）', () => {
  s.assert.equal(T.seasonOf('2026-01-15T12:00:00+08:00').key, '2026-S1');
  s.assert.equal(T.seasonOf('2026-02-28T23:00:00+08:00').key, '2026-S1');
  s.assert.equal(T.seasonOf('2026-03-01T00:00:00+08:00').key, '2026-S2');
  s.assert.equal(T.seasonOf('2026-10-08T12:00:00+08:00').key, '2026-S5');
  s.assert.equal(T.seasonOf('2026-12-31T23:59:00+08:00').key, '2026-S6');
});

s.test('seasonOf：边界按北京时间零点切，不受容器 UTC 影响', () => {
  // 北京时间 2026-03-01 00:00 → UTC 2026-02-28 16:00，应属 S2
  s.assert.equal(T.seasonOf('2026-02-28T16:00:00Z').key, '2026-S2');
  // 北京时间 2026-02-28 23:59 → 属 S1
  s.assert.equal(T.seasonOf('2026-02-28T23:59:00+08:00').key, '2026-S1');
});

s.test('赛季起止时间：S1 起点 = 北京 1 月 1 日 0 点', () => {
  const s1 = T.seasonAt(2026, 0);
  s.assert.equal(s1.start.toISOString(), '2025-12-31T16:00:00.000Z');
  s.assert.equal(s1.endExclusive.toISOString(), '2026-02-28T16:00:00.000Z');
});

s.test('seasonOfKey：合法 key 往返一致，非法 key 返回 null', () => {
  const s5 = T.seasonOfKey('2026-S5');
  s.assert.equal(s5.key, '2026-S5');
  s.assert.equal(s5.index, 5);
  s.assert.equal(T.seasonOfKey('2026-S7'), null);
  s.assert.equal(T.seasonOfKey('abc'), null);
  s.assert.equal(T.isSeasonKey('2026-S1'), true);
  s.assert.equal(T.isSeasonKey('2026-1'), false);
});

s.test('prevSeasonOf：跨年时要回退到上一年 S6', () => {
  s.assert.equal(T.prevSeasonOf('2026-01-15T12:00:00+08:00').key, '2025-S6');
  s.assert.equal(T.prevSeasonOf('2026-10-08T12:00:00+08:00').key, '2026-S4');
});

s.test('daysLeftInSeason：接近月底时剩余 1~62 天之间', () => {
  const d = T.daysLeftInSeason('2026-10-08T12:00:00+08:00');
  // 10-08 → 10-31 结束，约 23 天
  s.assert.true(d >= 20 && d <= 24, '实际 ' + d);
  // 赛季最后一天只剩 1 天
  const last = T.daysLeftInSeason('2026-10-31T13:00:00+08:00');
  s.assert.true(last >= 1 && last <= 2, '实际 ' + last);
});

s.done();
