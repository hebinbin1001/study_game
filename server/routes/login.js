const express = require("express");
const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");
const { User } = require("../db");
const { CODE } = require("../constants");

const router = express.Router();

// 微信小程序凭证（云托管控制台注入；缺省时仅允许测试码降级登录）
const WX_APPID = process.env.WX_APPID || "";
const WX_SECRET = process.env.WX_SECRET || "";

// 测试码前缀：无 WX_SECRET 的本地/联调环境，dev_ 开头 code 降级为测试 openid
const DEV_CODE_PREFIX = "dev_";

/**
 * 调用微信 auth.code2Session 换取 openid。
 * 参考：https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-login/code2Session.html
 * @param {string} jsCode wx.login 返回的临时登录凭证
 * @returns {Promise<Object>} { openid, session_key, ... }
 */
function code2session(jsCode) {
  return new Promise((resolve, reject) => {
    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", WX_APPID);
    url.searchParams.set("secret", WX_SECRET);
    url.searchParams.set("js_code", jsCode);
    url.searchParams.set("grant_type", "authorization_code");

    const req = https.get(url, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("code2session 响应解析失败"));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("code2session 超时")));
  });
}

/**
 * 由登录 code 解析用户 openid。
 * 降级策略：code 以 dev_ 开头（测试码）→ 直接映射 test_openid_<后缀>（联调/e2e）；
 * 真实 code 需配置 WX_SECRET，否则抛 4011。
 * @param {string} jsCode
 * @returns {Promise<string>} openid
 */
async function resolveOpenid(jsCode) {
  if (jsCode.indexOf(DEV_CODE_PREFIX) === 0) {
    return "test_openid_" + jsCode.slice(DEV_CODE_PREFIX.length);
  }
  if (!WX_SECRET) {
    const err = new Error("登录服务未配置（缺 WX_SECRET，请在云托管注入或使用 dev_ 测试码）");
    err.code = CODE.LOGIN_NOT_CONFIGURED;
    throw err;
  }
  const result = await code2session(jsCode);
  if (!result || result.errcode || !result.openid) {
    const err = new Error((result && result.errmsg) || "code2session 换取 openid 失败");
    err.code = CODE.LOGIN_CODE_INVALID;
    throw err;
  }
  return result.openid;
}

/** 构造登录成功返回体 */
function loginPayload(user, isNew) {
  const nickname = (user.nickname || "").trim();
  return {
    token: user.token,
    isNew: !!isNew,
    needProfile: !nickname, // 未设昵称 → 需引导完善资料（注册完成判定）
    nickname,
    avatarUrl: user.avatar_url || "",
  };
}

/**
 * POST /api/login —— 静默登录（登录即注册，M5）
 * 入参 { code }（wx.login 临时凭证）；出参见 loginPayload。
 */
router.post("/", async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || typeof code !== "string" || !code.trim()) {
      return res.send({
        code: CODE.LOGIN_CODE_INVALID,
        data: null,
        message: "登录 code 缺失或非法",
      });
    }

    const openid = await resolveOpenid(code.trim());

    // 登录即注册：openid 建档
    const [user, created] = await User.findOrCreate({
      where: { openid },
      defaults: { openid },
    });

    // 签发登录态令牌（重新登录刷新旧 token，单设备模型）
    user.token = crypto.randomBytes(24).toString("hex");
    await user.save();

    res.send({ code: CODE.OK, data: loginPayload(user, created) });
  } catch (err) {
    console.error("POST /api/login 失败：", err);
    if (err.code) {
      return res.send({ code: err.code, data: null, message: err.message });
    }
    res.send({ code: CODE.INTERNAL_ERROR, data: null, message: "服务内部错误" });
  }
});

module.exports = router;
