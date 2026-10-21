/**
 * one-stroke.test.js —— 一笔画引擎单测
 *
 * 2026-10-18：关卡表换成 demo/一笔画小游戏.html 的 35 关手绘图形（原来是 5 手绘 + 29 公式生成）。
 * 覆盖：关卡合法性（连通 + 奇点数 0/2）、每关**真的能一笔画完**（回溯求解）、
 * 走边/撤回/死路判定、渲染几何、提示（给出的每一步都不会把人带进死路）、星级。
 *
 * 关卡一旦被改坏（比如加了条边导致奇点数变 4），或者提示算法退化成"随便给一条"，
 * 这里会第一时间红。
 *
 * 运行：node tests/unit/one-stroke.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/one-stroke.js');

const g = require('../../miniprogram/game/one-stroke');

/** 按关卡名取关卡（不写死下标：以后调顺序不会连带改测试） */
function lv(name) {
  const found = g.LEVELS.filter(function (x) { return x.name === name; })[0];
  if (!found) throw new Error('关卡表里找不到「' + name + '」');
  return found;
}

/** 回溯找一条能走完全部边的一笔画路线，找不到返回 null */
function findEulerPath(level) {
  const total = level.edges.length;
  const starts = g.oddNodes(level).length ? g.oddNodes(level) : [0];
  for (const start of starts) {
    const path = tryWalk(level, start, {}, [start], total);
    if (path) return path;
  }
  return null;
}

function tryWalk(level, cur, used, path, total) {
  if (g.usedCount(used) === total) return path;
  for (const e of level.edges) {
    let to = -1;
    if (e[0] === cur) to = e[1];
    else if (e[1] === cur) to = e[0];
    if (to < 0) continue;
    const next = g.step(level, used, cur, to);
    if (!next) continue;
    const got = tryWalk(level, to, next, path.concat([to]), total);
    if (got) return got;
  }
  return null;
}

s.test('关卡表：35 关，名字不重复，难度分三档', () => {
  s.assert.equal(g.LEVELS.length, 35, 'demo 的关卡数是 35');
  const names = {};
  g.LEVELS.forEach(function (item) {
    s.assert.false(!!names[item.name], '关卡名重复：' + item.name);
    names[item.name] = true;
    s.assert.ok(['简单', '中等', '困难'].indexOf(item.tier) >= 0, '难度档非法：' + item.tier);
  });
  s.assert.equal(g.LEVELS[0].name, '直线');
  s.assert.equal(g.LEVELS[34].name, '终极挑战');
  s.assert.equal(g.LEVELS[0].tier, '简单');
  s.assert.equal(g.LEVELS[34].tier, '困难');
});

s.test('关卡合法：每关都连通，且奇点数为 0 或 2（欧拉路径条件）', () => {
  g.LEVELS.forEach(function (item, i) {
    const r = g.validateLevel(item);
    s.assert.true(r.ok, '第 ' + (i + 1) + ' 关「' + item.name + '」不合法：' + r.reason);
    const odd = g.oddNodes(item);
    s.assert.ok(odd.length === 0 || odd.length === 2, '第 ' + (i + 1) + ' 关奇点数应为 0 或 2，实际 ' + odd.length);
    s.assert.ok(item.nodes.length >= 2);
    s.assert.ok(item.edges.length >= 1);
  });
});

s.test('关卡自检能抓出坏数据（奇点数 4 / 孤立点 / 越界边）', () => {
  // 三条边共用一个中心点：中心 3 度 + 三个端点各 1 度 → 4 个奇点，一笔画不成立
  const bad = {
    name: '坏图',
    nodes: [[50, 50], [10, 10], [90, 10], [50, 90]],
    edges: [[0, 1], [0, 2], [0, 3]]
  };
  s.assert.false(g.validateLevel(bad).ok);
  s.assert.equal(g.oddNodes(bad).length, 4, '这张坏图应有 4 个奇点');
  const isolated = { name: '孤立点', nodes: [[10, 10], [50, 50], [90, 90], [10, 90]], edges: [[0, 1], [1, 0]] };
  s.assert.false(g.validateLevel(isolated).ok, '有孤立点应判不连通');
  const outRange = { name: '越界', nodes: [[10, 10], [50, 50]], edges: [[0, 9]] };
  s.assert.false(g.validateLevel(outRange).ok);
  s.assert.false(g.validateLevel(null).ok);
});

s.test('起点规则：有 2 个奇点时只能从奇点起笔（其余起点必无解）', () => {
  g.LEVELS.forEach(function (item, i) {
    const odd = g.startHint(item).odd;
    item.nodes.forEach(function (n, node) {
      if (g.degreeOf(item, node) === 0) return;
      const canStart = g.eulerianFrom(item, {}, node);
      const expected = odd.length === 0 || odd.indexOf(node) >= 0;
      s.assert.equal(canStart, expected,
        '第 ' + (i + 1) + ' 关「' + item.name + '」点 ' + node + ' 起笔判定错误');
    });
  });
});

s.test('每关都存在一笔画解法（回溯求解，步数 = 边数）', () => {
  g.LEVELS.forEach(function (item) {
    const path = findEulerPath(item);
    s.assert.ok(path, '第 「' + item.name + '」关应有解');
    s.assert.equal(path.length, item.edges.length + 1, '访问节点数应为边数 + 1');
  });
});

s.test('走边：只能走存在且没用过的边，不能原地踏步', () => {
  const square = lv('正方形');   // 0-1-2-3 一圈，没有对角线
  s.assert.true(g.canStep(square, {}, 0, 1));
  s.assert.false(g.canStep(square, {}, 0, 2), '正方形没有对角线');
  s.assert.false(g.canStep(square, {}, 0, 9), '不存在的点');
  s.assert.false(g.canStep(square, {}, 1, 3), '不存在这条边');
  s.assert.false(g.canStep(square, {}, 0, 0), '不能原地踏步');

  const used = g.step(square, {}, 0, 1);
  s.assert.ok(used);
  s.assert.false(g.canStep(square, used, 0, 1), '走过的边不能再走');
  s.assert.equal(g.step(square, used, 0, 1), null, '重复走应被拒绝');
  s.assert.equal(g.usedCount(used), 1);
  s.assert.false(g.isLevelClear(square, used));
});

s.test('撤回一步：边重新变为可走，步数回落', () => {
  const tri = lv('三角形');
  let used = g.step(tri, {}, 0, 1);
  used = g.step(tri, used, 1, 2);
  s.assert.equal(g.usedCount(used), 2);
  used = g.unstep(used, 1, 2);
  s.assert.equal(g.usedCount(used), 1);
  s.assert.true(g.canStep(tri, used, 1, 2), '撤回后这条边应能再走');
  s.assert.false(g.canStep(tri, used, 0, 1), '已走过的边仍不可走');
});

s.test('边的 key 无向：a-b 与 b-a 是同一条边', () => {
  s.assert.equal(g.edgeKey(2, 5), g.edgeKey(5, 2));
  const square = lv('正方形');
  s.assert.true(g.edgeExists(square, 1, 0));
  s.assert.true(g.edgeExists(square, 0, 1));
  s.assert.true(g.edgeExists(square, 3, 0));
  s.assert.false(g.edgeExists(square, 1, 3), '对角之间没有线');
});

s.test('死路判定：走到无处可走的点要能被识别出来', () => {
  const snake = lv('一字长蛇');   // 0-1-2-3 一条链
  s.assert.equal(g.freeCountFrom(snake, {}, 0), 1);
  let used = g.step(snake, {}, 0, 1);
  s.assert.equal(g.freeCountFrom(snake, used, 0), 0, '0 号点没有别的出路了');
  used = g.step(snake, {}, 1, 2);   // 从中间起手，往右走
  s.assert.equal(g.freeCountFrom(snake, used, 1), 1, '1 号点还剩 1-0 没走');
  s.assert.equal(g.freeCountFrom(snake, used, 2), 1, '2 号点还剩 2-3 没走');

  // 真正的死路：十字从中心出发绕一圈，回到中心时四条边都走过了
  const cross = lv('十字');
  let u = {};
  [[4, 0], [0, 1], [1, 4], [4, 2], [2, 3], [3, 4]].forEach(function (e) {
    const nxt = g.step(cross, u, e[0], e[1]);
    if (nxt) u = nxt;
  });
  s.assert.equal(g.freeCountFrom(cross, u, 4), 0, '中心四条边都走过了 → 死路');
});

s.test('过关判定：刚好走完所有边才算过关', () => {
  const tri = lv('三角形');
  let used = {};
  used = g.step(tri, used, 0, 1);
  used = g.step(tri, used, 1, 2);
  s.assert.false(g.isLevelClear(tri, used), '还差一条边');
  used = g.step(tri, used, 2, 0);
  s.assert.true(g.isLevelClear(tri, used));
  s.assert.equal(g.usedCount(used), 3);
});

s.test('渲染几何：节点落在棋盘内、线长与角度正确', () => {
  const square = lv('正方形');
  const size = 600;
  const geo = g.geometry(square, size);
  s.assert.equal(geo.nodes.length, square.nodes.length);
  s.assert.equal(geo.edges.length, square.edges.length);
  geo.nodes.forEach(function (n) {
    s.assert.ok(n.left >= 0 && n.left <= size, '节点越界：' + n.left);
    s.assert.ok(n.top >= 0 && n.top <= size, '节点越界：' + n.top);
  });
  geo.edges.forEach(function (e) {
    s.assert.ok(e.len > 0, '线长应为正数');
    s.assert.ok(e.angle > -180 && e.angle <= 180, '角度应在 (-180, 180]：' + e.angle);
  });
  // 正方形上边：水平向右，长度为棋盘宽度的 40%（30 → 70）
  const topEdge = geo.edges[0];
  s.assert.equal(topEdge.angle, 0);
  s.assert.equal(topEdge.len, Math.round(0.4 * size * 100) / 100);
});

s.test('渲染几何：坐标按比例缩放（0~100 相对坐标 → rpx）', () => {
  const t = { name: 't', nodes: [[0, 0], [100, 50]], edges: [[0, 1]] };
  const geo = g.geometry(t, 400);
  s.assert.deepEqual(geo.nodes[0], { left: 0, top: 0 });
  s.assert.deepEqual(geo.nodes[1], { left: 400, top: 200 });
  s.assert.equal(geo.edges[0].len, Math.round(Math.sqrt(400 * 400 + 200 * 200) * 100) / 100);
});

s.test('度数：每条边给两端各 +1', () => {
  const square = lv('正方形');
  s.assert.equal(g.degreeOf(square, 0), 2);
  let sum = 0;
  square.nodes.forEach(function (n, i) { sum += g.degreeOf(square, i); });
  s.assert.equal(sum, square.edges.length * 2, '度数之和应等于边数 ×2');
});

// ============ 提示（2026-10-18 从 demo 移植） ============

s.test('起手提示：奇点数 2 给那两个点，奇点数 0 说明任意点都行', () => {
  const house = lv('小房子');
  const sh = g.startHint(house);
  s.assert.equal(sh.odd.length, 2);
  s.assert.false(sh.any);
  const tri = lv('三角形');    // 闭环，全偶度
  const sh2 = g.startHint(tri);
  s.assert.equal(sh2.odd.length, 0);
  s.assert.true(sh2.any);
});

s.test('走法提示：每一步都「走完还能通关」，一路按提示能画到底', () => {
  g.LEVELS.forEach(function (item) {
    const start = g.startHint(item).odd;
    let cur = start.length ? start[0] : 0;
    let used = {};
    let guard = 0;
    while (guard++ <= item.edges.length) {
      const h = g.hintOf(item, used, cur);
      s.assert.ok(h, '「' + item.name + '」提示突然没了');
      s.assert.true(h.safe, '「' + item.name + '」提示把人带进了死路');
      used = g.step(item, used, h.from, h.to);
      s.assert.ok(used, '提示给了一条走不了的边：' + h.from + '-' + h.to);
      cur = h.to;
      if (g.isLevelClear(item, used)) break;
    }
    s.assert.true(g.isLevelClear(item, used), '「' + item.name + '」按提示没画完');
  });
});

s.test('走错之后：提示不再保证有解，但会标记 safe=false（页面据此劝撤销）', () => {
  const house = lv('小房子');
  const odd = g.startHint(house).odd;          // 两个奇点，必须从其中之一出发
  const evenNode = house.nodes.map(function (n, i) { return i; })
    .filter(function (i) { return odd.indexOf(i) < 0; })[0];
  const edge = house.edges.filter(function (e) {
    return e[0] === evenNode || e[1] === evenNode;
  })[0];
  const to = edge[0] === evenNode ? edge[1] : edge[0];
  const used = g.step(house, {}, evenNode, to);   // 从偶点起手 = 已经走错了
  const h = g.hintOf(house, used, to);
  s.assert.ok(h, '还能走的线应该给得出来');
  s.assert.false(h.safe, '已经走错了还应标 safe=false');
});

s.test('没线可走时提示返回 null（页面提示撤销）', () => {
  const snake = lv('一字长蛇');
  const used = g.step(snake, {}, 0, 1);
  s.assert.equal(g.hintOf(snake, used, 0), null, '0 号点已经没有未走的边');
});

// ============ 星级（2026-10-18 从 demo 移植） ============

s.test('星级：按借助次数折星（0 次 3 星 / 1~2 次 2 星 / 3 次以上 1 星）', () => {
  s.assert.equal(g.starsByAssist(0, 0, 0), 3, '一次画完 = 3 星');
  s.assert.equal(g.starsByAssist(1, 0, 0), 2);
  s.assert.equal(g.starsByAssist(0, 0, 2), 2);
  s.assert.equal(g.starsByAssist(1, 1, 0), 2, '合计 2 次仍是 2 星');
  s.assert.equal(g.starsByAssist(2, 1, 0), 1, '合计 3 次掉到 1 星');
  s.assert.equal(g.starsByAssist(0, 0, 3), 1, '三个提示用完 = 1 星');
  s.assert.equal(g.starsByAssist(9, 9, 9), 1, '通关就有星，不会掉到 0');
});

s.done();
