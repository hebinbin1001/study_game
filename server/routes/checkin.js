const express = require("express");
const { CheckinRecord, RankRecord } = require("../db");

const router = express.Router();

/**
 * POST /api/checkin —— 签到
 */
router.post("/", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const today = new Date();
    const todayDate = today.toISOString().split("T")[0];

    // 检查今日是否已签到
    const existing = await CheckinRecord.findOne({
      where: { openid, date: todayDate },
    });

    if (existing) {
      return res.send({
        code: 4000,
        data: null,
        message: "今日已签到",
      });
    }

    // 获取昨日签到记录
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split("T")[0];

    const yesterdayRecord = await CheckinRecord.findOne({
      where: { openid, date: yesterdayDate },
    });

    // 计算连续签到天数
    let streak = 1;
    if (yesterdayRecord) {
      streak = yesterdayRecord.streak + 1;
    }

    // 创建签到记录
    const record = await CheckinRecord.create({
      openid,
      date: todayDate,
      streak,
    });

    // 签到奖励：星数
    let rewardStars = 10; // 基础奖励
    if (streak === 3) rewardStars = 30;
    if (streak === 7) rewardStars = 100;
    if (streak === 14) rewardStars = 200;
    if (streak === 30) rewardStars = 500;

    // 更新段位星数
    const rankRecord = await RankRecord.findOne({
      where: { openid },
    });

    if (rankRecord) {
      rankRecord.stars += rewardStars;
      await rankRecord.save();
    }

    res.send({
      code: 0,
      data: {
        recordId: record.recordId,
        date: todayDate,
        streak,
        rewardStars,
      },
    });
  } catch (err) {
    console.error("POST /api/checkin 失败：", err);
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
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { month } = req.query; // YYYY-MM
    const where = { openid };

    if (month) {
      const startDate = new Date(month + "-01");
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      where.date = {
        $gte: startDate,
        $lt: endDate,
      };
    }

    const records = await CheckinRecord.findAll({
      where,
      order: [["date", "ASC"]],
    });

    // 计算当前连续签到天数
    const today = new Date();
    const todayDate = today.toISOString().split("T")[0];
    const todayRecord = records.find((r) => r.date === todayDate);

    let currentStreak = todayRecord ? todayRecord.streak : 0;

    // 如果今天没签到，检查昨天
    if (!todayRecord) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayDate = yesterday.toISOString().split("T")[0];
      const yesterdayRecord = records.find((r) => r.date === yesterdayDate);
      if (yesterdayRecord) {
        currentStreak = yesterdayRecord.streak;
      }
    }

    res.send({
      code: 0,
      data: {
        records,
        currentStreak,
        totalCheckins: records.length,
      },
    });
  } catch (err) {
    console.error("GET /api/checkin 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;