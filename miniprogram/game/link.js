/**
 * game/link.js —— 连连看路径判定（B6-5）
 *
 * 规则：网格里点两张卡，若「两点连线不超过 2 次转弯」且路径不穿过其他卡则可连。
 * 本实现支持通用 R×C 网格（demo 用 4×4，词↔义 8 对）。
 * pure 函数，页面负责出题与状态。
 */

'use strict';

/**
 * 判定 (r1,c1)->(r2,c2) 是否可连（≤2 弯、无障碍）。
 * @param {Array<Array<number>>} grid 0=空格/1=有卡
 * @param {number} r1 c1 r2 c2 网格坐标
 */
function canConnect(grid, r1, c1, r2, c2) {
  if (r1 === r2 && c1 === c2) return false;
  var rows = grid.length;
  var cols = grid[0].length;

  function empty(r, c) {
    // 视为边缘外一格恒空（绕行允许走盘外）
    if (r < 0 || r >= rows || c < 0 || c >= cols) return true;
    return grid[r][c] === 0;
  }

  // 1) 同一直线无障碍（0 弯）
  if (straightEmpty(r1, c1, r2, c2)) return true;

  // 2) 1 弯：经 (r1,c2) 或 (r2,c1)
  if (empty(r1, c2) && straightEmpty(r1, c1, r1, c2) && straightEmpty(r1, c2, r2, c2)) return true;
  if (empty(r2, c1) && straightEmpty(r1, c1, r2, c1) && straightEmpty(r2, c1, r2, c2)) return true;

  // 3) 2 弯：先横走一行，再竖，再横；遍历中间行/列
  //    形式一： (r1,c1) -> (k,c1) -> (k,c2) -> (r2,c2)
  for (var k = -1; k <= rows; k++) {
    if (empty(k, c1) && empty(k, c2)) {
      if (straightEmpty(r1, c1, k, c1) && straightEmpty(k, c1, k, c2) && straightEmpty(k, c2, r2, c2)) {
        return true;
      }
    }
  }
  //    形式二： (r1,c1) -> (r1,k) -> (r2,k) -> (r2,c2)
  for (var m = -1; m <= cols; m++) {
    if (empty(r1, m) && empty(r2, m)) {
      if (straightEmpty(r1, c1, r1, m) && straightEmpty(r1, m, r2, m) && straightEmpty(r2, m, r2, c2)) {
        return true;
      }
    }
  }
  return false;

  function straightEmpty(a1, b1, a2, b2) {
    // 判断从 (a1,b1) 到 (a2,b2) 中间（不含两端对应卡格本身路径中间格）全空。
    // 若同行：检查列区间内非端点的格为空
    if (a1 === a2) {
      var lo = Math.min(b1, b2), hi = Math.max(b1, b2);
      for (var c = lo + 1; c < hi; c++) {
        if (!empty(a1, c)) return false;
      }
      return true;
    }
    if (b1 === b2) {
      var lo2 = Math.min(a1, a2), hi2 = Math.max(a1, a2);
      for (var r = lo2 + 1; r < hi2; r++) {
        if (!empty(r, b1)) return false;
      }
      return true;
    }
    return false;
  }
}

module.exports = { canConnect: canConnect };
