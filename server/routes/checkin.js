const express = require("express");
const { Op } = require("sequelize");
const { CheckinRecord, RankRecord, User, Score } = require("../db");

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
  let rewardStars = 10;
  if (streak === 3) rewardStars = 30;
  if (streak === 7) rewardStars = 100;
  if (streak === 14) rewardStars = 200;
  if (streak === 30) rewardStars = 500;

  // 累加段位星数（无段位记录则建档）
  let rankRecord = await RankRecord.findOne({ where: { openid } });
  if (!rankRecord) {
    rankRecord = await RankRecord.create({ openid, rankId: 1, wins: 0, stars: rewardStars });
  } else {
    rankRecord.stars += rewardStars;
    await rankRecord.save();
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
