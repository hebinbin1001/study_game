/**
 * seed-parity.test.js —— 前后端随机种子算法一致性
 *
 * 「每日挑战赛」「好友 PK」都要求服务端与客户端算出**同一套题**：
 * 两边各有一份 FNV-1a 实现（服务端镜像里不一定带 miniprogram/ 目录，
 * 不能跨目录 require），必须逐样本比对防漂移。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('前后端种子一致性');

const front = require('../../miniprogram/utils/rng');
const back = require('../../server/seed');

s.test('hashSeed：10 组样本逐位一致', () => {
  const samples = [
    '', 'a', 'daily:2026-10-08:g3', 'pk:oYK123:1759900000000',
    'challenge:kg:1', '中文测试', 'line:g5:match:7', 'z'.repeat(200),
    '0', 'A-B_c.d'
  ];
  samples.forEach(function (t) {
    s.assert.equal(back.hashSeed(t), front.hashSeed(t), '样本「' + t + '」');
  });
});

s.test('hashSeed：返回 32 位无符号整数', () => {
  ['', 'x', '词力战士'].forEach(function (t) {
    const v = back.hashSeed(t);
    s.assert.true(v >= 0 && v <= 4294967295, t + ' → ' + v);
    s.assert.equal(v, Math.floor(v));
  });
});

s.test('dailySeed：同一天+同一学段稳定，不同天/学段不同', () => {
  const a = back.dailySeed('2026-10-08', 'g3');
  s.assert.equal(a, back.dailySeed('2026-10-08', 'g3'));
  s.assert.notEqual(a, back.dailySeed('2026-10-09', 'g3'));
  s.assert.notEqual(a, back.dailySeed('2026-10-08', 'g4'));
});

s.test('pkSeed：不同时间戳得到不同种子（同一战帖双方共用）', () => {
  const a = back.pkSeed('openid123', 1000);
  const b = back.pkSeed('openid123', 2000);
  s.assert.notEqual(a, b);
  s.assert.equal(a, back.pkSeed('openid123', 1000));
});

s.done();
