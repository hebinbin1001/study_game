/**
 * game/tw2048.js —— 2048 引擎（B6-3）
 *
 * 职责：
 *   1. newBoard()：4×4 空板 + 随机两格 2
 *   2. slide(board, dir)：向 dir(0上/1右/2下/3左) 滑动合并，返回 {moved,score,changed}
 *   3. hasTarget(board, t)：是否已合成目标
 *   4. canMove(board)：是否还能动（步尽判定用）
 * 纯本地无依赖。
 */

'use strict';

var N = 4;

function newBoard() {
  var b = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0]
  ];
  spawn(b);
  spawn(b);
  return b;
}

function emptyCells(b) {
  var out = [];
  for (var r = 0; r < N; r++) {
    for (var c = 0; c < N; c++) {
      if (b[r][c] === 0) out.push([r, c]);
    }
  }
  return out;
}

function spawn(b) {
  var empty = emptyCells(b);
  if (!empty.length) return;
  var idx = Math.floor(Math.random() * empty.length);
  var cell = empty[idx];
  b[cell[0]][cell[1]] = Math.random() < 0.9 ? 2 : 4;
}

/**
 * 单向压缩 + 合并（从左向右）。返回 { line, moved, gained }
 */
function compress(line) {
  var vals = line.filter(function (v) { return v !== 0; });
  var out = [];
  var gained = 0;
  for (var i = 0; i < vals.length; i++) {
    if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
      var merged = vals[i] * 2;
      out.push(merged);
      gained += merged;
      i++;
    } else {
      out.push(vals[i]);
    }
  }
  while (out.length < N) out.push(0);
  return { out: out, gained: gained };
}

function boardFromCols(cols) {
  var b = [];
  for (var r = 0; r < N; r++) {
    b.push(cols.map(function (col) { return col[r]; }));
  }
  return b;
}

function boardFromRows(rows) {
  return rows.map(function (r) { return r.slice(); });
}

/**
 * 滑动。dir: 0=上 1=右 2=下 3=左
 * @returns {{ board, moved, gained, gameover }}
 */
function slide(board, dir) {
  var moved = false;
  var gained = 0;

  if (dir === 0 || dir === 2) { // 上下：按列处理
    var cols = [];
    for (var c = 0; c < N; c++) {
      var col = [];
      for (var r = 0; r < N; r++) col.push(board[r][c]);
      if (dir === 2) col.reverse(); // 下 → 从左到右处理后反转回
      var res = compress(col);
      var newCol = (dir === 2) ? res.out.slice().reverse() : res.out;
      cols.push(newCol);
      gained += res.gained;
      for (var rr = 0; rr < N; rr++) {
        if (board[rr][c] !== newCol[rr]) moved = true;
      }
    }
    board = boardFromCols(cols);
  } else { // 左右：按行处理
    var rows = [];
    for (var r2 = 0; r2 < N; r2++) {
      var row = board[r2].slice();
      if (dir === 1) row.reverse(); // 右 → 从左到右处理后反转
      var res2 = compress(row);
      var newRow = (dir === 1) ? res2.out.slice().reverse() : res2.out;
      rows.push(newRow);
      gained += res2.gained;
      for (var cc = 0; cc < N; cc++) {
        if (board[r2][cc] !== newRow[cc]) moved = true;
      }
    }
    board = boardFromRows(rows);
  }

  if (moved) spawn(board);
  var canMoveMore = canMove(board);
  return { board: board, moved: moved, gained: gained, gameover: !canMoveMore };
}

function canMove(b) {
  for (var r = 0; r < N; r++) {
    for (var c = 0; c < N; c++) {
      var v = b[r][c];
      if (v === 0) return true;
      if (c + 1 < N && b[r][c + 1] === v) return true;
      if (r + 1 < N && b[r + 1][c] === v) return true;
    }
  }
  return false;
}

function hasTarget(b, t) {
  for (var r = 0; r < N; r++) {
    for (var c = 0; c < N; c++) {
      if (b[r][c] >= t) return true;
    }
  }
  return false;
}

module.exports = {
  N: N,
  newBoard: newBoard,
  slide: slide,
  canMove: canMove,
  hasTarget: hasTarget
};
