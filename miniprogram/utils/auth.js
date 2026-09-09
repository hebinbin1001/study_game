/**
 * utils/auth.js —— 登录态管理（M5：微信登录注册）
 *
 * 职责：
 *   1. loginSilently()：wx.login → POST /api/login → 后端 code2session 建档 →
 *      签发 token → 本地缓存 + globalData（静默登录，失败降级游客）；
 *   2. restore()：启动时从本地缓存恢复登录态（不发请求，立即生效）；
 *   3. isLoggedIn() / isProfileComplete()：登录态 / 注册完成（needProfile）判定；
 *   4. logout()：退出登录（通知后端清 token + 本地清除）。
 *
 * 关联需求：REQ-LOGIN-1/2/3（M5）、REQ-GUEST-1/2（游客限制判定）
 */

var request = require('./request');
var storage = require('./storage');

// 防重入：进行中的登录标记（不再缓存 Promise，避免卡死后“点击无反应”）
var _loggingIn = false;

/** 读取本地 token。@returns {string} */
function getToken() {
  return storage.getToken() || '';
}

/** 读取本地用户资料。@returns {Object|null} */
function getUser() {
  return storage.getUser() || null;
}

/** 是否已登录（持有有效 token 即视为已登录）。@returns {boolean} */
function isLoggedIn() {
  return !!getToken();
}

/** 注册完成判定：已建档且已设置昵称（needProfile=false）。@returns {boolean} */
function isProfileComplete() {
  var u = getUser();
  return !!u && !!((u.nickname || '').trim());
}

/** 将登录响应写入缓存与 globalData。@param {Object} data 登录返回体 */
function applyLogin(data) {
  var token = data.token || '';
  storage.setToken(token);
  var user = {
    openid: data.openid || '',
    nickname: (data.nickname || '').trim(),
    avatarUrl: data.avatarUrl || '',
    needProfile: !!data.needProfile
  };
  storage.setUser(user);
  syncGlobal(token, user);
  return user;
}

/** 同步登录态到 app.globalData（幂等容错）。 */
function syncGlobal(token, user) {
  try {
    var app = getApp();
    if (app && app.globalData) {
      app.globalData.token = token || '';
      app.globalData.user = user || null;
      if (user && user.openid) app.globalData.openid = user.openid;
    }
  } catch (e) {
    // getApp() 某些时机不可用：静默
  }
}

/**
 * 启动时从本地缓存恢复登录态（不发请求，立即生效）。
 * 供 app.js onLaunch 在静默登录完成前同步渲染登录 UI。
 */
function restore() {
  syncGlobal(getToken(), getUser());
}

/**
 * 隐私协议确认（O2：登录前必须先同意《用户协议与隐私政策》）。
 * 已同意过（storage ww_agreed）直接 resolve(true)；否则弹 modal，
 * 同意 → 落存储 resolve(true)；拒绝 → resolve(false)（保持游客，不登录）。
 * @param {string} [content] 自定义文案（缺省用默认摘要）
 * @returns {Promise<boolean>}
 */
function ensureAgreement(content) {
  return new Promise(function (resolve) {
    if (typeof wx === 'undefined' || !wx.showModal) {
      resolve(storage.get('ww_agreed') === '1');
      return;
    }
    if (storage.get('ww_agreed') === '1') {
      resolve(true);
      return;
    }
    wx.showModal({
      title: '用户协议与隐私政策',
      content: content || '欢迎使用「词力战士」。注册登录后，你的昵称、头像与游戏进度将用于排行榜等展示；我们仅收集提供服务所必需的信息，不会向第三方泄露。点击「同意并登录」即视为已阅读并同意《用户协议》与《隐私政策》（全文可在登录页或「我的」中随时查看）；选择「暂不」可继续以游客身份游玩。',
      confirmText: '同意登录',
      cancelText: '暂不',
      success: function (r) {
        if (r.confirm) {
          storage.set('ww_agreed', '1');
          resolve(true);
        } else {
          resolve(false);
        }
      },
      fail: function (err) {
        try { if (typeof console !== 'undefined') console.warn('[auth] 协议弹窗 fail:', err && err.errMsg); } catch (e) {}
        try { wx.showToast({ title: '协议弹窗加载失败，请重试', icon: 'none' }); } catch (e) {}
        resolve(false);
      }
    });
  });
}

/**
 * 静默登录：wx.login → /api/login → 存 token/user。
 * O2：**先过隐私协议**——未同意协议不执行 wx.login（保持游客，不建档）。
 * 并发控制：进行中用 _loggingIn 标记防重入（不再缓存卡死的 Promise，
 * 每次点击都真正发起一次登录，避免“点了没反应”）。
 * 失败 reject（调用方弹窗提示）；取消/拒绝协议 resolve(null)。
 * @param {Object} [opts] { skipAgreement: true } 已确认过协议时可跳过重复弹窗
 * @returns {Promise<Object|null>} 登录成功返回 user；取消/拒绝返回 null；失败 reject
 */
function loginSilently(opts) {
  opts = opts || {};

  if (typeof wx === 'undefined' || typeof wx.login !== 'function') {
    return Promise.reject({ code: -1, message: 'wx.login 不可用', isNetwork: true });
  }

  // 真正发起登录（wx.login + 接口），带超时兜底避免永久悬挂
  var run = function () {
    if (_loggingIn) {
      return Promise.reject({ code: -3, message: '登录请求进行中，请稍候', isNetwork: false });
    }
    _loggingIn = true;
    try { if (typeof console !== 'undefined') console.log('[auth] wx.login 发起'); } catch (e) {}
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        _loggingIn = false;
        reject({ code: -1, message: 'wx.login 超时，请重试', isNetwork: true });
      }, 5000);

      wx.login({
        success: function (res) {
          if (!res || !res.code) {
            if (settled) return; settled = true;
            clearTimeout(timer); _loggingIn = false;
            reject({ code: -1, message: 'wx.login 未返回 code', isNetwork: true });
            return;
          }
          request.post('/api/login', { code: res.code }).then(function (data) {
            if (settled) return; settled = true;
            clearTimeout(timer); _loggingIn = false;
            if (!data || !data.token) {
              reject({ code: -2, message: '登录响应缺少 token', isBusiness: true });
              return;
            }
            resolve(applyLogin(data));
          }, function (err) {
            if (settled) return; settled = true;
            clearTimeout(timer); _loggingIn = false;
            reject(err);
          });
        },
        fail: function () {
          if (settled) return; settled = true;
          clearTimeout(timer); _loggingIn = false;
          reject({ code: -1, message: 'wx.login 失败', isNetwork: true });
        }
      });
    });
  };

  if (opts.skipAgreement) return run();

  // 先协议，同意才登录；拒绝/未同意 → 返回 null（不建档）
  return ensureAgreement().then(function (agreed) {
    if (!agreed) return null;
    return run();
  });
}

/**
 * 拉取最新用户资料并刷新缓存（登录后 / 资料保存后调用）。
 * 未登录或失败均静默返回 null（不抛错）。
 * @returns {Promise<Object|null>}
 */
function refreshMe() {
  if (!isLoggedIn()) return Promise.resolve(null);
  return request.get('/api/user/me').then(function (data) {
    if (!data) return null;
    var user = {
      openid: data.openid || '',
      nickname: (data.nickname || '').trim(),
      avatarUrl: data.avatarUrl || '',
      needProfile: !!data.needProfile
    };
    storage.setUser(user);
    syncGlobal(getToken(), user);
    return user;
  }).catch(function () {
    return null; // 拉取失败静默，保留本地缓存
  });
}

/**
 * 登录引导弹窗：游客触发受限功能/关卡时调用。
 * 用户确认后执行静默登录；登录成功但资料未完善（needProfile）时自动引导设置昵称。
 * @param {string} [desc] 弹窗文案
 * @returns {Promise<Object|null>} 完成登录返回 user；取消/失败返回 null
 */
function promptLogin(desc) {
  return new Promise(function (resolve) {
    if (typeof wx === 'undefined' || !wx.showModal) {
      resolve(null);
      return;
    }
    wx.showModal({
      title: '登录解锁',
      content: desc || '登录后可解锁全部关卡，并获得排行 / 错题 / 成就等能力',
      confirmText: '去登录',
      cancelText: '暂不',
      success: function (r) {
        if (!r.confirm) {
          resolve(null);
          return;
        }
        loginSilently().then(function (user) {
          if (user && user.needProfile) {
            wx.showToast({ title: '登录成功，完善昵称后参与排行', icon: 'none', duration: 1500 });
            setTimeout(function () {
              wx.navigateTo({ url: '/pages/nickname/nickname' });
            }, 900);
          } else if (user) {
            wx.showToast({ title: '登录成功', icon: 'success' });
          }
          resolve(user || null);
        }).catch(function () {
          wx.showToast({ title: '登录失败，请检查网络后重试', icon: 'none' });
          resolve(null);
        });
      },
      fail: function () {
        resolve(null);
      }
    });
  });
}

/** 退出登录：通知后端清 token + 本地清除。 */
function logout() {
  if (getToken()) {
    request.post('/api/user/logout').catch(function () {
      // 后端清理失败不影响本地退出
    });
  }
  storage.clearToken();
  storage.clearUser();
  syncGlobal('', null);
}

module.exports = {
  getToken: getToken,
  getUser: getUser,
  isLoggedIn: isLoggedIn,
  isProfileComplete: isProfileComplete,
  restore: restore,
  ensureAgreement: ensureAgreement,
  loginSilently: loginSilently,
  refreshMe: refreshMe,
  promptLogin: promptLogin,
  logout: logout
};
