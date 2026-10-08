const express = require("express");
const {
  User,
  Score,
  UserAvatar,
  RankRecord,
  CustomLevel,
  WrongRecord,
  CheckinRecord,
  UserAchievement,
  AvatarBlob,
  sequelize,
} = require("../db");
const { checkContent } = require("../utils/wechat");
const { displayName } = require("../nickname-util");

const router = express.Router();

// 公网基址（拼头像稳定 URL 用；与前端 utils/art.js 的 ART_BASE 同一个服务）
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL
  || "https://express-g0hk-309012-5-1304586666.sh.run.tcloudbase.com";

/** 头像：单张上限 512KB（前端会先压到 160px，实际只有几十 KB，这里只做防御） */
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_MIME = ["image/png", "image/jpeg", "image/webp"];

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
 *
 * 2026-10-08「登录即有名」：注册就发默认昵称，不再有「资料未完善」这个状态，
 * `needProfile` 恒为 false（字段保留只为兼容旧客户端）。昵称展示统一走
 * displayName 兜底，老账号没补上也不会出现空名字。
 */
function profileOf(user) {
  return {
    openid: user.openid,
    nickname: displayName(user.nickname, user.openid),
    avatarUrl: user.avatar_url || "",
    phone: user.phone || "",
    isNew: false,
    needProfile: false,
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
 * POST /api/user/avatar —— 上传头像（2026-09-19）
 *
 * 为什么需要：`<button open-type="chooseAvatar">` 给的是**微信临时文件路径**，
 * 直接存进 users.avatar_url 会导致「本机重启后失效、别人手机必然裂图」。
 * 所以前端先压到 160px，再以 base64 传上来存库，然后把**稳定地址**写回 avatar_url。
 *
 * body: { mime: 'image/png'|'image/jpeg'|'image/webp', data: '<base64>' }
 * 返回: { avatarUrl: 'https://<域名>/api/avatar/<openid>?v=<时间戳>' }
 */
router.post("/avatar", async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) {
      return res.send({ code: 1001, data: null, message: "未识别用户（openid 缺失）" });
    }
    const b = req.body || {};
    const mime = String(b.mime || "image/png").toLowerCase();
    const raw = String(b.data || "");
    if (AVATAR_MIME.indexOf(mime) < 0) {
      return res.send({ code: 4000, data: null, message: "头像格式不支持（仅 png/jpeg/webp）" });
    }
    if (!raw) {
      return res.send({ code: 4000, data: null, message: "缺少图片数据" });
    }
    // 允许传 dataURL（前端有时会带前缀），统一剥掉
    const base64 = raw.indexOf("base64,") >= 0 ? raw.slice(raw.indexOf("base64,") + 7) : raw;
    let buf = null;
    try {
      buf = Buffer.from(base64, "base64");
    } catch (e) {
      buf = null;
    }
    if (!buf || !buf.length) {
      return res.send({ code: 4000, data: null, message: "图片数据解析失败" });
    }
    if (buf.length > AVATAR_MAX_BYTES) {
      return res.send({ code: 4000, data: null, message: "头像过大（请压缩后再传）" });
    }

    const user = await findUserByOpenid(openid);
    if (!user) {
      return res.send({ code: 1001, data: null, message: "未识别用户" });
    }

    const version = Date.now();
    const [row] = await AvatarBlob.findOrCreate({
      where: { openid },
      defaults: { openid, mime, data: buf, version },
    });
    if (row) {
      await row.update({ mime, data: buf, version });
    }

    // 稳定地址写回 users.avatar_url（带 ?v= 破缓存，换头像后各处立刻刷新）
    const avatarUrl = PUBLIC_BASE + "/api/avatar/" + encodeURIComponent(openid) + "?v=" + version;
    await user.update({ avatar_url: avatarUrl });

    res.send({ code: 0, data: { avatarUrl }, message: "ok" });
  } catch (err) {
    console.error("POST /api/user/avatar 失败：", err);
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

    // 2026-10-08：不再接收 wxNickname —— 微信昵称采集这条线整体下线
    // （微信不给真名、用户又不点「使用微信昵称」，采到的其实没什么用；
    //   用户标识以 openid 为准，展示名走 nickname + 默认昵称兜底）
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
      const trimmed = nickname.trim();
      // M6-B 内容安全：昵称涉违规（微信 msgSecCheck，未配置 secret 时放行）
      const sec = await checkContent(trimmed, req.openid, 1);
      if (!sec.safe) {
        return res.send({
          code: 2001,
          data: null,
          message: "昵称包含违规内容，请修改后重试",
        });
      }
      patch.nickname = trimmed;
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

/**
 * POST /api/user/delete —— 注销账号（M6-A）
 * 事务删除该用户全部关联数据（成绩/形象/段位/自定义关卡/错题/签到/成就）后删除用户。
 * 幂等：openid 无账号也返回成功（供前端本地清理）。
 */
router.post("/delete", async (req, res) => {
  const openid = req.openid;
  if (!openid) {
    return res.send({
      code: 1001,
      data: null,
      message: "未识别用户（openid 缺失）",
    });
  }

  const user = await findUserByOpenid(openid);
  if (!user) {
    // 已无账号：幂等返回成功
    return res.send({ code: 0, data: { success: true } });
  }

  const t = await sequelize.transaction();
  try {
    await Score.destroy({ where: { user_id: user.id }, transaction: t });
    await UserAvatar.destroy({ where: { openid }, transaction: t });
    await RankRecord.destroy({ where: { openid }, transaction: t });
    await CustomLevel.destroy({ where: { authorOpenid: openid }, transaction: t });
    await WrongRecord.destroy({ where: { openid }, transaction: t });
    await CheckinRecord.destroy({ where: { openid }, transaction: t });
    await UserAchievement.destroy({ where: { openid }, transaction: t });
    await user.destroy({ transaction: t });
    await t.commit();
    res.send({ code: 0, data: { success: true } });
  } catch (err) {
    await t.rollback();
    console.error("POST /api/user/delete 失败：", err);
    res.send({ code: 5000, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
