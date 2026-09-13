/**
 * game/one-stroke.js —— 一笔画引擎（纯逻辑，无 wx 依赖，可单测）
 *
 * 玩法（来自 demo g8）：每关一张图，每条线只能走一次，把所有线走完即过关；
 * 走错可以撤销一步或重置本关。关卡是固定的 5 张图（三角 → 正方形加对角线 →
 * 小房子 → 双正方形 → 五边形加五角星），每张图都满足"奇点数为 0 或 2"，
 * 因此保证存在一笔画解法（见 __tests__/one-stroke.test.js 的不变量断言）。
 *
 * 页面渲染用「绝对定位的线 + 圆点」（不用 Canvas），坐标由 geometry() 算出，
 * 因此几何计算也可以在 Node 下单测。
 * 关联：pages/one-stroke
 */

'use strict';

/** 关卡：nodes 为 0~100 的相对坐标，edges 为节点下标对 */
var LEVELS = [
  {
    name: '三角形',
    nodes: [[50, 14], [86, 82], [14, 82]],
    edges: [[0, 1], [1, 2], [2, 0]]
  },
  {
    name: '正方形加对角线',
    nodes: [[18, 18], [82, 18], [82, 82], [18, 82]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]
  },
  {
    name: '小房子',
    nodes: [[22, 84], [78, 84], [78, 48], [22, 48], [50, 14]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [2, 4]]
  },
  {
    name: '两个正方形',
    nodes: [[12, 82], [44, 82], [44, 46], [12, 46], [88, 82], [88, 46]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 0], [1, 4], [4, 5], [5, 2]]
  },
  {
    name: '五边形加五角星',
    nodes: [[50, 8], [93, 40], [76, 92], [24, 92], [7, 40]],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 2], [2, 4], [4, 1], [1, 3], [3, 0]]
  }
];

/** 边的唯一 key（无向，下标小在前） */
function edgeKey(a, b) {
  return Math.min(a, b) + '-' + Math.max(a, b);
}

/** 该边是否存在 */
function edgeExists(level, a, b) {
  var k = edgeKey(a, b);
  return (level.edges || []).some(function (e) { return edgeKey(e[0], e[1]) === k; });
}

/** 已走的边数 */
function usedCount(usedEdges) {
  return Object.keys(usedEdges || {}).length;
}

/** 本关是否已走完（所有边走了一次） */
function isLevelClear(level, usedEdges) {
  return usedCount(usedEdges) === (level.edges || []).length;
}

/**
 * 从某点出发还能走几条没用过的边（= 0 表示走到死路）。
 * @returns {number}
 */
function freeCountFrom(level, usedEdges, node) {
  var used = usedEdges || {};
  return (level.edges || []).filter(function (e) {
    if (e[0] !== node && e[1] !== node) return false;
    return !used[edgeKey(e[0], e[1])];
  }).length;
}

/** 这一步能不能走：两点之间有边、且这条边还没走过 */
function canStep(level, usedEdges, from, to) {
  if (from === null || from === undefined || to === null || to === undefined) return false;
  if (from === to) return false;
  if (!edgeExists(level, from, to)) return false;
  return !(usedEdges || {})[edgeKey(from, to)];
}

/**
 * 走一步。走不了则返回 null（页面据此给出提示，不改状态）。
 * @returns {Object|null} 新的 usedEdges
 */
function step(level, usedEdges, from, to) {
  if (!canStep(level, usedEdges, from, to)) return null;
  var next = {};
  var cur = usedEdges || {};
  Object.keys(cur).forEach(function (k) { next[k] = true; });
  next[edgeKey(from, to)] = true;
  return next;
}

/** 撤回一步：把 a→b 这条边标记为未走 */
function unstep(usedEdges, a, b) {
  var next = {};
  var cur = usedEdges || {};
  Object.keys(cur).forEach(function (k) { next[k] = true; });
  delete next[edgeKey(a, b)];
  return next;
}

/** 某点的度数（连了几条线） */
function degreeOf(level, node) {
  return (level.edges || []).filter(function (e) {
    return e[0] === node || e[1] === node;
  }).length;
}

/** 奇点（度数为奇数的点）下标数组 */
function oddNodes(level) {
  var out = [];
  (level.nodes || []).forEach(function (n, i) {
    if (degreeOf(level, i) % 2 === 1) out.push(i);
  });
  return out;
}

/** 图是否连通（从 0 号点出发能否到所有点） */
function isConnected(level) {
  var total = (level.nodes || []).length;
  if (!total) return false;
  var seen = {};
  var stack = [0];
  seen[0] = true;
  while (stack.length) {
    var cur = stack.pop();
    (level.edges || []).forEach(function (e) {
      var nxt = -1;
      if (e[0] === cur) nxt = e[1];
      else if (e[1] === cur) nxt = e[0];
      if (nxt >= 0 && !seen[nxt]) { seen[nxt] = true; stack.push(nxt); }
    });
  }
  return Object.keys(seen).length === total;
}

/**
 * 关卡自检：连通 + 奇点数为 0 或 2（欧拉路径存在条件）。
 * @returns {{ok:boolean, reason:string}}
 */
function validateLevel(level) {
  if (!level || !level.nodes || !level.edges || !level.edges.length) {
    return { ok: false, reason: '关卡数据不完整' };
  }
  var bad = (level.edges || []).filter(function (e) {
    return e[0] < 0 || e[0] >= level.nodes.length || e[1] < 0 || e[1] >= level.nodes.length;
  });
  if (bad.length) return { ok: false, reason: '存在越界边' };
  if (!isConnected(level)) return { ok: false, reason: '图不连通' };
  var odd = oddNodes(level);
  if (odd.length !== 0 && odd.length !== 2) return { ok: false, reason: '奇点数 ' + odd.length + '（应为 0 或 2）' };
  return { ok: true, reason: '' };
}

/**
 * 渲染几何：把 0~100 的相对坐标换算成棋盘上的 rpx 位置。
 * 线用「左上角 + 长度 + 旋转角（度）」表达，配合 CSS transform-origin: 0 50%。
 * @param {Object} level 关卡
 * @param {number} size 棋盘边长（rpx）
 * @returns {{size:number, nodes:Array<{left:number,top:number}>, edges:Array<{key:string,left:number,top:number,len:number,angle:number}>}}
 */
function geometry(level, size) {
  var s = size || 600;
  function px(v) { return Math.round(v / 100 * s * 100) / 100; }
  var nodes = (level.nodes || []).map(function (n) {
    return { left: px(n[0]), top: px(n[1]) };
  });
  var edges = (level.edges || []).map(function (e) {
    var a = nodes[e[0]];
    var b = nodes[e[1]];
    var dx = b.left - a.left;
    var dy = b.top - a.top;
    var len = Math.round(Math.sqrt(dx * dx + dy * dy) * 100) / 100;
    var angle = Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10;
    return { key: edgeKey(e[0], e[1]), left: a.left, top: a.top, len: len, angle: angle };
  });
  return { size: s, nodes: nodes, edges: edges };
}

/** 星级：按通关数（5 关制：2 / 3 / 5 关） */
function starsFor(cleared, total) {
  var t = total || LEVELS.length;
  var rate = t ? cleared / t : 0;
  if (rate >= 1) return 3;
  if (rate >= 0.6) return 2;
  if (rate >= 0.4) return 1;
  return 0;
}

// ============ 关卡扩充（2026-09-13 用户反馈「关卡有点少」）============
//
// 用规则图形参数化生成：生成后**一律用 validateLevel 过滤**（必须连通且奇点数为 0 或 2），
// 只留下真能一笔画完的；单测 one-stroke.test.js 还会对每一关跑回溯求解，证明真有解。
// 图形家族：圆环/多边形（偶度闭环）、奇数边形带全对角线（偶度）、尖角星（偶度闭环）、
//          矩形环 + 一条对角线（2 个奇点）、折线路径（2 个奇点）、套环（2 个奇点）。
function ringNodes(n, rx, ry, cx, cy, rot) {
  var out = [];
  for (var i = 0; i < n; i++) {
    var a = rot + i * 2 * Math.PI / n;
    out.push([
      Math.round((cx + rx * Math.cos(a)) * 10) / 10,
      Math.round((cy + ry * Math.sin(a)) * 10) / 10
    ]);
  }
  return out;
}

function cycleEdges(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push([i, (i + 1) % n]);
  return out;
}

function polyAllDiag(n) {
  var nodes = ringNodes(n, 40, 40, 50, 50, -Math.PI / 2);
  var edges = cycleEdges(n);
  for (var i = 0; i < n; i++) {
    for (var j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;   // 相邻边已连
      edges.push([i, j]);
    }
  }
  return { name: n + '边形加全部对角线', nodes: nodes, edges: edges };
}

function starLevel(points) {
  var outer = ringNodes(points, 40, 40, 50, 50, -Math.PI / 2);
  var inner = ringNodes(points, 15, 15, 50, 50, -Math.PI / 2 + Math.PI / points);
  var nodes = outer.concat(inner);
  var edges = [];
  for (var i = 0; i < points; i++) {
    edges.push([i, points + i]);
    edges.push([points + i, (i + 1) % points]);
  }
  return { name: points + '角星', nodes: nodes, edges: edges };
}

function rectLoop(w, h, withDiag, name) {
  var x0 = 50 - w / 2, x1 = 50 + w / 2, y0 = 50 - h / 2, y1 = 50 + h / 2;
  var nodes = [[x0, y1], [x1, y1], [x1, y0], [x0, y0]];
  var edges = cycleEdges(4).slice();
  if (withDiag) edges.push([0, 2]);
  return { name: name || ('长方形' + (withDiag ? '加对角线' : '')), nodes: nodes, edges: edges };
}

function zigzagLevel(n) {
  var nodes = [];
  for (var i = 0; i < n; i++) {
    nodes.push([12 + i * (76 / (n - 1)), i % 2 ? 30 : 70]);
  }
  var edges = [];
  for (var j = 0; j < n - 1; j++) edges.push([j, j + 1]);
  return { name: n + '折线', nodes: nodes, edges: edges };
}

function nestedLoopLevel() {
  var nodes = [[15, 85], [85, 85], [85, 15], [15, 15], [32, 68], [68, 68], [68, 32], [32, 32]];
  var edges = cycleEdges(4).slice();
  edges = edges.concat([[4, 5], [5, 6], [6, 7], [7, 4], [0, 4]]);
  return { name: '套环', nodes: nodes, edges: edges };
}

function buildMoreLevels() {
  var cands = [];
  [5, 7, 9].forEach(function (n) { cands.push(polyAllDiag(n)); });
  [5, 7, 9, 11].forEach(function (n) { cands.push(starLevel(n)); });
  [[60, 40], [40, 60], [70, 30], [30, 70]].forEach(function (wh) {
    cands.push(rectLoop(wh[0], wh[1], false, '长方形 ' + wh[0] + '×' + wh[1]));
    cands.push(rectLoop(wh[0], wh[1], true, '长方形 ' + wh[0] + '×' + wh[1] + '加对角线'));
  });
  [5, 6, 7, 8].forEach(function (n) { cands.push(zigzagLevel(n)); });
  cands.push(nestedLoopLevel());
  cands.push(starLevel(6));           // 六角星（闭环，仍是一笔画）
  cands.push({ name: '正六边形', nodes: ringNodes(6, 40, 40, 50, 50, 0), edges: cycleEdges(6) });
  cands.push({ name: '正八边形', nodes: ringNodes(8, 40, 40, 50, 50, 0), edges: cycleEdges(8) });
  cands.push({ name: '正十边形', nodes: ringNodes(10, 40, 40, 50, 50, 0), edges: cycleEdges(10) });
  cands.push({ name: '正三角形', nodes: ringNodes(3, 40, 40, 50, 55, -Math.PI / 2), edges: cycleEdges(3) });
  cands.push({ name: '正方形', nodes: ringNodes(4, 36, 36, 50, 50, Math.PI / 4), edges: cycleEdges(4) });
  cands.push(starLevel(8));
  [9, 10].forEach(function (n) { cands.push(zigzagLevel(n)); });

  return cands.filter(function (lv) {
    return validateLevel(lv).ok;
  });
}

LEVELS = LEVELS.concat(buildMoreLevels());

module.exports = {
  LEVELS: LEVELS,
  edgeKey: edgeKey,
  edgeExists: edgeExists,
  usedCount: usedCount,
  isLevelClear: isLevelClear,
  freeCountFrom: freeCountFrom,
  canStep: canStep,
  step: step,
  unstep: unstep,
  degreeOf: degreeOf,
  oddNodes: oddNodes,
  isConnected: isConnected,
  validateLevel: validateLevel,
  geometry: geometry,
  starsFor: starsFor
};
