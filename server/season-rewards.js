/**
 * server/season-rewards.js —— 赛季奖励档位（纯函数，可单测）
 *
 * 赛季榜排名 → 奖励星。档位刻意做窄（只有三档），避免「赛季奖励」变成第二个签到：
 *   · 赛季前三   +30 星
 *   · 赛季 4~10  +15 星
 *   · 活跃参与（赛季积分 ≥ 10）+5 星
 * 没进榜但本赛季完全没玩的玩家不发奖（避免空号白拿）。
 *
 * 奖励星不直接累加，而是落库到 season_claims，段位重算时按表求和（见 server/rank.js）。
 */
'use strict';

/** 活跃参与门槛（赛季积分） */
var ACTIVE_MIN_STARS = 10;

var TIERS = [
  { tier: 'top3', minRank: 1, maxRank: 3, stars: 30, label: '赛季前三' },
  { tier: 'top10', minRank: 4, maxRank: 10, stars: 15, label: '赛季前十' },
  { tier: 'active', minRank: 0, maxRank: 0, stars: 5, label: '活跃参与' }
];

/**
 * 按名次与赛季积分判定奖励档位。
 * @param {number} rank 赛季名次（1 起；0 或未知表示未进榜）
 * @param {number} seasonStars 赛季积分
 * @returns {{tier:string,stars:number,label:string}|null} 不够资格返回 null
 */
function tierOf(rank, seasonStars) {
  var r = parseInt(rank, 10) || 0;
  var s = parseInt(seasonStars, 10) || 0;
  if (r >= 1 && r <= 3) return { tier: 'top3', stars: 30, label: '赛季前三' };
  if (r >= 4 && r <= 10) return { tier: 'top10', stars: 15, label: '赛季前十' };
  if (s >= ACTIVE_MIN_STARS) return { tier: 'active', stars: 5, label: '活跃参与' };
  return null;
}

/** 档位列表（端上展示奖励说明用） */
function tiers() {
  return TIERS.map(function (t) { return Object.assign({}, t); });
}

module.exports = {
  ACTIVE_MIN_STARS: ACTIVE_MIN_STARS,
  TIERS: TIERS,
  tierOf: tierOf,
  tiers: tiers
};
