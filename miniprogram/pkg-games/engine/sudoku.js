/**
 * game/sudoku.js —— 数独引擎（B6）
 *
 * 职责：
 *   1. newBoard(n)：生成 n×n 标准数独终盘（4×4/6×6/9×9；子格 2×2 / 2×3 / 3×3）
 *   2. dig(board, givens)：按目标给定数挖空（保证唯一解）
 *   3. solve(board)：回溯求解（返回所有解前 2 个，用于唯一性判定）
 *   4. 提供行列/宫校验所需常量
 *
 * 生成策略：随机填充一条合法终盘（回溯 + 洗牌），再挖洞；
 * 挖洞用「去掉一个数字后唯一解是否保持」判断，保唯一解。
 *
 * 纯本地无依赖，UI 层（pages/sudoku）消费。
 */

'use strict';

function makeBoxes(n) {
  if (n === 4) return { br: 2, bc: 2 };
  if (n === 6) return { br: 2, bc: 3 };
  return { br: 3, bc: 3 }; // 9
}

/** 随机洗牌 */
function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/**
 * 回溯填充 n×n 合法终盘。
 * @returns {Array<Array<number>>|null} 失败返回 null
 */
function fillSolved(n) {
  var box = makeBoxes(n);
  var board = [];
  for (var i = 0; i < n; i++) board.push(new Array(n).fill(0));

  function valid(r, c, v) {
    for (var k = 0; k < n; k++) {
      if (board[r][k] === v || board[k][c] === v) return false;
    }
    var rr = Math.floor(r / box.br) * box.br;
    var cc = Math.floor(c / box.bc) * box.bc;
    for (var i = rr; i < rr + box.br; i++) {
      for (var j = cc; j < cc + box.bc; j++) {
        if (board[i][j] === v) return false;
      }
    }
    return true;
  }

  function solve(pos) {
    if (pos >= n * n) return true;
    var r = Math.floor(pos / n);
    var c = pos % n;
    if (board[r][c] !== 0) return solve(pos + 1);
    var order = shuffle(Array.from({ length: n }, function (_, i) { return i + 1; }));
    for (var k = 0; k < order.length; k++) {
      var v = order[k];
      if (valid(r, c, v)) {
        board[r][c] = v;
        if (solve(pos + 1)) return true;
        board[r][c] = 0;
      }
    }
    return false;
  }

  return solve(0) ? board : null;
}

/**
 * 统计解的个数（>1 即非唯一）。
 */
function countSolutions(board, limit) {
  var n = board.length;
  var box = makeBoxes(n);
  var count = 0;

  function valid(r, c, v) {
    for (var k = 0; k < n; k++) {
      if (board[r][k] === v || board[k][c] === v) return false;
    }
    var rr = Math.floor(r / box.br) * box.br;
    var cc = Math.floor(c / box.bc) * box.bc;
    for (var i = rr; i < rr + box.br; i++) {
      for (var j = cc; j < cc + box.bc; j++) {
        if (board[i][j] === v) return false;
      }
    }
    return true;
  }

  function walk(pos) {
    if (count >= limit) return;
    if (pos >= n * n) { count++; return; }
    var r = Math.floor(pos / n);
    var c = pos % n;
    if (board[r][c] !== 0) { walk(pos + 1); return; }
    for (var v = 1; v <= n; v++) {
      if (valid(r, c, v)) {
        board[r][c] = v;
        walk(pos + 1);
        board[r][c] = 0;
        if (count >= limit) return;
      }
    }
  }
  walk(0);
  return count;
}

/**
 * 挖洞到目标给定数，保证唯一解。
 * @param {Array<Array<number>>} solved 合法终盘
 * @param {number} givenCount 期望保留的给定数（cell 数）
 */
function dig(solved, givenCount) {
  var n = solved.length;
  var board = solved.map(function (r) { return r.slice(); });
  var total = n * n;
  var cells = shuffle(Array.from({ length: total }, function (_, i) { return i; }));
  var filled = total;

  for (var k = 0; k < cells.length && filled > givenCount; k++) {
    var idx = cells[k];
    var r = Math.floor(idx / n);
    var c = idx % n;
    var backup = board[r][c];
    if (backup === 0) continue;
    board[r][c] = 0;
    if (countSolutions(board, 2) === 1) {
      filled--; // 保持唯一解，可继续挖
    } else {
      board[r][c] = backup; // 移除会多解 → 保留
    }
  }
  return board;
}

/**
 * 生成一张数独题目。
 * @param {number} n 阶数 4/6/9
 * @param {number} given 期望给定数字数
 * @returns {{ puzzle: Array<Array<number>>, answer: Array<Array<number>> }}
 */
function generate(n, given) {
  var solved = fillSolved(n);
  if (!solved) return null;
  var puzzle = dig(solved, given);
  return {
    puzzle: puzzle,
    answer: solved.map(function (r) { return r.slice(); })
  };
}

module.exports = {
  generate: generate,
  countSolutions: countSolutions,
  fillSolved: fillSolved,
  makeBoxes: makeBoxes,
  shuffle: shuffle
};
