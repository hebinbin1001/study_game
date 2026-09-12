/**
 * utils/art.js —— 美术资源 URL（成就图标 / 段位徽章）
 *
 * 为什么需要它（2026-09-12 用户遇到上传报错后改的）：
 *   微信上传时的检测项「图片和音频资源大小超过 200K」判的是**代码包内图片/音频的总量**，
 *   官方建议「超过 200K 时上传到 CDN、用 URL 引入」。原来成就图标 40 张 + 段位徽章 80 张
 *   合计 ~429KB 全在包里，占了大头。
 *
 * 现在的分工：
 *   代码包内（必要资源）—— 对局立绘 28 张 + tabbar 图标 8 张，合计约 184KB；
 *   服务端托管（按 URL 加载）—— 成就图标与段位徽章，放在仓库 `art/`，
 *   由云托管（同一个 Express 容器）以 `/assets/**` 静态提供。
 *
 * 注意：`<image src>` 加载网络图片**不受「服务器域名」白名单限制**
 * （白名单只管 wx.request / uploadFile / downloadFile / connectSocket），
 * 所以这里可以直接给 https 地址，不需要在小程序后台配置域名。
 */

// 云托管服务公网域名（与 utils/request.js 的 CLOUD_CONFIG 同一个服务）
var ART_BASE = 'https://express-g0hk-309012-5-1304586666.sh.run.tcloudbase.com';

/**
 * 把服务端返回的资源路径转成可加载的 URL。
 * @param {string} p 形如 '/assets/ranks/rank-gold-3-256.png'；已是完整 URL 时原样返回
 * @returns {string} 完整 URL；入参为空时返回空串（模板里 wx:if 会跳过渲染）
 */
function artUrl(p) {
  if (!p) return '';
  if (p.indexOf('http://') === 0 || p.indexOf('https://') === 0) return p;
  if (p.charAt(0) !== '/') p = '/' + p;
  return ART_BASE + p;
}

module.exports = {
  ART_BASE: ART_BASE,
  artUrl: artUrl
};
