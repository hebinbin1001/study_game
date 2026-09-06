/**
 * OpenID 透传中间件（REQ-API-5，加固版）
 *
 * ── 信任模型说明 ────────────────────────────────────────────────
 * 容器不应被公网直连；真实防护依赖云托管网关在转发小程序请求时
 * 【剥离并覆盖】客户端伪造的 x-wx-source / x-wx-openid 头，并注入
 * 基于登录态的可信 OpenID。本中间件只做纵深防御：对到达容器的
 * 请求头做精确校验，来源/格式不符即返回明确业务错误码，绝不静默放行。
 *
 * ── 决策规则 ────────────────────────────────────────────────
 * 1) 未携带 x-wx-source：
 *      - 亦未携带 x-wx-openid → 视为本地匿名调用，req.openid = null 放行，
 *        业务路由在需要用户维度时按 code=1001 处理（本地冒烟可用）；
 *      - 携带了 x-wx-openid   → openid 无来源背书（伪造），code=1003 拒绝。
 * 2) 携带 x-wx-source：
 *      - 来源值不在可信白名单 → code=1003 拒绝；
 *      - 来源可信但 openid 缺失或格式非法 → code=1002 拒绝。
 * 3) 全部通过校验 → req.openid = openid，后续业务路由统一从 req.openid 取值。
 *
 * ── 配置方式 ────────────────────────────────────────────────
 * 可信来源白名单默认收录云托管网关常见注入值 weixin / wechat；
 * 请与你的云托管网关注入值核对后，通过环境变量覆盖，例如：
 *     WX_TRUSTED_SOURCES=weixin,wechat
 */

const { CODE, OPENID_RE } = require("../constants");

// 可信来源白名单：默认 weixin / wechat，可用环境变量覆盖
const TRUSTED_SOURCES = (process.env.WX_TRUSTED_SOURCES || "weixin,wechat")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = (req, res, next) => {
  const source = req.headers["x-wx-source"];
  const openid = req.headers["x-wx-openid"];

  // 情形一：未携带来源标识
  if (!source) {
    if (openid) {
      // 无来源背书的 openid 一律视为伪造，拒绝
      return res.send({
        code: CODE.SOURCE_UNTRUSTED,
        data: null,
        message: "不受信任的请求来源",
      });
    }
    // 匿名本地调用：置空放行，由业务路由在需要用户维度时返回 1001
    req.openid = null;
    return next();
  }

  // 情形二：来源值不在可信白名单
  if (!TRUSTED_SOURCES.includes(source)) {
    return res.send({
      code: CODE.SOURCE_UNTRUSTED,
      data: null,
      message: "不受信任的请求来源",
    });
  }

  // 情形三：来源可信但 openid 缺失或格式非法
  if (!openid || !OPENID_RE.test(openid)) {
    return res.send({
      code: CODE.OPENID_INVALID,
      data: null,
      message: "openid 缺失或格式非法",
    });
  }

  // 校验通过
  req.openid = openid;
  next();
};