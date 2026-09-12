const express = require("express");
const { WrongRecord } = require("../db");
const book = require("../wrong-book");

const router = express.Router();

// 艾宾浩斯算法与分页口径统一放在 server/wrong-book.js（纯逻辑、可单测）
const calculateNextReview = book.calculateNextReview;

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
 *
 * 兼容两种协议（2026-09-12 需求②）：
 *   1. 不带分页参数（老客户端）→ { pending, mastered, total }，与改造前完全一致；
 *   2. 带 page / pageSize / scope（新客户端）→
 *      { items, page, pageSize, total, hasMore, scope, counts:{total,pending,mastered} }
 *      · total 是该 scope 的总数（分页用），counts 是三个口径的数量（统计卡/tab 角标用）；
 *      · 参数非法 → 4000（越界一律报错，不悄悄纠正客户端）。
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

    // 说明：这里仍然一次性取出该用户的全部错题再切片。
    // 错题本是「按用户」的私有数据，量级可控（单用户几百条），内存切片能让
    // 分页、分组、统计共用同一份数据、同一套纯函数逻辑（可单测）。
    // 若将来单用户错题量级明显变大，再改成 SQL limit/offset + count 聚合。
    const allRecords = await WrongRecord.findAll({
      where: { openid },
      order: [["nextReviewAt", "ASC"]],
    });

    const data = book.buildListResponse(allRecords, req.query || {});
    if (data.error) {
      return res.send({ code: 4000, data: null, message: data.error });
    }

    res.send({ code: 0, data });
  } catch (err) {
    console.error("GET /api/wrong/list 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/wrong/remove —— 把一道错题移出错题本（幂等）
 *
 * 需求②：错题复习答对后可以「删除（已掌握）」也可以「保留」；已掌握但被保留的题目
 * 也能在错题本里手动移除，所以需要一个独立删除接口。
 *
 * 契约：
 *   · 入参 { recordId }，缺失 → 4000；
 *   · 只允许删除**属于当前 openid** 的记录（查不到就是别人的或已删除）；
 *   · 幂等：记录不存在也返回 code 0，data.removed = 0（重复点击、并发重复调用都安全）。
 */
router.post("/remove", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    const recordId = req.body && req.body.recordId;
    if (!recordId) {
      return res.send({ code: 4000, data: null, message: "参数缺失" });
    }

    const record = await WrongRecord.findOne({
      where: { openid, recordId },
    });
    if (!record) {
      // 幂等：不存在（已删/非本人/不存在）也算成功
      return res.send({ code: 0, data: { recordId, removed: 0 } });
    }

    await record.destroy();
    res.send({ code: 0, data: { recordId, removed: 1 } });
  } catch (err) {
    console.error("POST /api/wrong/remove 失败：", err);
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
