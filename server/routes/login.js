const express = require("express");
const crypto = require("crypto");
const https = require("https");
const { URL } = require("url");
const { User } = require("../db");
const { CODE, OPENID_RE } = require("../constants");

const router = express.Router();

// 用户 openid 解析优先级（M6 修复：摆脱对 WX_SECRET 的硬依赖）：
//   ① 微信云托管网关转发请求时自动注入的可信 x-wx-openid（推荐：无需 AppSecret，
//      适合真实部署；前提：小程序经云托管域名 wx.request，且网关开启登录态透传）；
//   ② dev_ 开头 code（本地/联调/e2e 降级测试码）→ test_openid_<后缀>；
//   ③ 真实 wx.login code → auth.code2Session（需云托管注入 WX_SECRET；无则 4011）。
const WX_APPID = process.env.WX_APPID || "";
const WX_SECRET = process.env.WX_SECRET || "";

// 测试码前缀：dev_ 开头 code 降级为测试 openid
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
 * 由登录凭证解析用户 openid（来源优先级见文件头说明）。
 * @param {string} jsCode wx.login 临时 code（可空）
 * @param {string} gwOpenid 云托管网关注入的 x-wx-openid（可空）
 * @returns {Promise<string>} openid
 */
async function resolveOpenid(jsCode, gwOpenid) {
  // 来源①：网关注入的可信 openid（无需 code2session / WX_SECRET）
  if (gwOpenid && OPENID_RE.test(gwOpenid)) {
    return gwOpenid;
  }
  // 来源②：dev_ 测试码（本地/联调/e2e）
  if (jsCode && jsCode.indexOf(DEV_CODE_PREFIX) === 0) {
    return "test_openid_" + jsCode.slice(DEV_CODE_PREFIX.length);
  }
  // 来源③：真实 code → code2session（需 WX_SECRET）
  if (!WX_SECRET) {
    const err = new Error("登录服务未配置：网关未注入 openid 且缺 WX_SECRET（请在云托管注入或使用 dev_ 测试码）");
    err.code = CODE.LOGIN_NOT_CONFIGURED;
    throw err;
  }
  if (!jsCode) {
    const err = new Error("登录 code 缺失或非法");
    err.code = CODE.LOGIN_CODE_INVALID;
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
    // 网关注入的 openid 优先（见文件头说明），此时 code 可缺省
    const gwOpenid = String(req.headers["x-wx-openid"] || "").trim();
    const jsCode = code && typeof code === "string" ? code.trim() : "";
    if (!jsCode && !gwOpenid) {
      return res.send({
        code: CODE.LOGIN_CODE_INVALID,
        data: null,
        message: "登录凭证缺失（无 code 且网关未注入 openid）",
      });
    }

    const openid = await resolveOpenid(jsCode, gwOpenid);

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
