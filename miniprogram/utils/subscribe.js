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
var storage = require('./storage');
var dayKey = require('./day-key');

// 服务端下发的模板配置缓存。模板 ID 换一次就得重新部署，10 分钟内不会变，
// 缓存是为了避免每次点按钮都多一个网络往返（弹窗必须贴着用户点击，慢了会 fail）。
var CACHE_TTL = 10 * 60 * 1000;
var _cache = { at: 0, scenes: null };
var _inflight = null;

// 每个场景的「上次续票日期」与「用户明确拒绝过」。
// 用场景后缀而不是一个总开关：以后加第二个模板时，A 被拒不该连累 B。
var DAY_KEY = 'ww_sub_day_';
var OFF_KEY = 'ww_sub_off_';

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
            // 同时也算今天的续票已完成：否则用户主动点过之后再走到 ensure 会重复弹一次
            storage.set(DAY_KEY + scene, dayKey.todayKey());
            storage.remove(OFF_KEY + scene); // 重新同意了，把「拒过」的标记掀掉
            resolve({ ok: true, reason: 'ok' });
          } else if (status === 'ban') {
            storage.set(OFF_KEY + scene, true);
            resolve({ ok: false, reason: 'ban' });
          } else if (status === 'reject') {
            storage.set(OFF_KEY + scene, true);
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
 * 判断「顺路续票」该不该真的弹窗。抽成纯函数便于单测。
 *
 * 三条判断的由来：
 *   off     —— 用户上次明确点了「拒绝」。微信对「拒绝并勾选总是保持」会一直回 reject，
 *              再问就是纯骚扰；只有用户主动点按钮（ask）才会绕过它重问。
 *   already —— 今天已经续过了。一次性订阅是「一张票换一条消息」，同一天多续的票
 *              对这个场景没有意义（一人一天不会有多张战帖被应战），而每续一次都可能弹框。
 *   ask     —— 其余情况。
 *
 * @param {{off:boolean, last:string}} state 本地状态
 * @param {string} today 东八区日期 'YYYY-MM-DD'
 * @returns {'off'|'already'|'ask'}
 */
function shouldRun(state, today) {
  if (state && state.off) return 'off';
  if (state && state.last && state.last === today) return 'already';
  return 'ask';
}

/** 读某个场景的本地续票状态 */
function readState(scene) {
  return {
    off: !!storage.get(OFF_KEY + scene),
    last: String(storage.get(DAY_KEY + scene) || '')
  };
}

/**
 * 顺路续一张票（像 ensure 一样用在「用户本来就要点的动作」上）。
 *
 * 与 ask 的分工：
 *   ask    = 用户主动点「提醒我」。每次都问、每次都回话（弹窗 + toast）。
 *   ensure = 挂在别的动作旁边顺手充一张。一天最多一次，被拒过就不再自动问，
 *            而且**不弹任何提示** —— 它是搭车的，喧宾夺主就没人愿意搭了。
 *
 * 「准永久」这件事要说清楚：微信没有永久订阅。用户如果在订阅弹窗里勾了
 * 「总是保持以上选择」，之后 requestSubscribeMessage 会直接回 accept、不再弹窗，
 * 于是每次 ensure 都相当于静默 +1 张票 —— 这是我们能拿到的最好结果。
 * 没勾那个框的用户每次仍会看到弹窗，这是微信的行为，端上无法查询也无法跳过。
 *
 * ⚠️ 和其它订阅调用一样，必须在用户点击事件的同步栈里调用。
 *
 * @param {string} scene 场景 key（如 'pk_accept'）
 * @returns {Promise<{ok:boolean, reason:string}>}
 *   reason: ok | off | already | no-template | unsupported | reject | ban | fail | exception
 */
function ensure(scene) {
  if (!isSupported()) return Promise.resolve({ ok: false, reason: 'unsupported' });
  if (!scene) return Promise.resolve({ ok: false, reason: 'no-template' });

  var today = dayKey.todayKey();
  var verdict = shouldRun(readState(scene), today);
  if (verdict !== 'ask') return Promise.resolve({ ok: false, reason: verdict });

  return fetchConfig().then(function (scenes) {
    var tpl = scenes[scene];
    if (!tpl) return { ok: false, reason: 'no-template' };

    // 先落日期再弹框：微信的弹窗是异步的，用户连点两下会叠出两个框（iOS 上会卡住）。
    // 先写能把第二下挡在门外；真失败了在 fail 里回滚。
    storage.set(DAY_KEY + scene, today);

    return new Promise(function (resolve) {
      wx.requestSubscribeMessage({
        tmplIds: [tpl],
        success: function (res) {
          var status = res && res[tpl];
          if (isAccepted(status)) {
            request.post('/api/subscribe/grant', { scene: scene }).catch(function () {});
            resolve({ ok: true, reason: 'ok' });
          } else if (status === 'reject' || status === 'ban') {
            storage.set(OFF_KEY + scene, true);
            resolve({ ok: false, reason: status });
          } else {
            resolve({ ok: false, reason: 'fail' });
          }
        },
        fail: function (err) {
          // 多半是没在 tap 栈里 / 基础库不支持。回滚日期，否则今天再也补不上。
          storage.remove(DAY_KEY + scene);
          resolve({ ok: false, reason: 'exception', err: (err && err.errMsg) || '' });
        }
      });
    });
  });
}

/**
 * 清掉某场景的本地续票状态（调试用：想重新走一遍首次弹窗时调）。
 * @param {string} scene
 */
function resetScene(scene) {
  storage.remove(DAY_KEY + scene);
  storage.remove(OFF_KEY + scene);
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
  shouldRun: shouldRun,
  fetchConfig: fetchConfig,
  ask: ask,
  ensure: ensure,
  resetScene: resetScene,
  warmup: warmup,
  clearCache: clearCache
};
