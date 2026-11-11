/**
 * game/memory-grid.js —— 记忆矩阵引擎（纯逻辑，无 wx 依赖，可单测）
 *
 * 玩法：5×5 网格随机亮起若干格，亮约一秒多后熄灭，凭记忆把刚才亮过的格子点出来。
 * 每过一关多亮一格、展示时间更短 —— 纯程序生成，不需要关卡素材。
 */

'use strict';

var GRID = 25;          // 5×5
var MAX_TARGETS = 8;    // 单关最多亮几格（再多人眼也记不住）

/**
 * 第 level 关要亮几格（第 1 关 3 格，逐关 +1，封顶 8）。
 * @param {number} level 关卡序号（1 起）
 * @returns {number}
 */
function targetCount(level) {
  return Math.min(MAX_TARGETS, 2 + Math.max(1, level));
}

/**
 * 第 level 关的展示时长（毫秒）：逐关缩短，最快不低于 650ms。
 * @param {number} level 关卡序号（1 起）
 * @returns {number}
 */
function showMs(level) {
  return Math.max(650, 1500 - (Math.max(1, level) - 1) * 110);
}

/**
 * 从 0..total-1 里随机挑 count 个不重复的下标。
 * @param {number} count 需要的格子数
 * @param {number} [total=GRID] 格子总数
 * @param {Function} [random] 随机源（默认 Math.random，单测可注入）
 * @returns {number[]} 升序下标数组
 */
function pickTargets(count, total, random) {
  var n = total || GRID;
  var rnd = random || Math.random;
  var k = Math.max(0, Math.min(count, n));
  var pool = [];
  for (var i = 0; i < n; i++) pool.push(i);
  var out = [];
  for (var j = 0; j < k; j++) {
    var idx = Math.floor(rnd() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out.sort(function (a, b) { return a - b; });
}

/**
 * 星级：按通过关数。
 * @param {number} cleared 通过的关卡数
 * @returns {number} 0~3
 */
function starsFor(cleared) {
  if (cleared >= 6) return 3;
  if (cleared >= 4) return 2;
  if (cleared >= 2) return 1;
  return 0;
}

module.exports = {
  GRID: GRID,
  MAX_TARGETS: MAX_TARGETS,
  targetCount: targetCount,
  showMs: showMs,
  pickTargets: pickTargets,
  starsFor: starsFor
};
