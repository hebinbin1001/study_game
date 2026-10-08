/**
 * utils/day-key.js —— 东八区「今天」（与 server/beijing-time.js 的 todayKey 同一口径）
 *
 * 为什么端上也要有一份：
 *   「每日挑战」的日期既要显示在页面上，也要作为出题种子的输入。服务端接口可能因为
 *   网络/降级拿不到（此时页面仍要显示「今天是几号」），所以端上先本地算一份兜底；
 *   接口返回后以服务端为准覆盖（两边算法一致，正常情况下结果相同）。
 *
 * 不依赖手机时区：一律按 UTC+8 计算，避免用户手机时区设成别的地区时「日期对不上」。
 */
'use strict';

var OFFSET = 8 * 3600 * 1000;

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

/**
 * 东八区今天，形如 '2026-10-08'。
 * @param {Date|number|string} [date] 默认当前时间
 * @returns {string}
 */
function todayKey(date) {
  var t = date === undefined || date === null ? Date.now() : new Date(date).getTime();
  var d = new Date(t + OFFSET);
  return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
}

module.exports = { todayKey: todayKey };
