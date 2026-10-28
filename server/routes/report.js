const express = require("express");
const { Op } = require("sequelize");
const { User, Score, WrongRecord } = require("../db");

const router = express.Router();

/** 返回 { date:'YYYY-MM-DD' }（与 checkin/成绩表同用 UTC 日口径，保持一致） */
function isoDay(d) {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * GET /api/report/range?days=7 —— 学习统计（M6-D）
 * 近 N 天（默认 7，上限 30）按天聚合成绩（题量/正确率/得星/闯关次数），
 * 并给出错题题型分布（薄弱题型）。
 */
router.get("/range", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const user = await User.findOne({ where: { openid } });
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }

    const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    const scores = await Score.findAll({
      where: { user_id: user.id, createdAt: { [Op.gte]: start } },
      order: [["createdAt", "ASC"]],
    });

    // 按天聚合
    const dayMap = {};
    let totalQ = 0;
    let totalCorrect = 0;
    let totalStars = 0;
    let studyPlays = 0;
    let casualPlays = 0;
    scores.forEach((s) => {
      // 题量/正确率只统计「真有题目」的记录（2026-10-28）：休闲玩法（数独/华容道/2048…）
      // 的 total_q 落 0，加进来也不会影响数字，但仍计入闯关次数与星星。
      const q = Number(s.total_q) || 0;
      const isStudy = q > 0;
      if (isStudy) studyPlays += 1; else casualPlays += 1;
      totalQ += q;
      totalCorrect += s.correct_count;
      totalStars += s.stars || 0;
      const d = isoDay(s.createdAt);
      if (!dayMap[d]) dayMap[d] = { questions: 0, correct: 0, stars: 0, plays: 0, casualPlays: 0 };
      dayMap[d].questions += q;
      dayMap[d].correct += s.correct_count;
      dayMap[d].stars += s.stars || 0;
      dayMap[d].plays += 1;
      if (!isStudy) dayMap[d].casualPlays += 1;
    });

    const trend = Object.keys(dayMap)
      .sort()
      .map((d) => {
        const v = dayMap[d];
        return {
          date: d,
          plays: v.plays,
          questions: v.questions,
          rate: v.questions ? Math.round((v.correct / v.questions) * 100) : 0,
          stars: v.stars,
          casualPlays: v.casualPlays,
        };
      });

    // 错题题型分布（薄弱题型）
    const wrongs = await WrongRecord.findAll({
      where: { openid },
      attributes: ["question"],
    });
    const typeCount = {};
    wrongs.forEach((w) => {
      const t = w.question && w.question.type;
      if (t) typeCount[t] = (typeCount[t] || 0) + 1;
    });
    const wrongByType = Object.keys(typeCount)
      .map((t) => ({ type: t, count: typeCount[t] }))
      .sort((a, b) => b.count - a.count);

    res.send({
      code: 0,
      data: {
        days,
        totalDays: Object.keys(dayMap).length,
        totalQ,
        totalCorrect,
        avgRate: totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0,
        totalStars,
        totalPlays: scores.length,
        studyPlays,          // 有题目的局数（字词类，进正确率）
        casualPlays,         // 休闲玩法局数（只给星星，不计题量）
        hasQuiz: totalQ > 0, // 端上据此把「0%」显示成「还没答题」
        trend,
        wrongByType,
      },
    });
  } catch (err) {
    console.error("GET /api/report/range 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
