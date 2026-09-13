/**
 * 段位徽章（大段 8 枚，2026-09-13）
 *
 * 背景：排行榜每行原来只有头像 + 段位文字，用户 2026-09-13 反馈「名称前面留了两个空位，
 * 应该放头像和段位图标」。头像缺失时那个位置是空白的，段位也只有文字。
 *
 * 口径：**只用大段 8 枚徽章**（bronze/silver/gold/platinum/diamond/star/king/glory）——
 * 小级 72 张图一屏 100 行会触发 100 次云托管取图，真机会明显卡（二期若要小级再配懒加载）。
 *
 * 段位名可能带小级后缀（如「青铜 III」），所以按**前缀**匹配；「荣耀王者」必须排在「王者」前面，
 * 否则会被「王者」先吃掉。
 */
'use strict';

var art = require('./art');

var TIERS = [
  { key: 'glory', name: '荣耀王者' },
  { key: 'king', name: '王者' },
  { key: 'star', name: '星耀' },
  { key: 'diamond', name: '钻石' },
  { key: 'platinum', name: '铂金' },
  { key: 'gold', name: '黄金' },
  { key: 'silver', name: '白银' },
  { key: 'bronze', name: '青铜' }
];

/** 段位名 → 大段 key（认不出返回空串，调用方回退成不显示徽章） */
function keyOf(rankName) {
  var s = String(rankName || '').trim();
  if (!s) return '';
  for (var i = 0; i < TIERS.length; i++) {
    if (s.indexOf(TIERS[i].name) === 0) return TIERS[i].key;
  }
  return '';
}

/** 段位名 → 徽章图 URL（走云托管；认不出返回空串） */
function badgeUrl(rankName) {
  var key = keyOf(rankName);
  if (!key) return '';
  return art.artUrl('/assets/ranks/' + key + '.png');
}

module.exports = {
  TIERS: TIERS,
  keyOf: keyOf,
  badgeUrl: badgeUrl
};
