/**
 * server/checkin-core.js —— 签到核心（2026-10-29 抽出）
 *
 * 为什么抽：签到有**两个入口**，而且实际在用的是第二个：
 *   · `POST /api/checkin` / `/api/checkin/auto` —— 手动签到、学习后自动打卡；
 *   · `POST /api/daily/answer` —— 答对每日一题（页面上的唯一打卡入口）。
 *
 * 两份实现此前各写各的（都算 streak、都调 syncRankStars、都算 rewardForStreak），
 * 差异只在返回字段。补签卡要挂在「真实签到成功」这一刻发，如果继续各写一份，
 * 改口径必然漏一处 —— 而漏的那处正是用户真正走的那条路。
 *
 * 口径不变（2026-09-13 重标）：
 *   · 每天 +1 星；连续天数**正好**踩到 3/7/14/30 时当天额外一次性 +2/5/8/15；
 *   · 段位星不直接 += ，而是由 rank.syncRankStars 按「答题去重星 + 签到累计奖励」现算
 *     （直接加会被下一次重算覆盖掉，等于白签）。
 *
 * 新增（2026-10-29）：连续满 7 天 → 发 1 张补签卡，见 server/makeup-card.js。
 * ⚠️ 只在真实签到时发；补签重算后**不**发（否则卡就成了零成本续命）。
 */
'use strict';

const { CheckinRecord, MakeupCard } = require('./db');
const { rewardForStreak } = require('./checkin-rewards');
const makeupRules = require('./makeup-card');
const rankRouter = require('./routes/rank');
const time = require('./beijing-time');

/**
 * 严格连续满 7 天时发一张补签卡。
 *
 * 唯一键 (openid, streakAt) 是「同一里程碑只发一次」的保证 —— 补签重算、
 * 接口重试、并发都不会多发。冲突不算错误，直接当作「已经发过」。
 *
 * @param {string} openid
 * @param {number} streak 连续签到天数
 * @returns {Promise<boolean>} 是否真的新发了一张
 */
async function grantCardIfNeeded(openid, streak) {
  if (!makeupRules.shouldGrant(streak)) return false;
  try {
    const [, created] = await MakeupCard.findOrCreate({
      where: { openid, streakAt: streak },
      defaults: { openid, streakAt: streak },
    });
    return !!created;
  } catch (e) {
    // 发卡失败不能影响签到本身（卡是附加奖励，签到记录才是主账）
    console.error('发补签卡失败（不影响签到）：', e && e.message);
    return false;
  }
}

/**
 * 执行今天的签到（幂等：今天已有记录就直接返回 already）。
 *
 * @param {string} openid
 * @returns {Promise<{already:boolean, date:string, streak:number, recordId?:string, rewardStars?:number, cardGranted?:boolean}>}
 */
async function doCheckin(openid) {
  const todayDate = time.todayKey();

  const existing = await CheckinRecord.findOne({
    where: { openid, date: todayDate },
  });
  if (existing) {
    return { already: true, date: todayDate, streak: existing.streak };
  }

  // 昨日记录 → 连续天数
  const yesterdayDate = time.dayKeyOffset(-1);
  const yesterdayRecord = await CheckinRecord.findOne({
    where: { openid, date: yesterdayDate },
  });

  let streak = 1;
  if (yesterdayRecord) streak = yesterdayRecord.streak + 1;

  const record = await CheckinRecord.create({ openid, date: todayDate, streak });

  const rewardStars = rewardForStreak(streak);
  // 严格连续 7 天 → +1 张补签卡（2026-10-29）
  const cardGranted = await grantCardIfNeeded(openid, streak);

  // 累加段位星数（无段位记录则建档）
  // ⚠️ 不直接 stars += 奖励：段位星是「答题去重星 + 签到累计奖励」现算
  //    （见 rank.syncRankStars）。直接加会被下一次通关重算覆盖掉，等于白签。
  try {
    await rankRouter.syncRankStars(openid);
  } catch (e) {
    console.error('签到后重算段位星失败（不影响签到本身）：', e && e.message);
  }

  return {
    recordId: record.recordId,
    date: todayDate,
    streak,
    rewardStars,
    cardGranted,
    already: false,
  };
}

module.exports = { doCheckin, grantCardIfNeeded };
