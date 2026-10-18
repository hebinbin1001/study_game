/**
 * utils/boss-ladder.js —— 「学段 → 镇守 Boss」映射（UI 重做一期 · 主题驱动）
 *
 * 为什么需要：挑战主线每个学段的第 30 关是 Boss 关（utils/challenge.js 的 BOSS_LEVEL），
 * 但 Boss **长什么样**此前没有映射 —— 引擎只是拿玩家当前装备的怪兽皮肤当 Boss 画。
 * 首页「Boss 预告卡」要告诉玩家「下一个要打谁」，就必须有这份表。
 *
 * 口径来源：docs/UI重做-美术素材需求.md §二（14 学段 ↔ Boss 全量映射，用户 2026-10-17 确认）。
 *   · 现有 6 款立绘（赤鬼将军/翡翠龙王/机械领主/熔岩巨兽/深海梦魇/像素吞噬者）已注册在 utils/skins.js；
 *   · 缺的 8 款已在美术需求文档里给了造型与配色，**图到货后只需在 skins.js 注册 avatarId**，
 *     本表不用改 —— image 是运行时从 skins.getSkinImage() 取的，取不到就用 emoji 占位。
 *
 * 兜底行为：id 未注册（图还没画/还没进包）→ image 为空串，模板回退 emoji，
 * 不会出现裂图或空白（与项目其它立绘的兜底约定一致）。
 */

'use strict';

var skins = require('./skins');

// 学段 key 与 constants.GRADES 一一对应
var GRADE_BOSS = {
  kg:      { id: 'boss_mallow_king',    name: '棉花糖大魔王', emoji: '🍬' },
  g1:      { id: 'boss_block_overlord', name: '积木魔王',     emoji: '🧱' },
  g2:      { id: 'boss_candy_witch',    name: '糖果女巫',     emoji: '🍭' },
  g3:      { id: 'boss_puppet_mage',    name: '木偶戏法师',   emoji: '🎭' },
  g4:      { id: 'boss_crimson_ogre',   name: '赤鬼将军',     emoji: '👹' },
  g5:      { id: 'boss_sand_pharaoh',   name: '沙尘法老',     emoji: '🏺' },
  g6:      { id: 'boss_jade_dragon',    name: '翡翠龙王',     emoji: '🐲' },
  g7:      { id: 'boss_mech_lord',      name: '机械领主',     emoji: '🤖' },
  g8:      { id: 'boss_storm_eagle',    name: '雷霆巨鹰',     emoji: '🦅' },
  g9:      { id: 'boss_magma_titan',    name: '熔岩巨兽',     emoji: '🌋' },
  g10:     { id: 'boss_abyss_kraken',   name: '深海梦魇',     emoji: '🦑' },
  g11:     { id: 'boss_void_weaver',    name: '虚空织梦者',   emoji: '🌌' },
  g12:     { id: 'boss_pixel_devourer', name: '像素吞噬者',   emoji: '👾' },
  college: { id: 'boss_dark_sage',      name: '暗蚀大贤者',   emoji: '📕' }
};

// 兜底：学段 key 不认识时用幼儿园那只（软萌、不吓人）
var DEFAULT_BOSS = GRADE_BOSS.kg;

/**
 * 取某学段的镇守 Boss 展示信息。
 * @param {string} grade 学段 key（kg / g1 … g12 / college）
 * @returns {{ id: string, name: string, emoji: string, image: string, hasArt: boolean }}
 *   image 为空串 = 立绘未到货，调用方回退 emoji
 */
function bossOf(grade) {
  var b = GRADE_BOSS[grade] || DEFAULT_BOSS;
  var image = skins.getSkinImage(b.id) || '';
  var r = skins.SKIN_RENDER[b.id];
  return {
    id: b.id,
    name: b.name,
    // 立绘注册了就用它自带的 emoji，否则用本表的占位 emoji
    emoji: (r && r.emoji) || b.emoji,
    image: image,
    hasArt: !!image
  };
}

module.exports = {
  GRADE_BOSS: GRADE_BOSS,
  bossOf: bossOf
};
