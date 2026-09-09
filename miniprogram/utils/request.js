/**
 * utils/request.js —— 后端 HTTP 封装（云托管 callContainer 版）
 *
 * 职责：封装 wx.cloud.callContainer 调用云托管后端，统一解包 { code, data } 响应。
 *
 * 背景（2026-09-08 从 wx.request 迁移）：
 *   - 旧方案 wx.request + 云托管裸域名 https://xxx.sh.run.tcloudbase.com 会触发
 *     微信「request 合法域名」白名单校验（fail url not in domain list），且该裸域名
 *     未备案无法配置到公众平台。
 *   - 现改 wx.cloud.callContainer：官方能力，无需配置服务器域名、内网通信、
 *     网关自动注入用户 openid（后端 /api/login 来源①直接可用），根治白名单问题。
 *
 * 关联需求：
 *   - REQ-API-5（OpenID 透传：callContainer 下由网关自动注入，前端无需携带）
 *   - REQ-NFR-2（离线/弱网静默降级，不阻塞游戏主流程）
 *
 * 错误契约（v2）：
 *   - 成功：resolve(data)
 *   - 失败：一律 reject(err)，err 形如 { code, message, ... }，并按类别打标：
 *       · isBusiness: true —— 后端返回 { code !== 0 } 的业务错误
 *       · isNetwork:  true —— 网络不可用 / 环境/服务异常 / 响应结构异常
 */

// ============ 一、云托管配置（唯一来源，app.js 初始化 wx.cloud 时复用） ============
// envId：与本小程序已关联的云开发环境 ID（云开发控制台顶部可查）；
// serviceName：云托管服务名（即服务默认域名首段，如 express-xxx）。
var CLOUD_CONFIG = {
  envId: 'prod-d6gnifjoe28cfd96f',
  serviceName: 'express-g0hk'
};

// 兼容旧接口（已废弃）：setBaseUrl/getBaseUrl 不再参与请求路径拼接，
// 保留仅为避免历史调用方报错；调用方应改用 CLOUD_CONFIG。
var BASE_URL = '';

// 登录态缓存（token/user），request 据此自动附带 Authorization 头
var storage = require('./storage');

// 请求来源标识（已废弃：callContainer 由网关注入身份，前端无需携带）
var SOURCE_HEADER = 'weixin';

/**
 * 显式设置后端基础地址（已废弃：callContainer 方案不再使用，幂等保留）。
 * @deprecated
 * @param {string} url 忽略
 */
function setBaseUrl(url) {
  BASE_URL = url || '';
}

/**
 * 获取历史基础地址（已废弃，恒为空串；callContainer 不再需要域名）。
 * @deprecated
 * @returns {string} 空串
 */
function getBaseUrl() {
  return '';
}

/**
 * 获取当前用户的 openid（callContainer 下由网关注入，前端一般拿不到；
 * 仅供兼容旧逻辑读取 app.globalData.openid）。
 * @returns {string} openid，未获取返回空串
 */
function getOpenid() {
  try {
    var app = getApp();
    if (app && app.globalData && app.globalData.openid) {
      return app.globalData.openid;
    }
  } catch (e) {
    // getApp() 在某些时机不可用，静默忽略
  }
  return '';
}

// ============ 二、核心请求封装 ============

/**
 * 归一化错误对象。
 * @param {number} code 错误码（业务码 / HTTP 状态 / 内部码）
 * @param {string} message 错误信息
 * @param {Object} [extra] 附加标记（isBusiness/isNetwork/data 等）
 * @returns {Object}
 */
function makeError(code, message, extra) {
  var err = Object.assign({ code: code, message: message }, extra || {});
  return err;
}

/**
 * 发起云托管请求，返回 Promise。失败一律 reject，不返回哨兵值。
 *
 * 关联需求：REQ-API-5、REQ-NFR-2
 *
 * @param {Object} options 请求选项
 * @param {string} options.url 接口路径，如 '/api/score'（无需域名，callContainer 定位到服务）
 * @param {string} [options.method='GET'] 请求方法
 * @param {Object} [options.data] 请求数据
 * @param {Object} [options.header] 额外请求头
 * @param {boolean} [options.skipAuth=false] 是否跳过自动附加登录 token（如健康检查）
 * @param {number} [options.timeout=10000] 超时毫秒
 * @returns {Promise<Object>} resolve(data)；reject(BusinessError | NetworkError)
 */
function request(options) {
  var opts = options || {};
  var skipAuth = !!opts.skipAuth;

  var url = opts.url || '';
  if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
    // 历史调用方可能传完整地址：剥离域名只保留 path（callContainer 只认 path）
    var m = /^https?:\/\/[^/]+(\/[^?]*)?/.exec(url);
    url = (m && m[1]) || '/';
  } else if (url.charAt(0) !== '/') {
    url = '/' + url;
  }

  return new Promise(function (resolve, reject) {
    if (typeof wx === 'undefined' || !wx.cloud || typeof wx.cloud.callContainer !== 'function') {
      reject(makeError(-1, 'wx.cloud.callContainer 不可用（非微信/未开通云开发）', { isNetwork: true }));
      return;
    }

    // —— 请求头：服务名（必带）+ 登录态 token（openid 由云托管网关自动注入） ——
    var header = Object.assign({}, opts.header || {});
    header['X-WX-SERVICE'] = CLOUD_CONFIG.serviceName;
    if (!header['Content-Type']) header['Content-Type'] = 'application/json';
    if (!skipAuth) {
      var token = storage.getToken();
      if (token) {
        header['Authorization'] = 'Bearer ' + token;
      }
    }

    wx.cloud.callContainer({
      config: { env: CLOUD_CONFIG.envId },
      path: url,
      method: opts.method || 'GET',
      header: header,
      data: opts.data || {},
      timeout: opts.timeout || 10000,
      success: function (res) {
        // HTTP 状态码非 2xx → 网络层错误（callContainer 的 res.statusCode 与 wx.request 一致）
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(makeError(res.statusCode, 'HTTP ' + res.statusCode, { isNetwork: true }));
          return;
        }

        // 解包 { code, data }（callContainer 的 res.data 即后端响应体）
        var body = res.data;
        if (body && typeof body === 'object' && 'code' in body) {
          if (body.code === 0) {
            resolve(body.data);
          } else {
            reject(makeError(body.code, body.message || ('业务错误 ' + body.code), {
              isBusiness: true,
              data: body.data
            }));
          }
        } else {
          reject(makeError(-2, '响应结构异常：缺少 { code, data }', { isNetwork: true }));
        }
      },
      fail: function (err) {
        // 环境/服务异常或网络失败：明确 reject（REQ-NFR-2 由调用方 catch 后决定是否静默/入队）
        var em = (err && (err.errMsg || err.message)) || '网络请求失败';
        if (err && err.errCode !== undefined && err.errCode !== null) {
          em += ' (errCode=' + err.errCode + ')';
        }
        reject(makeError(-1, em, { isNetwork: true }));
      }
    });
  });
}

// ============ 三、便捷方法 ============

/**
 * GET 请求。
 * @param {string} url 接口路径
 * @param {Object} [opts] 额外选项（skipAuth/header/timeout 等）
 * @returns {Promise<Object>}
 */
function get(url, opts) {
  return request(Object.assign({}, opts || {}, { url: url, method: 'GET' }));
}

/**
 * POST 请求。
 * @param {string} url 接口路径
 * @param {Object} [data] 请求数据
 * @param {Object} [opts] 额外选项
 * @returns {Promise<Object>}
 */
function post(url, data, opts) {
  return request(Object.assign({}, opts || {}, { url: url, method: 'POST', data: data }));
}

// ============ 四、对外接口 ============

module.exports = {
  CLOUD_CONFIG: CLOUD_CONFIG,
  request: request,
  get: get,
  post: post,
  // 以下为已废弃/过渡接口，保留兼容
  setBaseUrl: setBaseUrl,
  getBaseUrl: getBaseUrl,
  // 内部方法导出便于单测
  _getOpenid: getOpenid
};