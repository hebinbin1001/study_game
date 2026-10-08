/**
 * server/score-formula.js —— 展示用分数公式（每日挑战 / 好友 PK 共用）
 *
 * 设计要点：**答对数是主权重，速度只是尾数**。
 * 每答对一题 +100，速度奖励封顶 99 —— 这样「少答对一题但快很多」永远追不回来
 * （99 < 100），不会出现「9 题比 10 题分高」的观感问题。
 * 速度奖励在 0~180 秒之间线性衰减到 0。
 *
 * 注意：这两个玩法最终的排名/胜负**不依赖这个分数** ——
 *   每日挑战按 (correct DESC, durationMs ASC) 排；
 *   好友 PK 按正确率、再按用时判。
 * 分数只用于端上展示与快速比较。
 */
'use strict';

var SPEED_MAX = 99;
var SPEED_WINDOW_SEC = 180;

/**
 * @param {number} correct 答对题数
 * @param {number} ms 用时（毫秒）
 * @returns {number} 展示用分数
 */
function displayScore(correct, ms) {
  var c = Math.max(0, parseInt(correct, 10) || 0);
  var m = Math.max(0, parseInt(ms, 10) || 0);
  var sec = Math.floor(m / 1000);
  var bonus = Math.max(0, SPEED_MAX - Math.floor((sec * SPEED_MAX) / SPEED_WINDOW_SEC));
  return c * 100 + bonus;
}

module.exports = { displayScore: displayScore, SPEED_MAX: SPEED_MAX, SPEED_WINDOW_SEC: SPEED_WINDOW_SEC };
