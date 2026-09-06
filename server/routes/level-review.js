const express = require("express");
const { CustomLevel, LevelReview } = require("../db");

const router = express.Router();

// 审核员白名单（从环境变量读取，逗号分隔）
const REVIEWERS = (process.env.LEVEL_REVIEWERS || "").split(",").filter(Boolean);

/**
 * 检查是否为审核员
 */
function isReviewer(openid) {
  return REVIEWERS.includes(openid);
}

/**
 * GET /api/level/reviews —— 待审核列表（管理端）
 */
router.get("/reviews", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({
        code: 1001,
        data: null,
        message: "未识别用户（openid 缺失）",
      });
    }

    if (!isReviewer(openid)) {
      return res.send({
        code: 4003,
        data: null,
        message: "无审核权限",
      });
    }

    const { status = "pending" } = req.query;
    const levels = await CustomLevel.findAll({
      where: { status },
      order: [["createdAt", "DESC"]],
    });

    res.send({ code: 0, data: levels });
  } catch (err) {
    console.error("GET /api/level/reviews 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/level/review —— 审核操作（管理端）
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

    if (!isReviewer(openid)) {
      return res.send({
        code: 4003,
        data: null,
        message: "无审核权限",
      });
    }

    const { levelId, status, comment } = req.body;
    if (!levelId || !status) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }

    const level = await CustomLevel.findOne({
      where: { levelId },
    });
    if (!level) {
      return res.send({
        code: 4001,
        data: null,
        message: "关卡不存在",
      });
    }

    // 更新关卡状态
    level.status = status;
    await level.save();

    // 创建审核记录
    await LevelReview.create({
      levelId,
      reviewerOpenid: openid,
      status,
      comment: comment || "",
    });

    res.send({ code: 0, data: { success: true } });
  } catch (err) {
    console.error("POST /api/level/review 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;