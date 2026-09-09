/**
 * OpenID 鉴权中间件（REQ-API-5 / M5 token / M7 callContainer 适配）
 *
 * ── 信任模型说明 ────────────────────────────────────────────────
 * 真实防护依赖微信云托管网关：网关在转发小程序请求时【剥离并覆盖】客户端
 * 伪造的 x-wx-openid 头，并注入基于登录态的可信 OpenID。因此：
 *   - 到达本中间件且格式合法的 x-wx-openid，均视为网关注入（可信）；
 *   - Bearer token 为本业务自签登录态，优先；未命中回退网关注入 openid。
 * 本中间件不再对 x-wx-source 做白名单强判——callContainer 通道下前端
 * 自定义头（含 Authorization）可能被网关改写，而 openid 已由网关背书，
 * 继续强制 source 白名单会误伤该通道（历史 1003 问题根因）。
 *
 * 身份解析优先级：
 *   ① Authorization: Bearer <token>（查 users.token）→ 命中即用；
 *   ② 请求头 x-wx-openid 合法（OPENID_RE）→ 采用（网关注入 / 联调 / e2e）；
 *   ③ 均未命中 → req.openid = null（匿名），业务路由在需要用户维度时返回 1001。
 * 说明：容器不应被公网直连；若需额外防线（例如公网域名暴露），请在网关侧
 * 开启鉴权/白名单，而不是在本中间件硬编码来源值。
 */

const { CODE, OPENID_RE } = require("../constants");
const { User } = require("../db");

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

    // ② 网关注入 / 联调 / e2e：格式合法的 x-wx-openid 即采用（网关已兜底防伪）
    const openid = String(req.headers["x-wx-openid"] || "").trim();
    if (openid) {
      if (!OPENID_RE.test(openid)) {
        return res.send({
          code: CODE.OPENID_INVALID,
          data: null,
          message: "openid 格式非法",
        });
      }
      req.openid = openid;
      return next();
    }

    // ③ 匿名：置空放行，业务路由按 code=1001 处理（游客/离线）
    req.openid = null;
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
