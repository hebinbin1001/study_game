/**
 * server/reward-stars.js —— 「非答题来源」的段位星汇总
 *
 * 段位星的完整口径（server/rank.js 的 doSyncRankStars）：
 *   答题去重星（scores，按 玩法×学段×题型×关卡 取历史最高）
 *   + 签到奖励（checkin_records 按连续天数重算）
 *   + **好友 PK 奖励（pk_matches，本文件）**
 *   + **赛季奖励（season_claims，本文件）**
 *
 * 为什么都从表重算而不是直接 `stars +=`：段位星每次通关都会整体重算覆盖，
 * 直接加会被下一次重算冲掉（签到那轮踩过这个坑）。
 *
 * 表还没建（生产 DDL 未执行）时静默返回 0 —— 新功能不可用不能拖垮段位主链路。
 */
'use strict';

var db = require('./db');

/** 一名用户通过好友 PK 累计获得的奖励星 */
async function pkRewardStars(openid) {
  if (!openid) return 0;
  try {
    var asChallenger = await db.PkMatch.findAll({
      where: { challengerOpenid: openid },
      attributes: ['challengerReward'],
      raw: true
    });
    var asOpponent = await db.PkMatch.findAll({
      where: { opponentOpenid: openid },
      attributes: ['opponentReward'],
      raw: true
    });
    var sum = 0;
    asChallenger.forEach(function (r) { sum += Math.max(0, parseInt(r.challengerReward, 10) || 0); });
    asOpponent.forEach(function (r) { sum += Math.max(0, parseInt(r.opponentReward, 10) || 0); });
    return sum;
  } catch (e) {
    return 0;
  }
}

/** 一名用户通过赛季奖励累计获得的奖励星 */
async function seasonRewardStars(openid) {
  if (!openid) return 0;
  try {
    var rows = await db.SeasonClaim.findAll({
      where: { openid: openid },
      attributes: ['stars'],
      raw: true
    });
    var sum = 0;
    rows.forEach(function (r) { sum += Math.max(0, parseInt(r.stars, 10) || 0); });
    return sum;
  } catch (e) {
    return 0;
  }
}

/** PK + 赛季奖励星合计（段位重算时一次取完） */
async function bonusRewardStars(openid) {
  var pk = await pkRewardStars(openid);
  var season = await seasonRewardStars(openid);
  return pk + season;
}

module.exports = {
  pkRewardStars: pkRewardStars,
  seasonRewardStars: seasonRewardStars,
  bonusRewardStars: bonusRewardStars
};
