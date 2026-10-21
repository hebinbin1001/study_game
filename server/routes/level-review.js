const express = require("express");
const { CustomLevel, LevelReview } = require("../db");
const { checkAdmin, maskOpenid } = require("../admin-auth");

const router = express.Router();

// 审核员白名单（从环境变量读取，逗号分隔）
const REVIEWERS = (process.env.LEVEL_REVIEWERS || "").split(",").filter(Boolean);

/**
 * 检查是否为审核员
 */
function isReviewer(openid) {
  return REVIEWERS.includes(openid);
}

/** 审核员白名单或管理口令都可审核（管理页只拿得到口令） */
function canReview(req) {
  const openid = String(req.openid || "");
  if (isReviewer(openid)) return true;
  const passcode = (req.get && req.get("x-admin-passcode")) || req.query.passcode
    || (req.body && req.body.passcode) || "";
  return checkAdmin(openid, passcode, process.env).ok;
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

    if (!canReview(req)) {
      return res.send({
        code: 4003,
        data: null,
        message: "无审核权限",
      });
    }

    const rawStatus = String(req.query.status || "pending");
    const status = ["pending", "approved", "rejected"].indexOf(rawStatus) >= 0
      ? rawStatus : "pending";
    const levels = await CustomLevel.findAll({
      where: { status },
      order: [["createdAt", "DESC"]],
    });

    const list = levels.map((l) => ({
      levelId: l.levelId,
      title: l.title,
      description: l.description,
      grade: l.grade,
      totalQ: l.totalQ,
      status: l.status,
      shareCode: l.shareCode,
      createdAt: l.createdAt,
      items: l.items || [],
      authorOpenidMasked: maskOpenid(l.authorOpenid),
    }));
    res.send({ code: 0, data: list });
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

    if (!canReview(req)) {
      return res.send({
        code: 4003,
        data: null,
        message: "无审核权限",
      });
    }

    const { levelId, status, comment } = req.body || {};
    if (!levelId || !status) {
      return res.send({
        code: 4000,
        data: null,
        message: "参数缺失",
      });
    }
    if (["approved", "rejected"].indexOf(status) < 0) {
      return res.send({ code: 4000, data: null, message: "审核状态非法" });
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
