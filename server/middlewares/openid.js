/**
 * OpenID 鉴权中间件（REQ-API-5，M5 扩展：支持标准登录 token）
 *
 * ── 信任模型说明 ────────────────────────────────────────────────
 * 容器不应被公网直连；真实防护依赖云托管网关在转发小程序请求时
 * 【剥离并覆盖】客户端伪造的 x-wx-source / x-wx-openid 头，并注入
 * 基于登录态的可信 OpenID。本中间件做纵深防御，并对到达容器的
 * 请求按以下优先级解析用户身份（req.openid）：
 *
 *   ① Authorization: Bearer <token>（M5 标准登录签发）→ 查 users.token
 *     命中即视为该 token 持有者（openid）；未命中继续走后续来源。
 *   ② x-wx-source ∈ 可信白名单 且 x-wx-openid 合法（网关注入 / e2e）→ 采用。
 *   ③ 均未命中 → req.openid = null（匿名），业务路由在需要用户维度时返回 1001。
 *
 * ── 配置方式 ────────────────────────────────────────────────
 * 可信来源白名单默认 weixin / wechat，可用环境变量覆盖：
 *     WX_TRUSTED_SOURCES=weixin,wechat
 */

const { CODE, OPENID_RE } = require("../constants");
const { User } = require("../db");

// 可信来源白名单：默认 weixin / wechat，可用环境变量覆盖
const TRUSTED_SOURCES = (process.env.WX_TRUSTED_SOURCES || "weixin,wechat")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * 解析 Authorization: Bearer <token> → openid。
 * @returns {Promise<string|null>} openid；无 token / 未命中返回 null
 */
async function resolveByToken(req) {
  const auth = (req.headers["authorization"] || "").trim();
  const m = /^Bearer\s+([A-Za-z0-9_-]{8,64})$/.exec(auth);
  if (!m) return null;
  const user = await User.findOne({ where: { token: m[1] } });
  return user ? user.openid : null;
}

module.exports = async (req, res, next) => {
  try {
    // ① 标准登录态：Bearer token 优先
    const tokenOpenid = await resolveByToken(req);
    if (tokenOpenid) {
      req.openid = tokenOpenid;
      return next();
    }

    // ② 云托管网关注入 / e2e：x-wx-source + x-wx-openid
    const source = req.headers["x-wx-source"];
    const openid = req.headers["x-wx-openid"];

    if (!source) {
      if (openid) {
        // 无来源背书的 openid 一律视为伪造，拒绝
        return res.send({
          code: CODE.SOURCE_UNTRUSTED,
          data: null,
          message: "不受信任的请求来源",
        });
      }
      // 匿名本地调用：置空放行
      req.openid = null;
      return next();
    }

    if (!TRUSTED_SOURCES.includes(source)) {
      return res.send({
        code: CODE.SOURCE_UNTRUSTED,
        data: null,
        message: "不受信任的请求来源",
      });
    }

    if (!openid || !OPENID_RE.test(openid)) {
      return res.send({
        code: CODE.OPENID_INVALID,
        data: null,
        message: "openid 缺失或格式非法",
      });
    }

    req.openid = openid;
    next();
  } catch (err) {
    console.error("[openid] 鉴权失败：", err);
    res.send({
      code: CODE.INTERNAL_ERROR,
      data: null,
      message: "服务内部错误",
    });
  }
};
