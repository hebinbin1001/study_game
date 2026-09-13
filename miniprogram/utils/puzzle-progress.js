/**
 * 数字智力类的关卡进度（第三批 · 第 4 条）
 *
 * 为什么要单独的进度表：题库类玩法的进度存在 ww_stars（星级），而数字智力类
 * 各页原来各存各的（sudoku 的 unlockedMax、g2048 的 ww_g2048_cur …），
 * 关卡页要统一展示「已通关到第几关 / 下一关是哪关」，所以统一收口到这里。
 *
 * 存储结构（ww_puzzle_progress）：
 *   { <玩法key>: { cleared: { <关号>: 1 }, bestMs: { <关号>: 毫秒 } } }
 *   · cleared：已通关的关号（只记是否通关，不记星级——数字智力类不按正确率折星）
 *   · bestMs ：该关最短用时（2048 等计时玩法用；用户 2026-09-13 要求每关显示最短时间）
 */
'use strict';

var storage = require('./storage');

var KEY = 'ww_puzzle_progress';

function all() {
  var v = storage.get(KEY);
  return (v && typeof v === 'object') ? v : {};
}

function entryOf(key) {
  var a = all();
  var e = a[String(key || '')];
  return (e && typeof e === 'object') ? e : { cleared: {}, bestMs: {} };
}

/** 标记某关已通关（只增不减；重复调用安全） */
function markCleared(key, no) {
  var k = String(key || '');
  var n = parseInt(no, 10);
  if (!k || !(n >= 1)) return false;
  var a = all();
  if (!a[k] || typeof a[k] !== 'object') a[k] = { cleared: {}, bestMs: {} };
  if (!a[k].cleared || typeof a[k].cleared !== 'object') a[k].cleared = {};
  if (!a[k].bestMs || typeof a[k].bestMs !== 'object') a[k].bestMs = {};
  if (a[k].cleared[n]) return false;         // 已记过，不重复写盘
  a[k].cleared[n] = 1;
  storage.set(KEY, a);
  return true;
}

/** 已通关的关号集合（对象：关号 → 1） */
function clearedOf(key) {
  return entryOf(key).cleared || {};
}

/** 已通关的最大关号（一关没通返回 0） */
function maxCleared(key) {
  var c = clearedOf(key);
  var max = 0;
  Object.keys(c).forEach(function (n) {
    var v = parseInt(n, 10) || 0;
    if (v > max) max = v;
  });
  return max;
}

/** 下一关（一关没通 = 第 1 关） */
function nextOf(key) {
  return maxCleared(key) + 1;
}

/**
 * 记录某关用时，只在刷新纪录时写盘。
 * @returns {boolean} 是否刷了新纪录（调用方据此提示「新纪录」）
 */
function setBestMs(key, no, ms) {
  var k = String(key || '');
  var n = parseInt(no, 10);
  var t = parseInt(ms, 10);
  if (!k || !(n >= 1) || !(t > 0)) return false;
  var a = all();
  if (!a[k] || typeof a[k] !== 'object') a[k] = { cleared: {}, bestMs: {} };
  if (!a[k].bestMs || typeof a[k].bestMs !== 'object') a[k].bestMs = {};
  var prev = parseInt(a[k].bestMs[n], 10) || 0;
  if (prev && prev <= t) return false;
  a[k].bestMs[n] = t;
  storage.set(KEY, a);
  return true;
}

/** 某关最短用时（毫秒；没记录返回 0） */
function bestMsOf(key, no) {
  var m = entryOf(key).bestMs || {};
  return parseInt(m[parseInt(no, 10)], 10) || 0;
}

/** 清空（测试用） */
function clear() {
  storage.set(KEY, {});
}

module.exports = {
  KEY: KEY,
  markCleared: markCleared,
  clearedOf: clearedOf,
  maxCleared: maxCleared,
  nextOf: nextOf,
  setBestMs: setBestMs,
  bestMsOf: bestMsOf,
  clear: clear
};
