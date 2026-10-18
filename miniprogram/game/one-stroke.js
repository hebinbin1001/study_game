/**
 * game/one-stroke.js —— 一笔画引擎（纯逻辑，无 wx 依赖，可单测）
 *
 * 玩法：每关一张图，每条线只能走一次，把所有线走完即过关；
 * 走错可以撤销一步或重置本关；每关 3 次提示。
 *
 * 2026-10-18 换关卡表：原来是「5 张手绘 + 29 张公式生成」（11 张长方形加对角线、
 * 4 张折线…形状高度重复，难度也没递进）。现在改为移植 demo/一笔画小游戏.html 的
 * **35 关手绘图形**（直线 → 三角形 → … → 中国结 → 终极挑战），难度按 12/12/11 分三档。
 * 关卡数据在 game/one-stroke-levels.js，本文件只管规则。
 *
 * 页面渲染用「绝对定位的线 + 圆点」（不用 Canvas），坐标由 geometry() 算出，
 * 因此几何计算也可以在 Node 下单测。
 * 关联：pages/one-stroke、game/one-stroke-levels
 */

'use strict';

var data = require('./one-stroke-levels');

var LEVELS = data.LEVELS;

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

// ============ 提示（2026-10-18 从 demo 移植） ============
//
// demo 里「💡 提示」会高亮一条还能走的边。但随手高亮一条可能把人带进死路，
// 提示反而害人。这里按欧拉路径的判定来选：
//   走完这一步后，剩余图必须「连通 + 奇点数 0 或 2（且新位置是其中一端）」，
// 也就是**这一步之后仍然存在解法**，只给出这种边。

/** 剩余的边（还没走过的） */
function remainingEdges(level, usedEdges) {
  var used = usedEdges || {};
  return (level.edges || []).filter(function (e) {
    return !used[edgeKey(e[0], e[1])];
  });
}

/**
 * 站在 node 上，剩余图还能不能一笔走完（欧拉路径存在性判定）。
 * @returns {boolean}
 */
function eulerianFrom(level, usedEdges, node) {
  var es = remainingEdges(level, usedEdges);
  if (!es.length) return true;
  var deg = {};
  var adj = {};
  es.forEach(function (e) {
    deg[e[0]] = (deg[e[0]] || 0) + 1;
    deg[e[1]] = (deg[e[1]] || 0) + 1;
    adj[e[0]] = adj[e[0]] || [];
    adj[e[1]] = adj[e[1]] || [];
    adj[e[0]].push(e[1]);
    adj[e[1]].push(e[0]);
  });
  if (deg[node] === undefined) return false;
  // 连通性：只要求在「还有边的点」之间连通
  var seen = {};
  var stack = [node];
  seen[node] = true;
  while (stack.length) {
    var cur = stack.pop();
    (adj[cur] || []).forEach(function (n) {
      if (!seen[n]) { seen[n] = true; stack.push(n); }
    });
  }
  var nodes = Object.keys(deg);
  for (var i = 0; i < nodes.length; i++) {
    if (!seen[nodes[i]]) return false;
  }
  var odd = nodes.filter(function (n) { return deg[n] % 2 === 1; });
  if (odd.length === 0) return true;                       // 欧拉回路：任一点都能走完
  if (odd.length === 2) return odd.indexOf(String(node)) >= 0;  // 必须从奇点出发
  return false;
}

/**
 * 提示：从 from 出发、走完仍能通关的一条边。
 * @param {Object} level
 * @param {Object} usedEdges
 * @param {number} from 当前所在点
 * @returns {{from:number,to:number,key:string,safe:boolean}|null} null = 走不动了
 */
function hintOf(level, usedEdges, from) {
  var cands = remainingEdges(level, usedEdges).filter(function (e) {
    return e[0] === from || e[1] === from;
  });
  if (!cands.length) return null;
  for (var i = 0; i < cands.length; i++) {
    var to = cands[i][0] === from ? cands[i][1] : cands[i][0];
    var next = step(level, usedEdges, from, to);
    if (next && eulerianFrom(level, next, to)) {
      return { from: from, to: to, key: edgeKey(from, to), safe: true };
    }
  }
  // 已经走进死路了：仍给一条能走的边，但标记 safe=false，页面可以顺势提示撤销
  var to0 = cands[0][0] === from ? cands[0][1] : cands[0][0];
  return { from: from, to: to0, key: edgeKey(from, to0), safe: false };
}

/**
 * 还没开始画时的提示：应该从哪个点起手。
 * 奇点数为 2 时只能从这两个点之一出发；为 0 时任意点都行。
 * @returns {{odd:Array<number>, any:boolean}}
 */
function startHint(level) {
  var odd = oddNodes(level);
  return { odd: odd, any: odd.length === 0 };
}

/**
 * 星级（2026-10-18 从 demo 移植）：按「借助了多少次帮助」折星。
 *
 * 一笔画没有"正确率"可算（不是答题类），所以不走 challenge.starsByRightRate；
 * demo 的口径是「一次过 = 3 星」，这里把它量化：
 *   · 0 次撤销/重置/提示 → 3 星
 *   · 1~2 次 → 2 星
 *   · 3 次以上 → 1 星（通关就有星，不存在拿 0 星）
 * @param {number} undo 撤销次数
 * @param {number} reset 重置次数
 * @param {number} hints 用了几个提示
 * @returns {number} 0~3（未通关由调用方传 0）
 */
function starsByAssist(undo, reset, hints) {
  var assists = (undo || 0) + (reset || 0) + (hints || 0);
  if (!assists) return 3;
  if (assists <= 2) return 2;
  return 1;
}

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
  remainingEdges: remainingEdges,
  eulerianFrom: eulerianFrom,
  hintOf: hintOf,
  startHint: startHint,
  starsByAssist: starsByAssist
};
