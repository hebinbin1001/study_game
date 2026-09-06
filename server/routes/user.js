const express = require("express");
const { User } = require("../db");

const router = express.Router();

/**
 * POST /api/user —— 获取或创建用户（REQ-API-2）
 * 前置：请求头携带 x-wx-source + x-wx-openid（由 openid 中间件解析为 req.openid）。
 * 缺 openid → { code: 1001 }（未识别用户）；成功 → { code: 0, data: user }。
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

    // 存在则返回，不存在则创建
    const [user] = await User.findOrCreate({
      where: { openid },
      defaults: { openid },
    });

    res.send({ code: 0, data: user });
  } catch (err) {
    console.error("POST /api/user 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;