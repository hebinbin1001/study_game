/**
 * utils/request.js —— 后端 HTTP 封装
 *
 * 职责：封装 wx.request，自动附加 x-wx-source / x-wx-openid 请求头；
 *       统一解包 { code, data } 响应结构。
 *
 * 关联需求：
 *   - REQ-API-5（OpenID 透传：自动附加 x-wx-source / x-wx-openid 请求头）
 *   - REQ-NFR-2（离线/弱网静默降级，不阻塞游戏主流程）
 *
 * 错误契约（v2，消除"静默吞错哨兵值"歧义）：
 *   - 成功：resolve(data)
 *   - 失败：一律 reject(err)，err 形如 { code, message, ... }，并按类别打标：
 *       · isBusiness: true —— 后端返回 { code !== 0 } 的业务错误
 *       · isNetwork:  true —— 网络不可用 / 地址未配置 / HTTP 非 2xx / 响应结构异常
 *   - 不再返回与成功同构的哨兵值（旧版 silent=true 时 resolve(null) 已废弃）。
 *     调用方用 .then(成功) / .catch(err) 显式区分成败，err.code + err.message 可直接展示。
 *
 * BASE_URL 接线：
 *   - setBaseUrl(url) 由 app.js 在 onLaunch 注入真实云托管地址（显式优先）；
 *   - 未注入时回退到 detectEnvVersion() 推断的 DEFAULT_API_HOSTS 占位；
 *   - 仍无可用地址（develop 默认空串，避免向占位域名盲发请求）时，
 *     直接 reject({ isNetwork:true, code:-3 })，由调用方本地降级，不发起无效请求。
 */

// ============ 一、配置 ============

// 后端基础地址（显式注入值），空串表示未注入
var BASE_URL = '';

// 各环境默认云托管域名占位。
// TODO(替换)：真实地址需在「微信云托管控制台」开通后替换为对应环境域名。
// develop 默认留空：开发者工具/体验版未接线时不向占位域名盲发请求，直接走本地降级；
// trial/release 给出占位便于联调，仍应替换。
var DEFAULT_API_HOSTS = {
  develop: '',
  trial: 'https://word-warrior-trial-ENV.tcloudbaseapp.com', // TODO(替换) 体验版云托管域名
  release: 'https://word-warrior-release-ENV.tcloudbaseapp.com' // TODO(替换) 生产云托管域名
};

// 当前小程序环境版本（develop/trial/release），惰性探测并缓存
var _envVersion = null;

// 请求来源标识：必须与后端 openid 中间件可信白名单（WX_TRUSTED_SOURCES，
// 默认 weixin,wechat）保持一致，否则后端会以 code=1003「不受信任的请求来源」拒绝。
var SOURCE_HEADER = 'weixin';

/**
 * 探测当前小程序环境版本（wx.getAccountInfoSync → envVersion）。
 * 非 wx 环境或探测失败兜底 'develop'。
 * @returns {string} 'develop' | 'trial' | 'release'
 */
function detectEnvVersion() {
  if (_envVersion) return _envVersion;
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      var acc = wx.getAccountInfoSync();
      var env = acc && acc.miniProgram && acc.miniProgram.envVersion;
      _envVersion = env || 'develop';
    } else {
      _envVersion = 'develop';
    }
  } catch (e) {
    _envVersion = 'develop';
  }
  return _envVersion;
}

/**
 * 显式设置后端基础地址（应用启动 onLaunch 时由 app.js 接线）。
 * @param {string} url 基础地址，如 'https://your-env.tcloudbaseapp.com'
 */
function setBaseUrl(url) {
  BASE_URL = url || '';
}

/**
 * 获取实际生效的基础地址：显式注入值优先，否则回退环境推断占位。
 * @returns {string} 基础地址（可能为空串）
 */
function getBaseUrl() {
  if (BASE_URL) return BASE_URL;
  var env = detectEnvVersion();
  return DEFAULT_API_HOSTS[env] || DEFAULT_API_HOSTS.develop || '';
}

/**
 * 获取当前用户的 openid（从 app globalData 读取，容错）。
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

/**
 * 检测网络是否可用（wx.getNetworkType，fail 时视为无网）。
 * @returns {Promise<boolean>}
 */
function isNetworkAvailable() {
  return new Promise(function (resolve) {
    if (typeof wx === 'undefined' || !wx.getNetworkType) {
      resolve(false);
      return;
    }
    wx.getNetworkType({
      success: function (res) {
        resolve(res.networkType !== 'none');
      },
      fail: function () {
        resolve(false);
      }
    });
  });
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
 * 发起后端请求，返回 Promise。失败一律 reject，不返回哨兵值。
 *
 * 关联需求：REQ-API-5、REQ-NFR-2
 *
 * @param {Object} options 请求选项
 * @param {string} options.url 接口路径，如 '/api/score'（自动拼接 baseUrl）
 * @param {string} [options.method='GET'] 请求方法
 * @param {Object} [options.data] 请求数据
 * @param {Object} [options.header] 额外请求头
 * @param {boolean} [options.skipAuth=false] 是否跳过自动附加 openid 头（如健康检查）
 * @param {number} [options.timeout=10000] 超时毫秒
 * @returns {Promise<Object>} resolve(data)；reject(BusinessError | NetworkError)
 */
function request(options) {
  var opts = options || {};
  var skipAuth = !!opts.skipAuth;

  var url = opts.url || '';

  return new Promise(function (resolve, reject) {
    // —— 拼接完整 URL ——
    var base = getBaseUrl();
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) {
      // 已是完整地址，直接使用
    } else if (base) {
      var sep = (base.charAt(base.length - 1) === '/') ? '' : '/';
      url = base + sep + String(url).replace(/^\//, '');
    } else {
      // 地址未配置：明确失败，绝不向无效相对路径发起请求
      reject(makeError(-3, '后端服务地址未配置，请调用 setBaseUrl(url)（utils/request.js）', { isNetwork: true }));
      return;
    }

    if (typeof wx === 'undefined' || !wx.request) {
      reject(makeError(-1, 'wx.request 不可用（非微信环境）', { isNetwork: true }));
      return;
    }

    // —— 构造请求头：自动附加 x-wx-source / x-wx-openid（REQ-API-5） ——
    // 仅在「已取得 openid」时才附带 x-wx-source + x-wx-openid（完整身份，后端校验通过）。
    // 未取得 openid（云托管方案下由微信网关自动注入、前端通常拿不到）时不带这两个头，
    // 让请求走后端「匿名放行」路径：业务路由返回 code=1001（未识别用户），
    // 由调用方本地降级（离线可玩 / 成绩入队补报），而非被 code=1003 直接拒绝。
    var header = Object.assign({}, opts.header || {});
    if (!skipAuth) {
      var openid = getOpenid();
      if (openid) {
        header['x-wx-source'] = SOURCE_HEADER;
        header['x-wx-openid'] = openid;
      }
    }

    wx.request({
      url: url,
      method: opts.method || 'GET',
      data: opts.data || {},
      header: header,
      timeout: opts.timeout || 10000,
      success: function (res) {
        // HTTP 状态码非 2xx → 网络层错误
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(makeError(res.statusCode, 'HTTP ' + res.statusCode, { isNetwork: true }));
          return;
        }

        // 解包 { code, data }
        var body = res.data;
        if (body && typeof body === 'object' && 'code' in body) {
          if (body.code === 0) {
            resolve(body.data);
          } else {
            // 业务错误：code !== 0，携带后端 message（如有）供页面 toast 展示
            reject(makeError(body.code, body.message || ('业务错误 ' + body.code), {
              isBusiness: true,
              data: body.data
            }));
          }
        } else {
          // 响应结构不符合约定
          reject(makeError(-2, '响应结构异常：缺少 { code, data }', { isNetwork: true }));
        }
      },
      fail: function (err) {
        // 网络失败/超时：明确 reject（REQ-NFR-2 由调用方 catch 后决定是否静默/入队）
        reject(makeError(-1, (err && err.errMsg) || '网络请求失败', { isNetwork: true }));
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
  request: request,
  get: get,
  post: post,
  setBaseUrl: setBaseUrl,
  getBaseUrl: getBaseUrl,
  detectEnvVersion: detectEnvVersion,
  isNetworkAvailable: isNetworkAvailable,
  // 内部方法导出便于单测
  _getOpenid: getOpenid
};
