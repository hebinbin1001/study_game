/**
 * tests/unit/track-events.test.js —— 埋点事件校验 / 规范化 / 北京时间分桶
 *
 * 埋点接口是「对外可调」的（只要经网关就有 openid），一旦校验写漏，
 * 脏数据会直接污染留存/漏斗报表且不可逆，所以这些规则全部用单测钉死：
 *   · 客户端只能上报 4 个事件（d1_return 服务端派生，不允许伪造留存）；
 *   · 字符串截断、数值夹取、玩法 key 正则校验；
 *   · 时间超出 ±3 天一律用服务端时间（离线队列可能隔天补发）；
 *   · 北京时间自然日分桶（容器是 UTC，00:00~08:00 容易算错天）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('埋点事件（track-events）');

const track = require('../../server/track-events');

s.test('客户端事件白名单：只收 visit / game_start / game_end / share_open', () => {
  s.assert.deepEqual(track.CLIENT_EVENTS, ['visit', 'game_start', 'game_end', 'share_open']);
  track.CLIENT_EVENTS.forEach((name) => {
    s.assert.ok(track.normalize({ event: name }), name + ' 应被接受');
  });
  s.assert.equal(track.normalize({ event: 'd1_return' }), null, 'd1_return 不允许客户端上报');
  s.assert.equal(track.normalize({ event: 'game_win' }), null, '未知事件必须拒绝');
  s.assert.equal(track.normalize(null), null);
  s.assert.equal(track.normalize('visit'), null);
});

s.test('字段截断与夹取：坏数据进不了库', () => {
  const ev = track.normalize({
    event: 'game_end',
    at: Date.now(),
    game_type: 'x'.repeat(80),
    grade: 'g'.repeat(80),
    level: -5,
    stars: 9,
    win: 5,
    scene: 's'.repeat(80),
    payload: 'p'.repeat(300)
  });
  s.assert.equal(ev.game_type.length, 24);
  s.assert.equal(ev.grade.length, 16);
  s.assert.equal(ev.level, 0, '负关卡夹到 0');
  s.assert.equal(ev.stars, 3, '星级超过 3 夹到 3');
  s.assert.equal(ev.win, 1);
  s.assert.equal(ev.scene.length, 32);
  s.assert.equal(ev.payload.length, 200);
});

s.test('玩法 key 必须是小写 snake_case，否则置空（而不是整条丢弃）', () => {
  const bad = track.normalize({ event: 'game_end', game_type: 'Word-Build', level: 1 });
  s.assert.equal(bad.game_type, '', '非法玩法 key 置空');
  const ok = track.normalize({ event: 'game_end', game_type: 'word_build', level: 3 });
  s.assert.equal(ok.game_type, 'word_build');
});

s.test('客户端时间只作参考：偏差超 ±3 天改用服务端时间', () => {
  const now = new Date('2026-11-11T12:00:00Z').getTime();
  const old = track.normalize({ event: 'visit', at: now - 10 * 24 * 3600 * 1000 }, now);
  s.assert.equal(old.at, now, '10 天前的客户端时间应被忽略');
  const fresh = track.normalize({ event: 'visit', at: now - 60 * 1000 }, now);
  s.assert.equal(fresh.at, now - 60 * 1000, '1 分钟前的时间应保留');
});

s.test('北京时间自然日：UTC 16:30 属于北京次日', () => {
  s.assert.equal(track.dayOf(new Date('2026-11-11T16:30:00Z').getTime()), '2026-11-12');
  s.assert.equal(track.dayOf(new Date('2026-11-11T15:30:00Z').getTime()), '2026-11-11');
});

s.test('批次上限 20 条，非法条目丢弃、合法条目保留', () => {
  const many = [];
  for (let i = 0; i < 30; i++) many.push({ event: 'game_end', game_type: 'snake', level: i });
  s.assert.equal(track.normalizeBatch({ events: many }).length, 20);
  const mixed = track.normalizeBatch({ events: [{ event: 'visit' }, { event: 'bad' }, null, 'x'] });
  s.assert.equal(mixed.length, 1);
  s.assert.equal(mixed[0].event, 'visit');
  s.assert.equal(track.normalizeBatch({}).length, 0);
  s.assert.equal(track.normalizeBatch(null).length, 0);
});

s.test('次日回访判定：昨天来过且今天没记过才补一条', () => {
  s.assert.equal(track.shouldEmitD1(true, false), true);
  s.assert.equal(track.shouldEmitD1(true, true), false);
  s.assert.equal(track.shouldEmitD1(false, false), false);
});

s.test('cleanText 去掉控制字符与首尾空白', () => {
  s.assert.equal(track.cleanText('  \u0000a\nb  ', 10), 'ab');
  s.assert.equal(track.cleanText(undefined, 10), '');
});

s.done();
