/**
 * utils/skins.js —— 皮肤渲染清单（emoji 占位）
 *
 * 职责：将后端「形象/皮肤」的 avatarId 映射为可渲染的 emoji + 主色，
 *   供游戏 Canvas（game/renderer.js）与形象选择页（pages/avatar）统一引用，
 *   避免前端重复定义皮肤素材。
 *
 * 背景：
 *   - 皮肤列表与解锁逻辑由后端管理（server/routes/avatar.js + server/seeders/avatar-seed.js），
 *     内置 8 个形象（4 战士 + 4 怪兽），按 free/stars/rank 解锁。
 *   - 后端 icon 为 /assets/avatars/*.png，但美术素材暂缺，故本模块用 emoji 占位
 *     （后续替换正式美术图时仅需改本文件，不改调用方）。
 *   - 未匹配 / 离线时回退到默认皮肤（classic）。
 *
 * 关联需求：战士皮肤 + boss 皮肤（emoji 占位）
 */

'use strict';

// ============ 皮肤渲染映射（avatarId → emoji + 主色） ============
// 键与 server/seeders/avatar-seed.js 的 avatarId 一一对应。
const SKIN_RENDER = {
  // 战士皮肤
  warrior_01: { emoji: '🔫', color: '#4cc9f0' },  // 初学者战士（默认）
  warrior_02: { emoji: '🐱', color: '#ff6b9d' },  // 学徒战士
  warrior_03: { emoji: '🦖', color: '#7fd8a0' },  // 精英战士
  warrior_04: { emoji: '🐲', color: '#ff5a5a' },  // 传说战士

  // 怪兽皮肤
  monster_01: { emoji: '👾', color: '#ff8fae' },  // 小怪兽（默认）
  monster_02: { emoji: '🔥', color: '#ff5a5a' },  // 火焰怪兽
  monster_03: { emoji: '❄️', color: '#7ec4ff' },  // 冰霜怪兽
  monster_04: { emoji: '⚡', color: '#ffc24d' },  // 雷霆巨兽

  // 每日一题连续里程碑皮肤（B2，unlockType=milestone）
  milestone_30:  { emoji: '🐲', color: '#ff8f00' },
  milestone_60:  { emoji: '🦄', color: '#b79bff' },
  milestone_100: { emoji: '👑', color: '#ffc24d' },
  milestone_250: { emoji: '⚡', color: '#4cc9f0' },
  milestone_365: { emoji: '🎖', color: '#ff5a5a' }
};

// 默认（classic）皮肤：离线 / 未选择 / 未知 id 时的回退
const DEFAULT_WARRIOR = { id: 'warrior_01', emoji: '🔫', color: '#4cc9f0' };
const DEFAULT_MONSTER = { id: 'monster_01', emoji: '👾', color: '#ff8fae' };

// ============ 本地皮肤全量清单（离线兜底） ============
// 与 server/seeders/avatar-seed.js 一一对应；后端不可达（离线/无 openid）时，
// 形象页据此兜底展示，避免皮肤系统因无网而空白。
// 注意：解锁条件（stars/rank 阈值）与后端保持一致，改动需同步两端。
const LOCAL_SKINS = [
  { avatarId: 'warrior_01', name: '初学者战士', type: 'warrior', rarity: 'common', unlockType: 'free',  unlockValue: 0,  emoji: '🔫', color: '#4cc9f0' },
  { avatarId: 'warrior_02', name: '学徒战士',   type: 'warrior', rarity: 'rare',   unlockType: 'stars', unlockValue: 30, emoji: '🐱', color: '#ff6b9d' },
  { avatarId: 'warrior_03', name: '精英战士',   type: 'warrior', rarity: 'epic',   unlockType: 'rank',  unlockValue: 3,  emoji: '🦖', color: '#7fd8a0' },
  { avatarId: 'warrior_04', name: '传说战士',   type: 'warrior', rarity: 'legend', unlockType: 'rank',  unlockValue: 7,  emoji: '🐲', color: '#ff5a5a' },
  { avatarId: 'monster_01', name: '小怪兽',     type: 'monster', rarity: 'common', unlockType: 'free',  unlockValue: 0,  emoji: '👾', color: '#ff8fae' },
  { avatarId: 'monster_02', name: '火焰怪兽',   type: 'monster', rarity: 'rare',   unlockType: 'stars', unlockValue: 50, emoji: '🔥', color: '#ff5a5a' },
  { avatarId: 'monster_03', name: '冰霜怪兽',   type: 'monster', rarity: 'epic',   unlockType: 'rank',  unlockValue: 4,  emoji: '❄️', color: '#7ec4ff' },
  { avatarId: 'monster_04', name: '雷霆巨兽',   type: 'monster', rarity: 'legend', unlockType: 'rank',  unlockValue: 6,  emoji: '⚡', color: '#ffc24d' },
  // 每日一题连续里程碑皮肤（B2；本地兜底展示，解锁由后端每日一题发放）
  { avatarId: 'milestone_30',  name: '🐲 神龙 · 连续 30 天', type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 30,  emoji: '🐲', color: '#ff8f00' },
  { avatarId: 'milestone_60',  name: '🦄 独角兽 · 连续 60 天', type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 60,  emoji: '🦄', color: '#b79bff' },
  { avatarId: 'milestone_100', name: '👑 皇冠 · 连续 100 天', type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 100, emoji: '👑', color: '#ffc24d' },
  { avatarId: 'milestone_250', name: '⚡ 闪电 · 连续 250 天', type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 250, emoji: '⚡', color: '#4cc9f0' },
  { avatarId: 'milestone_365', name: '🎖 年度之星 · 连续 365 天', type: 'warrior', rarity: 'legend', unlockType: 'milestone', unlockValue: 365, emoji: '🎖', color: '#ff5a5a' }
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
 * 按 avatarId 取皮肤渲染信息（emoji + 主色）。
 * 未匹配返回默认怪兽渲染（安全的通用回退）。
 * @param {string} avatarId 如 'warrior_02' / 'monster_03'
 * @returns {{ emoji: string, color: string }}
 */
function getSkinRender(avatarId) {
  const r = SKIN_RENDER[avatarId];
  return r || DEFAULT_MONSTER;
}

/**
 * 按 avatarId 取战士皮肤渲染；id 不是战士类或未匹配时回退默认战士。
 * @param {string} avatarId
 * @returns {{ id: string, emoji: string, color: string }}
 */
function getWarriorSkin(avatarId) {
  const r = SKIN_RENDER[avatarId];
  if (r && avatarId.indexOf('warrior_') === 0) {
    return { id: avatarId, emoji: r.emoji, color: r.color };
  }
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
    return { id: avatarId, emoji: r.emoji, color: r.color };
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

module.exports = {
  SKIN_RENDER,
  LOCAL_SKINS,
  DEFAULT_WARRIOR,
  DEFAULT_MONSTER,
  RARITY,
  getSkinRender,
  getWarriorSkin,
  getMonsterSkin,
  getRarity
};