/**
 * utils/skins.js —— 皮肤渲染清单（真图优先，emoji 兜底）
 *
 * 职责：将后端「形象/皮肤」的 avatarId 映射为可渲染的 emoji + 主色，
 *   供游戏 Canvas（game/renderer.js）与形象选择页（pages/avatar）统一引用，
 *   避免前端重复定义皮肤素材。
 *
 * 背景：
 *   - 皮肤列表与解锁逻辑由后端管理（server/routes/avatar.js + server/seeders/avatar-seed.js）。
 *   - **2026-09-12 战士皮肤美术到货**（24 套，见 docs/美术素材需求与豆包提示词.md §4）：
 *       端上图片 = /assets/skins/skin-*.png（已按展示尺寸 256px 压缩，整包只增 ~0.24MB）。
 *       本模块是「avatarId → 图片 + 主色 + emoji」的唯一映射表：
 *         · 图片优先：能拿到 image 就画图（Canvas drawImage / <image>）；
 *         · 兜底：图没加载出来 / 老版本包 → 用 emoji + 主色，不裂图、不空白。
 *   - 旧的 4 个战士 id（warrior_01~04）与 5 个里程碑 id（milestone_30~365）**保留不变** ——
 *     已经拥有它们的玩家不会丢皮肤，只是现在换成了对应的新美术图。
 *   - 怪兽仍是 emoji（怪兽美术未交付），主色照常参与对局渲染。
 *   - 未匹配 / 离线时回退到默认皮肤（classic）。
 *
 * 关联需求：战士皮肤 + boss 皮肤（emoji 占位）
 */

'use strict';

// ============ 皮肤渲染映射（avatarId → 图片 + emoji + 主色） ============
// 键与 server/seeders/avatar-seed.js 的 avatarId 一一对应。
const SKIN_RENDER = {
  // —— 战士：旧 id（保留兼容，指向对应的新美术图） ——
  warrior_01: { emoji: '🔫', color: '#8D9AA5', image: '/assets/skins/skin-recruit.png' },        // 布衣学徒（默认）
  warrior_02: { emoji: '🐰', color: '#F7B6C8', image: '/assets/skins/skin-bunny-scholar.png' },  // 兔耳小学士
  warrior_03: { emoji: '🎖', color: '#F5C33B', image: '/assets/skins/skin-gold-commander.png' }, // 金甲统帅
  warrior_04: { emoji: '🦁', color: '#FF6B6B', image: '/assets/skins/skin-king-lion.png' },      // 狮王

  // —— 战士：新增 15 套（美术到货，按 manifest.csv 的解锁条件） ——
  'skin-page-soldier': { emoji: '📜', color: '#EADFC8', image: '/assets/skins/skin-page-soldier.png' },     // 免费
  'skin-lion-cub': { emoji: '🦁', color: '#F2A03D', image: '/assets/skins/skin-lion-cub.png' },             // 免费
  'skin-dino-rookie': { emoji: '🦖', color: '#7BD389', image: '/assets/skins/skin-dino-rookie.png' },       // 60 星
  'skin-fox-scout': { emoji: '🦊', color: '#F2793D', image: '/assets/skins/skin-fox-scout.png' },           // 90 星
  'skin-eagle-archer': { emoji: '🦅', color: '#4FA3E3', image: '/assets/skins/skin-eagle-archer.png' },     // 140 星
  'skin-bear-guard': { emoji: '🐻', color: '#A9744F', image: '/assets/skins/skin-bear-guard.png' },         // 200 星
  'skin-owl-sage': { emoji: '🦉', color: '#7C6BD6', image: '/assets/skins/skin-owl-sage.png' },             // 260 星
  'skin-wolf-ranger': { emoji: '🐺', color: '#6B7A8F', image: '/assets/skins/skin-wolf-ranger.png' },       // 330 星
  'skin-bronze-warrior': { emoji: '🛡', color: '#C8794B', image: '/assets/skins/skin-bronze-warrior.png' }, // 青铜段位
  'skin-silver-blade': { emoji: '⚔️', color: '#C9D2DC', image: '/assets/skins/skin-silver-blade.png' },     // 白银段位
  'skin-platinum-warden': { emoji: '💠', color: '#8FE3D2', image: '/assets/skins/skin-platinum-warden.png' }, // 铂金段位
  'skin-diamond-knight': { emoji: '💎', color: '#63B3FF', image: '/assets/skins/skin-diamond-knight.png' }, // 钻石段位
  'skin-star-marshal': { emoji: '🌟', color: '#A77BFF', image: '/assets/skins/skin-star-marshal.png' },     // 星耀段位
  'skin-glory-phoenix': { emoji: '🔥', color: '#FF2D6F', image: '/assets/skins/skin-glory-phoenix.png' },   // 荣耀王者
  'skin-scholar-king': { emoji: '👑', color: '#5A6BD6', image: '/assets/skins/skin-scholar-king.png' },     // 学段全三星

  // —— 战士：5 个里程碑旧 id（保留兼容，指向新美术图） ——
  milestone_30:  { emoji: '🌱', color: '#7BD389', image: '/assets/skins/skin-sprout-apprentice.png' },
  milestone_60:  { emoji: '☁️', color: '#8FC8F0', image: '/assets/skins/skin-cloud-rider.png' },
  milestone_100: { emoji: '⚡', color: '#F5D03B', image: '/assets/skins/skin-thunder-herald.png' },
  milestone_250: { emoji: '🐚', color: '#3FB6C9', image: '/assets/skins/skin-ocean-guard.png' },
  milestone_365: { emoji: '🪄', color: '#E8B84B', image: '/assets/skins/skin-legend-sage.png' },

  // —— 怪兽皮肤（2026-09-12 美术到货：真图；emoji 保留作加载失败时的兜底） ——
  // 对局里由 renderer.drawMonster 画在题目卡片**后面**（只露头肩，见 monsterArtLayout）；
  // 形象页按 image 正常展示整张图。
  monster_01: { emoji: '👾', color: '#ff8fae', image: '/assets/skins/monster_01.png' },  // 小怪兽（默认）
  monster_02: { emoji: '🔥', color: '#ff5a5a', image: '/assets/skins/monster_02.png' },  // 火焰怪兽
  monster_03: { emoji: '❄️', color: '#7ec4ff', image: '/assets/skins/monster_03.png' },  // 冰霜怪兽
  monster_04: { emoji: '⚡', color: '#ffc24d', image: '/assets/skins/monster_04.png' }   // 雷霆巨兽
};

// 默认（classic）皮肤：离线 / 未选择 / 未知 id 时的回退
const DEFAULT_WARRIOR = {
  id: 'warrior_01', emoji: '🔫', color: '#8D9AA5',
  image: '/assets/skins/skin-recruit.png'
};
const DEFAULT_MONSTER = { id: 'monster_01', emoji: '👾', color: '#ff8fae' };

// ============ 本地皮肤全量清单（离线兜底） ============
// 与 server/seeders/avatar-seed.js 一一对应；后端不可达（离线/无 openid）时，
// 形象页据此兜底展示，避免皮肤系统因无网而空白。
// 注意：解锁条件（stars/rank 阈值）与后端保持一致，改动需同步两端。
const LOCAL_SKINS = [
  // —— 战士（24 套；旧 id 保留，其余为美术到货后新增，解锁条件照 manifest.csv） ——
  { avatarId: 'warrior_01', name: '布衣学徒',   type: 'warrior', rarity: 'common', unlockType: 'free',  unlockValue: 0,  emoji: '🔫', color: '#8D9AA5', image: '/assets/skins/skin-recruit.png' },
  { avatarId: 'skin-page-soldier', name: '书页小兵', type: 'warrior', rarity: 'common', unlockType: 'free', unlockValue: 0, emoji: '📜', color: '#EADFC8', image: '/assets/skins/skin-page-soldier.png' },
  { avatarId: 'skin-lion-cub', name: '小狮子学徒', type: 'warrior', rarity: 'common', unlockType: 'free', unlockValue: 0, emoji: '🦁', color: '#F2A03D', image: '/assets/skins/skin-lion-cub.png' },
  { avatarId: 'warrior_02', name: '兔耳小学士', type: 'warrior', rarity: 'rare',   unlockType: 'stars', unlockValue: 30, emoji: '🐰', color: '#F7B6C8', image: '/assets/skins/skin-bunny-scholar.png' },
  { avatarId: 'skin-dino-rookie', name: '小恐龙新兵', type: 'warrior', rarity: 'rare', unlockType: 'stars', unlockValue: 60, emoji: '🦖', color: '#7BD389', image: '/assets/skins/skin-dino-rookie.png' },
  { avatarId: 'skin-fox-scout', name: '狐狸侦察兵', type: 'warrior', rarity: 'rare', unlockType: 'stars', unlockValue: 90, emoji: '🦊', color: '#F2793D', image: '/assets/skins/skin-fox-scout.png' },
  { avatarId: 'skin-eagle-archer', name: '鹰羽弓手', type: 'warrior', rarity: 'epic', unlockType: 'stars', unlockValue: 140, emoji: '🦅', color: '#4FA3E3', image: '/assets/skins/skin-eagle-archer.png' },
  { avatarId: 'skin-bear-guard', name: '棕熊重卫', type: 'warrior', rarity: 'epic', unlockType: 'stars', unlockValue: 200, emoji: '🐻', color: '#A9744F', image: '/assets/skins/skin-bear-guard.png' },
  { avatarId: 'skin-owl-sage', name: '猫头鹰贤者', type: 'warrior', rarity: 'epic', unlockType: 'stars', unlockValue: 260, emoji: '🦉', color: '#7C6BD6', image: '/assets/skins/skin-owl-sage.png' },
  { avatarId: 'skin-wolf-ranger', name: '狼牙游侠', type: 'warrior', rarity: 'legend', unlockType: 'stars', unlockValue: 330, emoji: '🐺', color: '#6B7A8F', image: '/assets/skins/skin-wolf-ranger.png' },
  { avatarId: 'skin-bronze-warrior', name: '青铜战士', type: 'warrior', rarity: 'rare', unlockType: 'rank', unlockValue: 1, emoji: '🛡', color: '#C8794B', image: '/assets/skins/skin-bronze-warrior.png' },
  { avatarId: 'skin-silver-blade', name: '白银卫士', type: 'warrior', rarity: 'rare', unlockType: 'rank', unlockValue: 2, emoji: '⚔️', color: '#C9D2DC', image: '/assets/skins/skin-silver-blade.png' },
  { avatarId: 'warrior_03', name: '金甲统帅',   type: 'warrior', rarity: 'epic',   unlockType: 'rank',  unlockValue: 3,  emoji: '🎖', color: '#F5C33B', image: '/assets/skins/skin-gold-commander.png' },
  { avatarId: 'skin-platinum-warden', name: '铂金守卫', type: 'warrior', rarity: 'epic', unlockType: 'rank', unlockValue: 4, emoji: '💠', color: '#8FE3D2', image: '/assets/skins/skin-platinum-warden.png' },
  { avatarId: 'skin-diamond-knight', name: '钻石骑士', type: 'warrior', rarity: 'legend', unlockType: 'rank', unlockValue: 5, emoji: '💎', color: '#63B3FF', image: '/assets/skins/skin-diamond-knight.png' },
  { avatarId: 'skin-star-marshal', name: '星耀星使', type: 'warrior', rarity: 'legend', unlockType: 'rank', unlockValue: 6, emoji: '🌟', color: '#A77BFF', image: '/assets/skins/skin-star-marshal.png' },
  { avatarId: 'warrior_04', name: '狮王战士',   type: 'warrior', rarity: 'legend', unlockType: 'rank',  unlockValue: 7,  emoji: '🦁', color: '#FF6B6B', image: '/assets/skins/skin-king-lion.png' },
  { avatarId: 'skin-glory-phoenix', name: '荣耀凤凰', type: 'warrior', rarity: 'legend', unlockType: 'rank', unlockValue: 8, emoji: '🔥', color: '#FF2D6F', image: '/assets/skins/skin-glory-phoenix.png' },
  { avatarId: 'skin-scholar-king', name: '学者之王', type: 'warrior', rarity: 'legend', unlockType: 'level', unlockValue: 30, emoji: '👑', color: '#5A6BD6', image: '/assets/skins/skin-scholar-king.png' },
  // —— 怪兽（4 套，2026-09-12 美术到货：真图 + emoji 兜底） ——
  // 真图由 `e2e/prepare-monsters.py` 从豆包出的白底拼图「切图 + 抠白底 + 压到 340px」生成，
  // 只保留「头 + 上半身」——对局里下半身会被题目卡片挡住（见 game/renderer.js 的 monsterArtLayout）。
  { avatarId: 'monster_01', name: '小怪兽',   type: 'monster', rarity: 'common', unlockType: 'free',  unlockValue: 0,  emoji: '👾', color: '#ff8fae', image: '/assets/skins/monster_01.png' },
  { avatarId: 'monster_02', name: '火焰怪兽', type: 'monster', rarity: 'rare',   unlockType: 'stars', unlockValue: 50, emoji: '🔥', color: '#ff5a5a', image: '/assets/skins/monster_02.png' },
  { avatarId: 'monster_03', name: '冰霜怪兽', type: 'monster', rarity: 'epic',   unlockType: 'rank',  unlockValue: 4,  emoji: '❄️', color: '#7ec4ff', image: '/assets/skins/monster_03.png' },
  { avatarId: 'monster_04', name: '雷霆巨兽', type: 'monster', rarity: 'legend', unlockType: 'rank',  unlockValue: 6,  emoji: '⚡', color: '#ffc24d', image: '/assets/skins/monster_04.png' },
  // —— 每日一题连续签到里程碑（B2；解锁由后端每日一题发放，图形用新美术） ——
  { avatarId: 'milestone_30',  name: '🌱 萌芽学徒 · 连续 30 天',  type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 30,  emoji: '🌱', color: '#7BD389', image: '/assets/skins/skin-sprout-apprentice.png' },
  { avatarId: 'milestone_60',  name: '☁️ 云骑 · 连续 60 天',      type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 60,  emoji: '☁️', color: '#8FC8F0', image: '/assets/skins/skin-cloud-rider.png' },
  { avatarId: 'milestone_100', name: '⚡ 雷使 · 连续 100 天',     type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 100, emoji: '⚡', color: '#F5D03B', image: '/assets/skins/skin-thunder-herald.png' },
  { avatarId: 'milestone_250', name: '🐚 海卫 · 连续 250 天',     type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 250, emoji: '🐚', color: '#3FB6C9', image: '/assets/skins/skin-ocean-guard.png' },
  { avatarId: 'milestone_365', name: '🪄 传说贤者 · 连续 365 天', type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 365, emoji: '🪄', color: '#E8B84B', image: '/assets/skins/skin-legend-sage.png' }
];

// ============ 稀有度元数据（供形象页 UI 展示） ============
const RARITY = {
  common: { label: '普通', color: '#8a9bb5' },
  rare:   { label: '稀有', color: '#4cc9f0' },
  epic:   { label: '史诗', color: '#b79bff' },
  legend: { label: '传说', color: '#ffc24d' }
};

// ============ 查询函数 ============

/**
 * 按 avatarId 取皮肤渲染信息（图片 + emoji + 主色）。
 * 未匹配返回默认怪兽渲染（安全的通用回退）。
 * @param {string} avatarId 如 'warrior_02' / 'monster_03'
 * @returns {{ emoji: string, color: string, image?: string }}
 */
function getSkinRender(avatarId) {
  const r = SKIN_RENDER[avatarId];
  return r || DEFAULT_MONSTER;
}

/**
 * 按 avatarId 取战士皮肤渲染；id 不是战士类或未匹配时回退默认战士。
 * 「战士类」= warrior_* / milestone_* / skin-*（新增美术 id）。
 * @param {string} avatarId
 * @returns {{ id: string, emoji: string, color: string, image?: string }}
 */
function getWarriorSkin(avatarId) {
  const r = SKIN_RENDER[avatarId];
  const isWarrior = !!r && (avatarId.indexOf('warrior_') === 0
    || avatarId.indexOf('milestone_') === 0
    || avatarId.indexOf('skin-') === 0);
  if (isWarrior) return { id: avatarId, emoji: r.emoji, color: r.color, image: r.image };
  return DEFAULT_WARRIOR;
}

/**
 * 按 avatarId 取怪兽皮肤渲染；id 不是怪兽类或未匹配时回退默认怪兽。
 * @param {string} avatarId
 * @returns {{ id: string, emoji: string, color: string }}
 */
function getMonsterSkin(avatarId) {
  const r = SKIN_RENDER[avatarId];
  if (r && avatarId.indexOf('monster_') === 0) {
    // 注意：这里必须把 image 一起带出去 —— 引擎是拿 G.monsterSkin.image 去预加载真图的，
    // 漏掉这个字段会「静默退回 emoji」（2026-09-12 接入怪兽美术时真踩过，端到端当场抓到）。
    return { id: avatarId, emoji: r.emoji, color: r.color, image: r.image };
  }
  return DEFAULT_MONSTER;
}

/**
 * 取稀有度展示信息（label + 颜色），未知稀有度回退 common。
 * @param {string} rarity 'common'|'rare'|'epic'|'legend'
 * @returns {{ label: string, color: string }}
 */
function getRarity(rarity) {
  return RARITY[rarity] || RARITY.common;
}

/**
 * 取皮肤图片路径（没有图/未知 id 返回空串 → 调用方回退 emoji）。
 * @param {string} avatarId
 * @returns {string}
 */
function getSkinImage(avatarId) {
  const r = SKIN_RENDER[avatarId];
  return (r && r.image) || '';
}

module.exports = {
  SKIN_RENDER,
  LOCAL_SKINS,
  DEFAULT_WARRIOR,
  DEFAULT_MONSTER,
  RARITY,
  getSkinRender,
  getWarriorSkin,
  getMonsterSkin,
  getRarity,
  getSkinImage
};
