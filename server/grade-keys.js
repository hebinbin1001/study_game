/**
 * server/grade-keys.js —— 学段 key 白名单（服务端校验用）
 *
 * 与前端 miniprogram/utils/constants.js 的 GRADES 一一对应。
 * 两份清单由 `tests/unit/grade-keys-parity.test.js` 守着，新增学段忘改一边会判红。
 */
'use strict';

var GRADE_KEYS = [
  'kg',
  'g1', 'g2', 'g3', 'g4', 'g5', 'g6',
  'g7', 'g8', 'g9',
  'g10', 'g11', 'g12',
  'college'
];

function isValidGrade(key) {
  return GRADE_KEYS.indexOf(String(key || '')) >= 0;
}

module.exports = { GRADE_KEYS: GRADE_KEYS, isValidGrade: isValidGrade };
