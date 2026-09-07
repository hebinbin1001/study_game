const express = require("express");
const { User } = require("../db");

const router = express.Router();

// 昵称长度约束：去除首尾空白后 2~12 字符（与 nickname.js 一致）
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 12;

function isValidNickname(nickname) {
  if (typeof nickname !== "string") return false;
  const trimmed = nickname.trim();
  return trimmed.length >= NICKNAME_MIN && trimmed.length <= NICKNAME_MAX;
}

async function findUserByOpenid(openid) {
  if (!openid) return null;
  return User.findOne({ where: { openid } });
}

/**
 * 构造用户公开资料。
 * needProfile：未设昵称 → true（注册完成判定，M5）
 */
function profileOf(user) {
  const nickname = (user.nickname || "").trim();
  return {
    openid: user.openid,
    nickname,
    avatarUrl: user.avatar_url || "",
    phone: user.phone || "",
    isNew: false,
    needProfile: !nickname,
  };
}

/**
 * POST /api/user —— 获取或创建用户（REQ-API-2，兼容既有调用）
 * 前置：openid 中间件已解析 req.openid（token 或 x-wx-openid 头）。
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

    const [user] = await User.findOrCreate({
      where: { openid },
      defaults: { openid },
    });

    res.send({ code: 0, data: profileOf(user) });
  } catch (err) {
    console.error("POST /api/user 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * GET /api/user/me —— 当前用户资料（M5）
 */
router.get("/me", async (req, res) => {
  try {
    const user = await findUserByOpenid(req.openid);
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }
    res.send({ code: 0, data: profileOf(user) });
  } catch (err) {
    console.error("GET /api/user/me 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/user/profile —— 更新昵称/头像（M5）
 * 入参：{ nickname?, avatarUrl? }（至少一项）
 */
router.post("/profile", async (req, res) => {
  try {
    const user = await findUserByOpenid(req.openid);
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }

    const { nickname, avatarUrl } = req.body || {};
    const patch = {};

    if (nickname !== undefined && nickname !== null) {
      if (!isValidNickname(nickname)) {
        return res.send({
          code: 2001,
          data: null,
          message: "昵称非法（需去除首尾空白后 2~12 个字符）",
        });
      }
      patch.nickname = nickname.trim();
    }

    if (avatarUrl !== undefined && avatarUrl !== null) {
      if (typeof avatarUrl !== "string" || avatarUrl.length > 255) {
        return res.send({
          code: 4000,
          data: null,
          message: "头像参数非法",
        });
      }
      patch.avatar_url = avatarUrl;
    }

    if (!Object.keys(patch).length) {
      return res.send({ code: 4000, data: null, message: "参数缺失" });
    }

    await user.update(patch);
    res.send({ code: 0, data: profileOf(user) });
  } catch (err) {
    console.error("POST /api/user/profile 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

/**
 * POST /api/user/logout —— 退出登录（清除 token，M5）
 */
router.post("/logout", async (req, res) => {
  try {
    const user = await findUserByOpenid(req.openid);
    if (user && user.token) {
      user.token = null;
      await user.save();
    }
    res.send({ code: 0, data: { success: true } });
  } catch (err) {
    console.error("POST /api/user/logout 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
