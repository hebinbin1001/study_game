const express = require("express");
const { CheckinRecord, MilestoneClaim, UserAvatar, Avatar } = require("../db");
// 签到奖励口径（2026-09-13 重标）：每天 1 星 + 里程碑当天一次性额外 2/5/8/15，见 server/checkin-rewards.js
const { rewardForStreak } = require("../checkin-rewards");
const rankRouter = require("./rank");

const router = express.Router();

/**
 * 每日一题连续里程碑（轨道 B，双轨中的「里程碑皮肤」）
 * 达成连续天数 → 解锁限定皮肤（仅皮肤；轨道 A 的送星由 checkin.js 的 doCheckin 负责）
 */
const MILESTONE_SKINS = [
  { day: 30, avatarId: "milestone_30" },
  { day: 60, avatarId: "milestone_60" },
  { day: 100, avatarId: "milestone_100" },
  { day: 250, avatarId: "milestone_250" },
  { day: 365, avatarId: "milestone_365" },
];

/** 复用签到核心：完成每日一题 → 今日签到（轨道 A 送星，规则与现状 checkin 一致） */
async function doDailyCheckin(openid) {
  const today = new Date();
  const todayDate = today.toISOString().split("T")[0];
  const existing = await CheckinRecord.findOne({ where: { openid, date: todayDate } });
  if (existing) return { already: true };

  // 昨日 → 连续天数
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().split("T")[0];
  const yRec = await CheckinRecord.findOne({ where: { openid, date: yesterdayDate } });
  let streak = 1;
  if (yRec) streak = yRec.streak + 1;

  const record = await CheckinRecord.create({ openid, date: todayDate, streak });

  // 轨道 A：送星（2026-09-13 重标：每天 1 星 + 连续 3/7/14/30 天当天额外一次性送星）
  // ⚠️ 不再直接 stars += 奖励：段位星现在是「答题去重星 + 签到累计奖励」现算，
  //    直接加会被下一次通关/签到的重算覆盖掉，等于白签（见 rank.syncRankStars）。
  const rewardStars = rewardForStreak(streak);
  try {
    await rankRouter.syncRankStars(openid);
  } catch (e) {
    console.error("每日一题打卡后重算段位星失败（不影响打卡本身）：", e && e.message);
  }

  return { recordId: record.recordId, date: todayDate, streak, rewardStars, already: false };
}

/** 检查并发放已达成的里程碑皮肤（幂等：已领取的跳过） */
async function claimMilestoneSkins(openid, streak) {
  const results = [];
  for (const m of MILESTONE_SKINS) {
    if (streak < m.day) continue;
    const claimed = await MilestoneClaim.findOne({ where: { openid, day: m.day } });
    if (claimed) continue;
    // 皮肤存在性校验（种子缺失则跳过，不影响主流程）
    const avatar = await Avatar.findOne({ where: { avatarId: m.avatarId } });
    if (!avatar) continue;
    await MilestoneClaim.create({ openid, day: m.day, reward: "skin", avatarId: m.avatarId, stars: 0 });
    await UserAvatar.findOrCreate({
      where: { openid, avatarId: m.avatarId },
      defaults: { openid, avatarId: m.avatarId, currentUsed: false },
    });
    results.push({ day: m.day, avatarId: m.avatarId, skinName: avatar.name });
  }
  return results;
}

/** GET /api/daily/status —— 每日一题 + 里程碑进度 */
router.get("/status", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const today = new Date();
    const todayDate = today.toISOString().split("T")[0];

    const todayRec = await CheckinRecord.findOne({ where: { openid, date: todayDate } });
    const streak = todayRec ? todayRec.streak : 0;
    const answeredToday = !!todayRec;

    const claims = await MilestoneClaim.findAll({ where: { openid } });
    const claimedSet = new Set(claims.map((c) => c.day));

    const milestones = MILESTONE_SKINS.map((m) => ({
      day: m.day,
      avatarId: m.avatarId,
      reached: streak >= m.day,
      claimed: claimedSet.has(m.day),
    }));

    res.send({ code: 0, data: { answeredToday, streak, milestones } });
  } catch (err) {
    console.error("GET /api/daily/status 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/daily/answer —— 提交每日一题作答结果
 * body: { correct: boolean }
 * - correct=true：视为完成今日每日一题 → 签到（轨道A送星）+ 发放达成里程碑皮肤（轨道B）
 * - correct=false：不打卡（可重试直到答对）
 */
router.post("/answer", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const correct = !!(req.body && req.body.correct);
    if (!correct) {
      return res.send({ code: 0, data: { ok: false, message: "答错了，再试一次吧" } });
    }

    const c = await doDailyCheckin(openid);
    if (c.already) {
      return res.send({ code: 0, data: { ok: true, already: true, streak: c.streak || 0, rewards: [] } });
    }
    // 领取已达成里程碑皮肤
    const rewards = await claimMilestoneSkins(openid, c.streak);

    res.send({
      code: 0,
      data: {
        ok: true,
        streak: c.streak,
        rewardStars: c.rewardStars || 0,
        milestones: rewards,
      },
    });
  } catch (err) {
    console.error("POST /api/daily/answer 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
