'use strict';

/**
 * server/track-events.js —— 埋点事件的校验与规范化（纯函数，可单测）
 *
 * 背景（2026-11-11 用户拍板「发布后第一件事：搭最小数据回路」）：
 *   现在所有迭代决策都靠内部审查和拍板，没有用户行为数据。先只埋 5 个事件：
 *     · visit      进入小程序（按天去重，服务端据此算 DAU / 次日回访）
 *     · game_start 开始一局（level / puzzle-level 页跳转前上报）
 *     · game_end   打完一局（play-report 统一上报处，与服务端成绩同源）
 *     · share_open 从分享卡片进入（启动场景 1007/1008/1044，不需要改分享路径）
 *     · d1_return  次日回访（**服务端派生**：当天有 visit 且前一天也有 visit 时写入，客户端不上报）
 *
 * 设计取向：
 *   - 只记「行为」，不记任何内容正文/昵称/头像（隐私最小化）；
 *   - 客户端时间只作参考（离线队列会延迟上报），超出 ±3 天一律用服务端时间；
 *   - 所有字符串截断、数值夹取，坏数据进不了库（埋点接口不能成为注入面）。
 */

const T = require('./beijing-time');

/** 客户端可上报的事件（d1_return 只由服务端派生，不接受客户端伪造） */
const CLIENT_EVENTS = ['visit', 'game_start', 'game_end', 'share_open'];

/** 服务端派生事件 */
const SERVER_EVENTS = ['d1_return'];

const ALL_EVENTS = CLIENT_EVENTS.concat(SERVER_EVENTS);

/** 单次请求最多带多少条（客户端按 20 条一批发；防超大 body） */
const MAX_BATCH = 20;

/** 字段上限（与 ensure-tables.js 的 DDL 一致，改这里要同步 DDL） */
const LIMITS = {
  gameType: 24,
  grade: 16,
  scene: 32,
  payload: 200
};

/** 一天只记一次的事件（其余事件按次计数） */
const DAILY_ONCE = ['visit'];

function isClientEvent(name) {
  return CLIENT_EVENTS.indexOf(String(name || '')) !== -1;
}

function isServerEvent(name) {
  return SERVER_EVENTS.indexOf(String(name || '')) !== -1;
}

/**
 * 昨天是否需要补记「次日回访」。
 * @param {boolean} hadYesterdayVisit 前一天是否有 visit
 * @param {boolean} alreadyToday 今天是否已记过 d1_return
 * @returns {boolean}
 */
function shouldEmitD1(hadYesterdayVisit, alreadyToday) {
  return !!hadYesterdayVisit && !alreadyToday;
}

/** 清字符串：去控制字符 / 首尾空白 / 截断 */
function cleanText(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

/** 收整数：非法 → 默认值；越界 → 夹取 */
function cleanInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (!isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/**
 * 规范化单条事件。非法（未知事件 / 非对象）返回 null。
 * @param {Object} body 客户端上报的单个事件
 * @param {number} [now] 当前时间（毫秒，便于单测注入）
 * @returns {Object|null}
 */
function normalize(body, now) {
  if (!body || typeof body !== 'object') return null;
  const event = String(body.event || '');
  if (!isClientEvent(event)) return null;

  const nowMs = Number(now) || Date.now();
  let at = Number(body.at) || 0;
  // 客户端时间只作参考：离线队列可能隔天才补发；误差超 ±3 天直接忽略
  if (!at || Math.abs(at - nowMs) > 3 * 24 * 3600 * 1000) at = nowMs;

  const gameType = cleanText(body.game_type, LIMITS.gameType);
  // 玩法 key 只允许小写 snake_case（与 /api/score 同一口径），非法就置空而不是整条丢弃
  return {
    event: event,
    at: at,
    game_type: /^[a-z0-9_]{1,24}$/.test(gameType) ? gameType : '',
    grade: cleanText(body.grade, LIMITS.grade),
    level: cleanInt(body.level, 0, 9999, 0),
    scene: cleanText(body.scene, LIMITS.scene),
    stars: cleanInt(body.stars, 0, 3, 0),
    win: cleanInt(body.win, 0, 1, 0),
    duration_ms: cleanInt(body.duration_ms, 0, 3600000, 0),
    payload: cleanText(body.payload, LIMITS.payload)
  };
}

/**
 * 规范化一批事件（最多 MAX_BATCH 条，非法条目直接丢弃）。
 * @param {Object} body 请求体 { events: [...] }
 * @param {number} [now]
 * @returns {Object[]}
 */
function normalizeBatch(body, now) {
  if (!body || !Array.isArray(body.events)) return [];
  const out = [];
  for (let i = 0; i < body.events.length && out.length < MAX_BATCH; i++) {
    const ev = normalize(body.events[i], now);
    if (ev) out.push(ev);
  }
  return out;
}

/** 事件所属的北京时间自然日（'YYYY-MM-DD'） */
function dayOf(ts) {
  return T.todayKey(ts);
}

/** 该事件是否「一天只记一次」 */
function isDailyOnce(event) {
  return DAILY_ONCE.indexOf(String(event || '')) !== -1;
}

module.exports = {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  ALL_EVENTS,
  MAX_BATCH,
  LIMITS,
  DAILY_ONCE,
  isClientEvent,
  isServerEvent,
  isDailyOnce,
  shouldEmitD1,
  normalize,
  normalizeBatch,
  dayOf,
  cleanText,
  cleanInt
};
