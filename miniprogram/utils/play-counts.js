/**
 * 本机「各玩法玩了多少局」计数（2026-09-13）
 *
 * 用途：首页「推荐玩法」不再写死两张卡，改成展示**本机玩得最多**的两款玩法。
 * 为什么要本机计数而不是拉服务端：游客也要能用（游客没有 openid，服务端没数据），
 * 而且这个推荐纯属顺手推荐，不需要跨设备同步。
 *
 * 计数口径：一局**打完**才算一局（由 play-report 上报处 / 结算页触发），点开页面不算，
 *          避免「点进去看一眼」把推荐顶偏。
 *
 * 键名与 utils/game-catalog.js 的 key 对齐（shoot / match / link / wordbuild / idiombuild /
 * snake / sudoku / math24 / memory …）。上报用的 gameType 与页面 key 不同的在这张表里换算。
 */
'use strict';

var storage = require('./storage');

var STORE_KEY = 'ww_play_counts';

/** 上报口径的 gameType → 玩法目录 key */
var GAME_TYPE_TO_KEY = {
  word_warrior: 'shoot',
  word_build: 'wordbuild',
  idiom: 'idiombuild',
  match: 'match',
  link: 'link',
  snake: 'snake',
  sudoku: 'sudoku',
  math24: 'math24',
  memory: 'memory',
  'memory_grid': 'memory',
  sprint: 'sprint',
  'math_sprint': 'sprint',
  balance: 'balance',
  'math_balance': 'balance',
  klotski: 'klotski',
  g2048: 'g2048',
  onestroke: 'onestroke',
  'one_stroke': 'onestroke'
};

/** 全部计数（对象：key → 次数） */
function getAll() {
  var v = storage.get(STORE_KEY);
  return (v && typeof v === 'object') ? v : {};
}

/**
 * 记一局。传 gameType（上报口径）或目录 key 都能认。
 * @returns {string} 实际记到哪个 key；认不出返回空串
 */
function bump(gameTypeOrKey) {
  var raw = String(gameTypeOrKey || '');
  if (!raw) return '';
  var key = GAME_TYPE_TO_KEY[raw] || raw;
  var all = getAll();
  all[key] = (parseInt(all[key], 10) || 0) + 1;
  storage.set(STORE_KEY, all);
  return key;
}

/**
 * 按次数降序取前 n 个玩法 key（只返回有计数的）。
 * @param {number} [n=2] 需要几条；传 0 明确表示「不要」（不再当成默认值）
 * @returns {string[]}
 */
function topKeys(n) {
  var limit = (typeof n === 'number' && n >= 0) ? n : 2;
  var all = getAll();
  var list = Object.keys(all).map(function (k) {
    return { key: k, count: parseInt(all[k], 10) || 0 };
  }).filter(function (it) { return it.count > 0; });
  list.sort(function (a, b) { return b.count - a.count; });
  return list.slice(0, limit).map(function (it) { return it.key; });
}

/** 清空（测试/调试用） */
function clear() {
  storage.set(STORE_KEY, {});
}

module.exports = {
  STORE_KEY: STORE_KEY,
  GAME_TYPE_TO_KEY: GAME_TYPE_TO_KEY,
  getAll: getAll,
  bump: bump,
  topKeys: topKeys,
  clear: clear
};
