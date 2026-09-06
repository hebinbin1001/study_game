const express = require("express");
const { User } = require("../db");

const router = express.Router();

// 昵称长度约束：去除首尾空白后 2~12 字符
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 12;

/**
 * 校验昵称合法性：非空字符串、去除首尾空白后长度在 2~12 之间。
 */
function isValidNickname(nickname) {
  if (typeof nickname !== "string") return false;
  const trimmed = nickname.trim();
  return trimmed.length >= NICKNAME_MIN && trimmed.length <= NICKNAME_MAX;
}

/**
 * 根据 openid 查找用户，openid 缺失或用户不存在时返回 null。
 */
async function findUserByOpenid(openid) {
  if (!openid) return null;
  return User.findOne({ where: { openid } });
}

/**
 * GET /api/nickname —— 读取当前用户昵称（REQ-API-3）
 * 用户不存在 → { code: 1001 }；成功 → { code: 0, data: { nickname } }。
 */
router.get("/", async (req, res) => {
  try {
    const user = await findUserByOpenid(req.openid);
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }

    res.send({ code: 0, data: { nickname: user.nickname } });
  } catch (err) {
    console.error("GET /api/nickname 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/nickname —— 设置昵称（REQ-API-3）
 * 先校验昵称：去除首尾空白、非空、2~12 字符，非法 → { code: 2001 }；
 * 用户不存在 → { code: 1001 }；成功 → { code: 0, data: { nickname } }。
 */
router.post("/", async (req, res) => {
  try {
    const { nickname } = req.body || {};

    // 1. 校验昵称合法性
    if (!isValidNickname(nickname)) {
      return res.send({
        code: 2001,
        data: null,
        message: "昵称非法（需去除首尾空白后 2~12 个字符）",
      });
    }

    // 2. 校验用户存在
    const user = await findUserByOpenid(req.openid);
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }

    // 3. 写入昵称（保存去除首尾空白后的值）
    const trimmed = nickname.trim();
    await user.update({ nickname: trimmed });

    res.send({ code: 0, data: { nickname: trimmed } });
  } catch (err) {
    console.error("POST /api/nickname 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;