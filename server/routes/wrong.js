const express = require("express");
const { WrongRecord } = require("../db");

const router = express.Router();

// 艾宾浩斯复习间隔（天）
const EBBINGHAUS_INTERVALS = [1, 2, 4, 7, 15, 30];

/**
 * 计算下次复习时间
 */
function calculateNextReview(reviewCount, mastery, isCorrect) {
  const now = new Date();

  if (!isCorrect) {
    // 答错：重置复习次数，降低熟练度，明天再复习
    return {
      mastery: Math.max(0, mastery - 10),
      reviewCount: 0,
      nextReviewAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  // 答对：增加熟练度，按间隔计算下次复习时间
  const newMastery = Math.min(100, mastery + 20);
  const intervalIdx = Math.min(reviewCount, EBBINGHAUS_INTERVALS.length - 1);
  const intervalDays = EBBINGHAUS_INTERVALS[intervalIdx];
  const nextReviewAt = new Date(
    now.getTime() + intervalDays * 24 * 60 * 60 * 1000
  );

  return {
    mastery: newMastery,
    reviewCount: reviewCount + 1,
    nextReviewAt,
  };
}

/**
 * POST /api/wrong/add —— 添加错题记录
 */
router.post("/add", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { questionId, question } = req.body;
    if (!questionId || !question) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    // 查找现有记录
    const existing = await WrongRecord.findOne({
      where: { openid, questionId },
    });

    if (existing) {
      // 已有记录：累加错误次数，重置下次复习时间
      existing.wrongCount += 1;
      existing.nextReviewAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await existing.save();

      return res.send({ code: 0, data: existing });
    }

    // 新记录
    const nextReviewAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const record = await WrongRecord.create({
      openid,
      questionId,
      question,
      wrongCount: 1,
      nextReviewAt,
      reviewCount: 0,
      mastery: 0,
    });

    res.send({ code: 0, data: record });
  } catch (err) {
    console.error("POST /api/wrong/add 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/wrong/list —— 获取错题列表
 */
router.get("/list", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const now = new Date();
    const allRecords = await WrongRecord.findAll({
      where: { openid },
      order: [["nextReviewAt", "ASC"]],
    });

    // 分组：待复习 = 未掌握（含今日新错，当天即可见；按到期时间排序）/ 已掌握 = 熟练度 100
    const pending = allRecords.filter((r) => r.mastery < 100);
    const mastered = allRecords.filter((r) => r.mastery >= 100);

    res.send({
      code: 0,
      data: {
        pending,
        mastered,
        total: allRecords.length,
      },
    });
  } catch (err) {
    console.error("GET /api/wrong/list 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/wrong/review —— 复习作答
 */
router.post("/review", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const { recordId, correct } = req.body;
    if (!recordId || correct === undefined) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    const record = await WrongRecord.findOne({
      where: { openid, recordId },
    });

    if (!record) {
      return res.send({
        code: 4001,
        data: null,
        message: "记录不存在",
      });
    }

    // 计算新的复习状态
    const update = calculateNextReview(
      record.reviewCount,
      record.mastery,
      correct
    );

    await record.update(update);

    res.send({
      code: 0,
      data: {
        recordId: record.recordId,
        mastery: record.mastery,
        reviewCount: record.reviewCount,
        nextReviewAt: record.nextReviewAt,
      },
    });
  } catch (err) {
    console.error("POST /api/wrong/review 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/wrong/stats —— 错题统计
 */
router.get("/stats", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const now = new Date();
    const all = await WrongRecord.findAll({ where: { openid } });

    // 待复习 = 未掌握（含今日新错）；已掌握 = 熟练度 100
    const pending = all.filter((r) => r.mastery < 100).length;
    const mastered = all.filter((r) => r.mastery >= 100).length;

    res.send({
      code: 0,
      data: {
        total: all.length,
        pending,
        mastered,
      },
    });
  } catch (err) {
    console.error("GET /api/wrong/stats 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;