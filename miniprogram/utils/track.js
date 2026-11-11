'use strict';

/**
 * utils/track.js —— 埋点上报（2026-11-11 最小数据回路）
 *
 * 只埋 5 个事件（见 server/track-events.js）：
 *   visit       进入小程序（一天记一次，服务端据此算 DAU / 次日回访）
 *   game_start  开始一局（level / puzzle-level 页跳转前上报）
 *   game_end   打完一局（utils/play-report.js 统一上报处）
 *   share_open  从分享卡片进入（启动场景 1007/1008/1044，不需要改分享路径）
 *   d1_return   次日回访（**服务端派生**，客户端不报）
 *
 * 三条硬约束：
 *   1. 只在 release / trial 环境上报 —— 开发者工具（develop）里 E2E 跑一次会往线上库灌
 *      假数据，所以 develop 一律不上报（单测/预览不受影响，队列根本不入）；
 *      本地要看效果，临时把存储项 `ww_track_force` 设成 '1'。
 *   2. 不上报任何内容：不碰昵称、头像、答案、词条正文（只带玩法 key / 学段 / 关卡号 / 星级）。
 *   3. 失败不打扰玩家：本地队列最多 100 条，失败保留等下次补发，超出丢最旧。
 */

var storage = require('./storage');
var request = require('./request');

var QUEUE_KEY = 'ww_track_queue';
var FORCE_KEY = 'ww_track_force';
var E2E_FLAG_KEY = 'ww_e2e_mode_until';

var MAX_QUEUE = 100;   // 离线队列上限（约覆盖几天断网；超出丢最旧）
var BATCH = 20;        // 单次最多上报条数（与服务端 MAX_BATCH 一致）
var FLUSH_DELAY = 1200; // 事件后稍等再发，把连续事件合并成一批

var EVENTS = { visit: 1, game_start: 1, game_end: 1, share_open: 1 };

/** 分享类启动场景值：单人聊天卡片 / 群聊卡片 / 带 shareTicket 的卡片 */
var SHARE_SCENES = { 1007: 1, 1008: 1, 1044: 1 };

var flushing = false;
var flushTimer = null;
var _enabled = null;
var _lastShareOpenAt = 0;

/** 当前运行环境版本（develop / trial / release），拿不到返回空串 */
function envVersion() {
  try {
    var info = wx.getAccountInfoSync();
    return (info && info.miniProgram && info.miniProgram.envVersion) || '';
  } catch (e) {
    return '';
  }
}

/** 是否允许上报（release/trial，或本地强制打开） */
function enabled() {
  if (_enabled !== null) return _enabled;
  if (String(storage.get(FORCE_KEY)) === '1') { _enabled = true; return _enabled; }
  // 开发者工具里是 develop：E2E 会反复进页面，绝不能写进线上埋点库
  if (Number(storage.get(E2E_FLAG_KEY)) > Date.now()) { _enabled = false; return _enabled; }
  var v = envVersion();
  _enabled = v === 'release' || v === 'trial';
  return _enabled;
}

function readQueue() {
  var q = storage.get(QUEUE_KEY);
  return Array.isArray(q) ? q : [];
}

function writeQueue(q) {
  storage.set(QUEUE_KEY, q);
}

/** 字段白名单 + 截断（与服务端 track-events 的 LIMITS 对齐） */
function sanitize(extra) {
  var d = extra || {};
  var out = {};
  var text = function (v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  };
  if (d.game_type) out.game_type = text(d.game_type, 24);
  if (d.grade) out.grade = text(d.grade, 16);
  if (d.level != null) out.level = Math.max(0, Math.min(9999, parseInt(d.level, 10) || 0));
  if (d.scene != null) out.scene = text(d.scene, 32);
  if (d.stars != null) out.stars = Math.max(0, Math.min(3, parseInt(d.stars, 10) || 0));
  if (d.win != null) out.win = d.win ? 1 : 0;
  if (d.duration_ms != null) out.duration_ms = Math.max(0, Math.min(3600000, parseInt(d.duration_ms, 10) || 0));
  if (d.payload) out.payload = text(d.payload, 200);
  out.at = Date.now();
  return out;
}

/**
 * 记一个事件（入队后异步 flush）。
 * @param {string} name 事件名（EVENTS 白名单内的 4 个客户端事件）
 * @param {Object} [extra] 附加字段
 */
function event(name, extra) {
  if (!EVENTS[name]) return;
  if (!enabled()) return;
  var q = readQueue();
  q.push(Object.assign({ event: name }, sanitize(extra)));
  if (q.length > MAX_QUEUE) q = q.slice(q.length - MAX_QUEUE);
  writeQueue(q);
  flushSoon();
}

/** 合并短时间内的多个事件，避免一局结束连发 3 个请求 */
function flushSoon() {
  if (flushTimer) return;
  flushTimer = setTimeout(function () {
    flushTimer = null;
    // 定时器里调用，失败静默
    flush().catch(function () {});
  }, FLUSH_DELAY);
}

/**
 * 立即补发队列（App.onShow / 启动后调用均可）。
 * 成功：把已发送的条数从队列移除（发送期间新入队的保留）；失败：整批保留等下次。
 * @returns {Promise<number>} 本次成功发送条数
 */
function flush() {
  if (flushing || !enabled()) return Promise.resolve(0);
  var q = readQueue();
  if (!q.length) return Promise.resolve(0);
  flushing = true;
  var batch = q.slice(0, BATCH);
  return request.post('/api/track', { events: batch }).then(function () {
    var rest = readQueue();
    rest.splice(0, batch.length);
    writeQueue(rest);
    flushing = false;
    if (rest.length) flushSoon();
    return batch.length;
  }).catch(function () {
    // 离线/服务端异常：保留队列，下次 onShow 再试；不弹 toast（埋点不是关键路径）
    flushing = false;
    return 0;
  });
}

/**
 * App.onLaunch 调用：记 visit；若从分享卡片进入，补记 share_open。
 * @param {Object} [options] wx 启动参数（含 scene / query / path）
 */
function launch(options) {
  var opts = options || {};
  event('visit', { scene: String(opts.scene == null ? '' : opts.scene) });
  if (isShareScene(opts.scene)) {
    // 记下时间：紧接着的 onShow 会再拿到一次同样的启动参数，5 秒内不重复记
    _lastShareOpenAt = Date.now();
    event('share_open', { scene: String(opts.scene) });
  }
  flushSoon();
}

/**
 * App.onShow 调用：热启动从分享卡片进入时补记 share_open（同一场景 5 秒内只记一次，防重复）。
 * @param {Object} [options]
 */
function onShow(options) {
  var opts = options || {};
  if (isShareScene(opts.scene)) {
    var now = Date.now();
    if (now - _lastShareOpenAt > 5000) {
      _lastShareOpenAt = now;
      event('share_open', { scene: String(opts.scene) });
    }
  }
  flush();
}

/** 是否「从分享卡片进入」的启动场景 */
function isShareScene(scene) {
  return !!SHARE_SCENES[parseInt(scene, 10)];
}

module.exports = {
  event: event,
  flush: flush,
  flushSoon: flushSoon,
  launch: launch,
  onShow: onShow,
  isShareScene: isShareScene,
  enabled: enabled,
  EVENTS: EVENTS,
  SHARE_SCENES: SHARE_SCENES,
  QUEUE_KEY: QUEUE_KEY,
  MAX_QUEUE: MAX_QUEUE,
  BATCH: BATCH,
  // 测试用：重置环境缓存 / 强制开关
  _resetEnabledCache: function () { _enabled = null; },
  _resetForTest: function () {
    _enabled = null;
    _lastShareOpenAt = 0;
    flushing = false;
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  }
};
