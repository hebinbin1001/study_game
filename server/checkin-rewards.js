/**
 * server/checkin-rewards.js —— 签到奖励口径（2026-09-13 重标）
 *
 * 为什么重标：用户发现「段位太容易满级」。查完发现签到奖励是大头 ——
 *   原值 每天 10 星 / 3 天 30 / 7 天 100 / 14 天 200 / 30 天 500，
 *   一个月满勤 ≈ **1090 星**，而新曲线满级只要 **947 星** → 光签到一个月就满级 ✗✗
 *
 * 新口径（答题是主产出，签到只是「长期习惯」的小额奖励）：
 *   · 每天签到 **+1 星**（天天有，稳定但不夸张）；
 *   · 连续天数**正好**踩到 3 / 7 / 14 / 30 天时，当天**额外**一次性 +2 / +5 / +8 / +15 星。
 *   → 一个月满勤 = 30×1 + (2+5+8+15) = **60 星**（约为满级的 6%）；
 *     一年满勤 ≈ 365 + 约 12×(2+5+8+15) = **约 725 星**（坚持一年的长期回报）。
 *
 * 注意「额外一次性」：里程碑只在踩线当天加成，之后每天仍只 +1 星，
 *   所以不会像「按档取最大值」那样连签期间天天吃高档位（旧写法一个月会给到 188 星）。
 *
 * 纯函数，可单测；checkin 路由与段位星重算共用这一份规则。
 */
'use strict';

/** 每日基础奖励（星/天） */
const DAILY = 1;
/** 连续里程碑：连续天数「正好」等于 key 时，当天额外一次性奖励 */
const MILESTONE = { 3: 2, 7: 5, 14: 8, 30: 15 };

/**
 * 某天签到应得的星数 = 每日基础 + 该连续天数是否踩中里程碑（一次性额外）。
 * @param {number} streak 连续签到天数（≥1）
 */
function rewardForStreak(streak) {
  const s = parseInt(streak, 10);
  const day = s > 0 ? s : 1;          // 0 / 负数 / 非法值按第 1 天兜底
  return DAILY + (MILESTONE[day] || 0);
}

/**
 * 一名用户的历史签到累计奖励（按每条记录的连续天数重算，不依赖改表）。
 * @param {Array<Object>} records checkin_records 行（含 streak）
 */
function totalBonus(records) {
  return (records || []).reduce((sum, r) => sum + rewardForStreak(r && r.streak), 0);
}

module.exports = { DAILY, MILESTONE, rewardForStreak, totalBonus };
