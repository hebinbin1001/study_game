const express = require("express");
const { Op } = require("sequelize");
const { CheckinRecord, RankRecord, User, Score } = require("../db");
// 签到奖励口径（2026-09-13 重标）：每天 1 星 + 里程碑 2/5/8/15，见 server/checkin-rewards.js
const { rewardForStreak } = require("../checkin-rewards");
const rankRouter = require("./rank");

const router = express.Router();

/**
 * 执行签到（POST / 与 POST /auto 共用）。
 * @param {string} openid
 * @returns {Promise<Object>} { already } 或 { recordId,date,streak,rewardStars,already:false }
 */
async function doCheckin(openid) {
  const today = new Date();
  const todayDate = today.toISOString().split("T")[0];

  const existing = await CheckinRecord.findOne({
    where: { openid, date: todayDate },
  });
  if (existing) return { already: true };

  // 昨日记录 → 连续天数
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayDate = yesterday.toISOString().split("T")[0];
  const yesterdayRecord = await CheckinRecord.findOne({
    where: { openid, date: yesterdayDate },
  });

  let streak = 1;
  if (yesterdayRecord) streak = yesterdayRecord.streak + 1;

  const record = await CheckinRecord.create({ openid, date: todayDate, streak });

  // 奖励星数（连续 3/7/14/30 递增）
  // 2026-09-13 重标：旧值（10/30/100/200/500）一个月就能签到满级，改为小额长期奖励
  const rewardStars = rewardForStreak(streak);

  // 累加段位星数（无段位记录则建档）
  // ⚠️ 不再直接 stars += 奖励：段位星现在是「答题去重星 + 签到累计奖励」现算
  //    （见 rank.syncRankStars）。直接加会被下一次通关重算覆盖掉，等于白签。
  try {
    await rankRouter.syncRankStars(openid);
  } catch (e) {
    console.error("签到后重算段位星失败（不影响签到本身）：", e && e.message);
  }

  return {
    recordId: record.recordId,
    date: todayDate,
    streak,
    rewardStars,
    already: false,
  };
}

/**
 * POST /api/checkin —— 手动签到
 */
router.post("/", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const r = await doCheckin(openid);
    if (r.already) {
      return res.send({ code: 4000, data: null, message: "今日已签到" });
    }
    res.send({ code: 0, data: r });
  } catch (err) {
    console.error("POST /api/checkin 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/checkin/auto —— 学习自动打卡（M6-E）
 * 今日已产生成绩（完成过一次闯关）才视为达成学习目标，自动签到；未学习不打卡。
 * 返回：{ checkedIn: false, reason: 'no_learn' } / { checkedIn:true, already? / 签到结果 }
 */
router.post("/auto", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const user = await User.findOne({ where: { openid } });
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }

    // 今日是否完成学习（存在成绩记录）
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayScore = await Score.count({
      where: { user_id: user.id, createdAt: { [Op.gte]: startOfToday } },
    });
    if (todayScore < 1) {
      return res.send({ code: 0, data: { checkedIn: false, reason: "no_learn" } });
    }

    const r = await doCheckin(openid);
    if (r.already) {
      return res.send({ code: 0, data: { checkedIn: true, already: true } });
    }
    res.send({ code: 0, data: Object.assign({ checkedIn: true }, r) });
  } catch (err) {
    console.error("POST /api/checkin/auto 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/checkin —— 获取签到记录
 */
router.get("/", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }

    const { month } = req.query; // YYYY-MM
    const where = { openid };

    if (month) {
      const startDate = new Date(month + "-01");
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      where.date = {
        [Op.gte]: startDate,
        [Op.lt]: endDate,
      };
    }

    const records = await CheckinRecord.findAll({
      where,
      order: [["date", "ASC"]],
    });

    // 当前连续天数：今天已签取今天，否则看昨天
    const today = new Date();
    const todayDate = today.toISOString().split("T")[0];
    const todayRecord = records.find((r) => r.date === todayDate);

    let currentStreak = todayRecord ? todayRecord.streak : 0;
    if (!todayRecord) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split("T")[0];
      const yesterdayRecord = records.find((r) => r.date === yesterdayDate);
      if (yesterdayRecord) currentStreak = yesterdayRecord.streak;
    }

    res.send({
      code: 0,
      data: { records, currentStreak, totalCheckins: records.length },
    });
  } catch (err) {
    console.error("GET /api/checkin 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
