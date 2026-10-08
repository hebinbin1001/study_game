/**
 * server/beijing-time.js —— 东八区时间口径（纯函数，可单测）
 *
 * 为什么单独抽出来：
 *   「每日挑战」「赛季」都是按**自然日/自然月**切分的玩法，而容器时区是 UTC。
 *   如果直接用 `new Date().toISOString().split('T')[0]`，北京时间 00:00~08:00 之间的
 *   操作会被算到前一天，玩家会看到「今天已经打过卡 / 赛季还没切换」这类错乱。
 *
 * 本模块统一按 **UTC+8** 计算「今天」和「赛季边界」，不依赖服务器本地时区。
 * 纯函数、无 wx / 无 DB 依赖，可直接单测。
 */
'use strict';

var HOUR = 3600 * 1000;
var BEIJING_OFFSET = 8 * HOUR;

/** 赛季长度：2 个自然月一季（1-2 月、3-4 月、…、11-12 月） */
var SEASON_MONTHS = 2;
var SEASON_CN = ['一', '二', '三', '四', '五', '六'];

/** 号码补零 */
function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * 取「北京时间」的年月日时分秒。
 * @param {Date|number|string} [date] 默认当前时间
 * @returns {{y:number,m:number,d:number,hh:number,mm:number,ss:number}} m 为 0~11
 */
function beijingParts(date) {
  var t = date === undefined || date === null ? Date.now() : new Date(date).getTime();
  var d = new Date(t + BEIJING_OFFSET);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(),
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    ss: d.getUTCSeconds()
  };
}

/**
 * 北京时间的「今天」，形如 '2026-10-08'。
 * @param {Date|number|string} [date]
 * @returns {string}
 */
function todayKey(date) {
  var p = beijingParts(date);
  return p.y + '-' + pad2(p.m + 1) + '-' + pad2(p.d);
}

/** 由北京时间的年月日构造对应的 UTC 时间点（当天 00:00 北京时间） */
function beijingMidnightUtc(y, m, d) {
  return new Date(Date.UTC(y, m, d) - BEIJING_OFFSET);
}

/**
 * 判断是否为合法赛季 key（形如 '2026-S5'）。
 * @param {string} key
 * @returns {boolean}
 */
function isSeasonKey(key) {
  return /^\d{4}-S[1-6]$/.test(String(key || ''));
}

/**
 * 某个时间点所属赛季。
 * @param {Date|number|string} [date]
 * @returns {{key:string,index:number,year:number,name:string,start:Date,endExclusive:Date}}
 */
function seasonOf(date) {
  var p = beijingParts(date);
  var idx = Math.floor(p.m / SEASON_MONTHS); // 0..5
  return seasonAt(p.y, idx);
}

/** 由年 + 赛季下标（0~5）构造赛季对象 */
function seasonAt(year, idx) {
  var safeIdx = Math.max(0, Math.min(5, parseInt(idx, 10) || 0));
  var startMonth = safeIdx * SEASON_MONTHS;
  var start = beijingMidnightUtc(year, startMonth, 1);
  var endExclusive = beijingMidnightUtc(year, startMonth + SEASON_MONTHS, 1);
  return {
    key: year + '-S' + (safeIdx + 1),
    index: safeIdx + 1,
    year: year,
    name: year + ' 赛季' + SEASON_CN[safeIdx],
    start: start,
    endExclusive: endExclusive
  };
}

/**
 * 由赛季 key 还原赛季对象（起止时间）。非法 key 返回 null。
 * @param {string} key 形如 '2026-S5'
 * @returns {Object|null}
 */
function seasonOfKey(key) {
  if (!isSeasonKey(key)) return null;
  var m = /^(\d{4})-S([1-6])$/.exec(key);
  return seasonAt(parseInt(m[1], 10), parseInt(m[2], 10) - 1);
}

/**
 * 上一个赛季（用于「上赛季奖励领取」）。
 * @param {Date|number|string} [date]
 * @returns {Object}
 */
function prevSeasonOf(date) {
  var cur = seasonOf(date);
  if (cur.index > 1) return seasonAt(cur.year, cur.index - 2);
  return seasonAt(cur.year - 1, 5);
}

/**
 * 距离本赛季结束还有几天（向上取整，最少 0）。
 * @param {Date|number|string} [date]
 * @returns {number}
 */
function daysLeftInSeason(date) {
  var now = date === undefined || date === null ? Date.now() : new Date(date).getTime();
  var s = seasonOf(now);
  var left = s.endExclusive.getTime() - now;
  if (left <= 0) return 0;
  return Math.ceil(left / (24 * HOUR));
}

module.exports = {
  BEIJING_OFFSET: BEIJING_OFFSET,
  SEASON_MONTHS: SEASON_MONTHS,
  beijingParts: beijingParts,
  todayKey: todayKey,
  isSeasonKey: isSeasonKey,
  seasonOf: seasonOf,
  seasonAt: seasonAt,
  seasonOfKey: seasonOfKey,
  prevSeasonOf: prevSeasonOf,
  daysLeftInSeason: daysLeftInSeason
};
