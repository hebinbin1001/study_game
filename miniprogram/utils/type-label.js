/**
 * utils/type-label.js —— 类型码 → 玩家能看懂的中文名
 *
 * 为什么单独抽出来：
 *   w1 / c1 / match 这些是内部类型码，只适合存档和上报，不该直接展示给用户。
 *   学习报告的「薄弱题型」、错题本的类型徽标、错题复习页都共用这一份映射，
 *   避免各页自己写一套后出现「报告里是 match、错题本里是词义消消乐」。
 */

'use strict';

var constants = require('./constants');

// 玩法上报的 game_type / 错题来源，不属于词库 8 类型码
var GAME_LABELS = {
  match: '词义消消乐',
  link: '词语连连看',
  idiom: '成语拼字',
  word_build: '字母拼词',
  wordbuild: '字母拼词',
  snake: '单词贪吃蛇',
  quiz: '限时抢答',
  shoot: '字母射击',
  word_warrior: '字母射击',
  math24: '算 24 点',
  sprint: '口算冲刺',
  balance: '算式天平',
  g2048: '2048',
  memory: '记忆矩阵',
  onestroke: '一笔画',
  klotski: '华容道'
};

/**
 * @param {string} type 类型码（w1/c1/match…）
 * @returns {string} 中文名；未知码原样返回，空值显示「其他」
 */
function labelOf(type) {
  var t = String(type == null ? '' : type).trim();
  if (!t) return '其他';
  if (constants.TYPES[t]) return constants.TYPES[t].name;
  if (GAME_LABELS[t]) return GAME_LABELS[t];
  return t;
}

module.exports = { labelOf: labelOf };
