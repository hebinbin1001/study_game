const express = require("express");
const { CheckinRecord, MilestoneClaim, UserAvatar, Avatar } = require("../db");
// 签到核心（2026-10-29 抽出）：与 routes/checkin.js 共用一份实现。
// 每日一题才是页面上真正的打卡入口，所以补签卡的发卡逻辑必须挂在这里。
// 送星口径（每天 1 星 + 连续 3/7/14/30 当天额外 2/5/8/15）在 checkin-rewards.js，
// 由核心统一调用 —— 本文件不再自己算。
const { doCheckin } = require("../checkin-core");
const time = require("../beijing-time");
const { isMissingTable } = require("../table-missing");

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
    const todayDate = time.todayKey();

    const todayRec = await CheckinRecord.findOne({ where: { openid, date: todayDate } });
    const streak = todayRec ? todayRec.streak : 0;
    const answeredToday = !!todayRec;

    let claims = [];
    try {
      claims = await MilestoneClaim.findAll({ where: { openid } });
    } catch (err) {
      // 里程碑表尚未迁移时，普通签到仍应可用；部署后补表会自动恢复皮肤进度。
      if (!isMissingTable(err)) console.error("读取里程碑领取记录失败：", err);
    }
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

    const c = await doCheckin(openid);
    if (c.already) {
      return res.send({ code: 0, data: { ok: true, already: true, streak: c.streak || 0, rewards: [] } });
    }
    // 领取已达成里程碑皮肤；皮肤补发失败不能让已经成功的签到回滚成 500。
    let rewards = [];
    try {
      rewards = await claimMilestoneSkins(openid, c.streak);
    } catch (err) {
      if (!isMissingTable(err)) console.error("发放里程碑皮肤失败：", err);
    }

    res.send({
      code: 0,
      data: {
        ok: true,
        streak: c.streak,
        rewardStars: c.rewardStars || 0,
        // 严格连续满 7 天时发了补签卡（2026-10-29），端上据此提示一句
        cardGranted: !!c.cardGranted,
        milestones: rewards,
      },
    });
  } catch (err) {
    console.error("POST /api/daily/answer 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
