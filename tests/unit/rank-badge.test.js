/**
 * rank-badge.test.js —— 段位徽章映射（排行榜用，2026-09-13）
 *
 * 用户反馈：排行榜每行名称前留了两个位置，应该放头像和段位图标。
 * 头像缺失用昵称首字兜底；段位用**大段 8 枚**徽章（小级 72 张一屏 100 行会让真机很卡）。
 *
 * 覆盖：
 *   1. 八个大段名都能映射到对应 key；
 *   2. 带小级后缀（如「青铜 III」）按前缀匹配；
 *   3. 「荣耀王者」不能被「王者」抢先匹配；
 *   4. 空值/未知段位返回空串（调用方回退成不显示徽章，而不是显示碎图）；
 *   5. badgeUrl 指向云托管的 /assets/ranks/<key>.png。
 *
 * 运行：node tests/unit/rank-badge.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('段位徽章映射（排行榜）');

const rankBadge = require('../../miniprogram/utils/rank-badge');

s.test('九个大段名 → 对应 key', () => {
  const pairs = [
    ['青铜', 'bronze'], ['白银', 'silver'], ['黄金', 'gold'], ['铂金', 'platinum'],
    ['钻石', 'diamond'], ['星耀', 'star'], ['王者', 'king'], ['荣耀王者', 'glory'],
    ['学神', 'sage']   // 2026-10-08 新增的最高段
  ];
  pairs.forEach(function (p) {
    s.assert.equal(rankBadge.keyOf(p[0]), p[1], p[0] + ' 应映射到 ' + p[1]);
  });
});

s.test('带小级后缀按前缀匹配', () => {
  s.assert.equal(rankBadge.keyOf('青铜 III'), 'bronze');
  s.assert.equal(rankBadge.keyOf('铂金IX'), 'platinum');
  s.assert.equal(rankBadge.keyOf(' 钻石 '), 'diamond');
});

s.test('「荣耀王者」优先于「王者」，且学神在最前', () => {
  s.assert.equal(rankBadge.keyOf('荣耀王者'), 'glory');
  s.assert.equal(rankBadge.keyOf('王者'), 'king');
  // TIERS 是降序数组，keyOf 按前缀匹配 → 长名字必须排在它的前缀前面
  s.assert.equal(rankBadge.TIERS[0].key, 'sage', '学神是最高段，排最前');
  const gloryIdx = rankBadge.TIERS.map(function (t) { return t.key; }).indexOf('glory');
  const kingIdx = rankBadge.TIERS.map(function (t) { return t.key; }).indexOf('king');
  s.assert.ok(gloryIdx < kingIdx, '荣耀王者必须排在王者前面，否则会被「王者」先吃掉');
});

s.test('空值 / 未知段位返回空串（不显示碎图）', () => {
  s.assert.equal(rankBadge.keyOf(''), '');
  s.assert.equal(rankBadge.keyOf(null), '');
  s.assert.equal(rankBadge.keyOf('传奇'), '');
  s.assert.equal(rankBadge.badgeUrl('传奇'), '');
  s.assert.equal(rankBadge.badgeUrl(''), '');
});

s.test('badgeUrl 指向云托管的 /assets/ranks/<key>.png', () => {
  const url = rankBadge.badgeUrl('青铜');
  s.assert.contains(url, '/assets/ranks/bronze.png');
  s.assert.contains(url, 'https://');
  s.assert.contains(rankBadge.badgeUrl('荣耀王者'), '/assets/ranks/glory.png');
});

s.test('徽章文件确实存在（大段图都在 art/ranks 里）', () => {
  const fs = require('fs');
  const path = require('path');
  rankBadge.TIERS.forEach(function (t) {
    const p = path.join(__dirname, '..', '..', 'art', 'ranks', t.key + '.png');
    s.assert.true(fs.existsSync(p), t.key + '.png 不存在（云托管 /assets/ranks 会取不到图）');
  });
});
