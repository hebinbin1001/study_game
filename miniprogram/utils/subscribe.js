/**
 * utils/subscribe.js —— 订阅消息（一次性）端上封装（2026-10-28）
 *
 * 三条硬规则决定了这个模块长什么样：
 *   1. 教育类目只能用**一次性订阅**：用户点一次「允许」= 一张票，发一条就少一张；
 *   2. 弹窗**必须由用户点击触发**，不能进页面就弹，也不能放在 setTimeout 里；
 *   3. 模板 ID 与环境/AppID 绑定 —— 所以从服务端拉（`GET /api/subscribe/config`），
 *      服务端没配就说明这个场景还没上线，这里直接返回失败、不弹框。
 *
 * 由此得到的使用姿势：
 *   **挂在一个具体的按钮上**（「好友应战时提醒我」），而不是自动弹。
 *   用户在那个语境里本来就想要提醒，同意率比冷弹高得多。
 *
 * 关联：server/subscribe.js（场景表）、server/routes/subscribe.js（配置与上报）。
 */
var request = require('./request');

// 服务端下发的模板配置缓存。模板 ID 换一次就得重新部署，10 分钟内不会变，
// 缓存是为了避免每次点按钮都多一个网络往返（弹窗必须贴着用户点击，慢了会 fail）。
var CACHE_TTL = 10 * 60 * 1000;
var _cache = { at: 0, scenes: null };
var _inflight = null;

/** 端上是否支持订阅消息（基础库 2.4.4+；老版本直接返回失败，不让调用报错） */
function isSupported() {
  return typeof wx !== 'undefined' && typeof wx.requestSubscribeMessage === 'function';
}

/**
 * 拉取「哪些场景已经配好模板」。
 * @param {boolean} [force] 忽略缓存
 * @returns {Promise<Object>} 形如 { pk_accept: 'TEMPLATE_ID' }
 */
function fetchConfig(force) {
  if (!force && _cache.scenes && Date.now() - _cache.at < CACHE_TTL) {
    return Promise.resolve(_cache.scenes);
  }
  if (_inflight) return _inflight;
  _inflight = request.get('/api/subscribe/config').then(function (d) {
    var scenes = (d && d.scenes) || {};
    _cache = { at: Date.now(), scenes: scenes };
    _inflight = null;
    return scenes;
  }).catch(function () {
    _inflight = null;
    // 拉不到就当「没配置」，绝不因为配置接口挂了而弹一个注定失败的框
    return {};
  });
  return _inflight;
}

/** 微信回调里的订阅结果，哪些算「用户同意了」 */
function isAccepted(status) {
  return status === 'accept' || status === 'acceptWithAudio' || status === 'acceptWithAlert';
}

/**
 * 请求订阅某个场景。
 *
 * ⚠️ 必须在用户点击事件的**同步调用栈**里调用本函数。fetchConfig 命中缓存时是
 *    微任务，仍然有效；缓存未命中会先发请求再弹窗，微信可能报
 *    「can only be invoked by user TAP gesture」。所以调用方应当在页面 onLoad
 *    时先预热一次（warmup），把按钮点击时的调用压进缓存分支。
 *
 * @param {string} scene 场景 key（如 'pk_accept'）
 * @returns {Promise<{ok:boolean, reason:string}>}
 *   reason: ok | no-template | unsupported | reject | ban | fail | exception
 */
function ask(scene) {
  if (!isSupported()) return Promise.resolve({ ok: false, reason: 'unsupported' });
  return fetchConfig().then(function (scenes) {
    var tpl = scenes[scene];
    if (!tpl) return { ok: false, reason: 'no-template' };
    return new Promise(function (resolve) {
      wx.requestSubscribeMessage({
        tmplIds: [tpl],
        success: function (res) {
          var status = res && res[tpl];
          if (isAccepted(status)) {
            // 记一笔「用户同意过」——纯统计，失败不影响订阅本身（票在微信那边）
            request.post('/api/subscribe/grant', { scene: scene }).catch(function () {});
            resolve({ ok: true, reason: 'ok' });
          } else if (status === 'ban') {
            resolve({ ok: false, reason: 'ban' });
          } else if (status === 'reject') {
            resolve({ ok: false, reason: 'reject' });
          } else {
            resolve({ ok: false, reason: 'fail' });
          }
        },
        fail: function (err) {
          resolve({ ok: false, reason: 'exception', err: (err && err.errMsg) || '' });
        }
      });
    });
  });
}

/**
 * 预热配置（进页面时调一次，让按钮点击时的 ask 走缓存分支）。
 * @returns {Promise<Object>} 场景配置；不支持订阅消息时返回空对象
 */
function warmup() {
  if (!isSupported()) return Promise.resolve({});
  return fetchConfig();
}

/** 清缓存（调试用：模板 ID 刚改完时手动刷一次） */
function clearCache() {
  _cache = { at: 0, scenes: null };
  _inflight = null;
}

module.exports = {
  isSupported: isSupported,
  isAccepted: isAccepted,
  fetchConfig: fetchConfig,
  ask: ask,
  warmup: warmup,
  clearCache: clearCache
};
