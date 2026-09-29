/**
 * utils/rel-time.js —— 相对时间文案（2026-09-29）
 *
 * 用途：管理端用户列表的「注册 / 最近上报」。
 *   原来直接显示服务端返回的时间戳（如 2026-09-29T01:23:45.000Z），
 *   一眼看不出「这个人是新用户还是三天没来了」——运营要靠相对时间判断流失。
 *
 * 设计要点（都是踩过的坑）：
 *   1. iOS 的 `new Date('2026-09-29 01:23:45')` 返回 Invalid Date —— 必须把空格换成 `T`；
 *   2. 服务端时钟可能比手机快一点点 → 未来时间一律显示「刚刚」，不显示「-3 分钟前」；
 *   3. 超过 30 天不再说「N 天前」（「412 天前」没人会心算），改显示日期。
 *
 * 纯函数（now 可注入），有单测：tests/unit/rel-time.test.js
 */
'use strict';

var MINUTE = 60 * 1000;
var HOUR = 60 * MINUTE;
var DAY = 24 * HOUR;
var DAYS_TO_DATE = 30;   // 超过这个天数改用日期显示

/**
 * 各种时间输入 → 毫秒时间戳（无效返回 NaN）。
 * @param {Date|number|string} input
 * @returns {number}
 */
function toMs(input) {
  if (input === null || input === undefined || input === '') return NaN;
  if (input instanceof Date) return input.getTime();
  if (typeof input === 'number') {
    // 秒级时间戳（10 位）与毫秒级（13 位）都容错
    return input > 1e11 ? input : input * 1000;
  }
  var s = String(input).trim();
  if (!s) return NaN;
  // iOS 不认 'YYYY-MM-DD HH:mm:ss'，换成分隔符 'T'
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  return new Date(s).getTime();
}

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/** 绝对日期：同年显示 MM-DD，跨年显示 YYYY-MM-DD */
function ymd(ms, nowMs) {
  var d = new Date(ms);
  var n = new Date(nowMs);
  var md = pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  if (d.getFullYear() === n.getFullYear()) return md;
  return d.getFullYear() + '-' + md;
}

/**
 * 相对时间文案。
 * @param {Date|number|string} input 目标时间
 * @param {number} [nowMs] 当前时间（毫秒；缺省取本机时间，单测可注入）
 * @returns {string} '刚刚' / 'N 分钟前' / 'N 小时前' / 'N 天前' / 'MM-DD' / ''（无效输入）
 */
function relTime(input, nowMs) {
  var ms = toMs(input);
  if (!isFinite(ms)) return '';
  var now = (nowMs === undefined || nowMs === null || !isFinite(Number(nowMs)))
    ? Date.now() : Number(nowMs);
  var diff = now - ms;
  if (diff < 0) diff = 0;                       // 时钟偏差 → 当作刚刚
  if (diff < MINUTE) return '刚刚';
  if (diff < HOUR) return Math.floor(diff / MINUTE) + ' 分钟前';
  if (diff < DAY) return Math.floor(diff / HOUR) + ' 小时前';
  if (diff < DAYS_TO_DATE * DAY) return Math.floor(diff / DAY) + ' 天前';
  return ymd(ms, now);
}

module.exports = {
  toMs: toMs,
  relTime: relTime
};
