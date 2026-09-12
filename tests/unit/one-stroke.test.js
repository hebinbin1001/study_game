/**
 * one-stroke.test.js —— 一笔画引擎单测（玩法落地：demo g8）
 *
 * 覆盖 game/one-stroke.js：关卡合法性（连通 + 奇点数 0/2）、走边/撤回/死路判定、
 * 渲染几何换算、星级；并用回溯搜索证明"每关真的能一笔画完"。
 * 关卡数据一旦被改坏（比如加了条边导致奇点数变 4），这里会第一时间红。
 *
 * 运行：node tests/unit/one-stroke.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/one-stroke.js');

const g = require('../../miniprogram/game/one-stroke');

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

s.test('关卡合法：每关都连通，且奇点数为 0 或 2（欧拉路径条件）', () => {
  s.assert.equal(g.LEVELS.length, 5);
  g.LEVELS.forEach(function (lv, i) {
    const r = g.validateLevel(lv);
    s.assert.true(r.ok, '第 ' + (i + 1) + ' 关「' + lv.name + '」不合法：' + r.reason);
    const odd = g.oddNodes(lv);
    s.assert.ok(odd.length === 0 || odd.length === 2, '第 ' + (i + 1) + ' 关奇点数应为 0 或 2，实际 ' + odd.length);
    s.assert.ok(lv.nodes.length >= 3);
    s.assert.ok(lv.edges.length >= 3);
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

s.test('每关都存在一笔画解法（回溯求解，步数 = 边数）', () => {
  g.LEVELS.forEach(function (lv) {
    const path = findEulerPath(lv);
    s.assert.ok(path, '第 「' + lv.name + '」关应有解');
    s.assert.equal(path.length, lv.edges.length + 1, '访问节点数应为边数 + 1');
    s.assert.equal(path[0], path[0], '路径起点存在');
  });
});

s.test('走边：只能走存在且没用过的边，不能原地踏步', () => {
  const lv = g.LEVELS[1];   // 正方形 + 对角线
  s.assert.true(g.canStep(lv, {}, 0, 1));
  s.assert.true(g.canStep(lv, {}, 0, 2), '对角线可走');
  s.assert.false(g.canStep(lv, {}, 0, 9), '不存在的点');
  s.assert.false(g.canStep(lv, {}, 1, 3), '不存在这条边');
  s.assert.false(g.canStep(lv, {}, 0, 0), '不能原地踏步');

  const used = g.step(lv, {}, 0, 1);
  s.assert.ok(used);
  s.assert.false(g.canStep(lv, used, 0, 1), '走过的边不能再走');
  s.assert.equal(g.step(lv, used, 0, 1), null, '重复走应被拒绝');
  s.assert.equal(g.usedCount(used), 1);
  s.assert.false(g.isLevelClear(lv, used));
});

s.test('撤回一步：边重新变为可走，步数回落', () => {
  const lv = g.LEVELS[0];
  let used = g.step(lv, {}, 0, 1);
  used = g.step(lv, used, 1, 2);
  s.assert.equal(g.usedCount(used), 2);
  used = g.unstep(used, 1, 2);
  s.assert.equal(g.usedCount(used), 1);
  s.assert.true(g.canStep(lv, used, 1, 2), '撤回后这条边应能再走');
  s.assert.false(g.canStep(lv, used, 0, 1), '已走过的边仍不可走');
});

s.test('边的 key 无向：a-b 与 b-a 是同一条边', () => {
  s.assert.equal(g.edgeKey(2, 5), g.edgeKey(5, 2));
  const lv = g.LEVELS[1];
  s.assert.true(g.edgeExists(lv, 2, 0));
  s.assert.true(g.edgeExists(lv, 0, 2));
  s.assert.true(g.edgeExists(lv, 3, 0), '正方形的左边也存在');
  s.assert.false(g.edgeExists(lv, 1, 3), '对角之间没有线');
});

s.test('死路判定：走到无处可走的点要能被识别出来', () => {
  const lv = g.LEVELS[2];   // 小房子
  // 从 4（屋顶）出发只能走 3-4 或 2-4
  s.assert.equal(g.freeCountFrom(lv, {}, 4), 2);
  let used = g.step(lv, {}, 4, 3);
  used = g.step(lv, used, 3, 0);
  s.assert.equal(g.freeCountFrom(lv, used, 0), 1, '0 号点还剩 0-1 没走');
  s.assert.equal(g.freeCountFrom(lv, used, 3), 1, '3 号点还剩 2-3 没走');

  // 真正的死路：两个正方形这一关，绕一圈回到 0 号点，此时它两条边都走过了
  const lv2 = g.LEVELS[3];
  let u2 = {};
  [[0, 1], [1, 4], [4, 5], [5, 2], [2, 3], [3, 0]].forEach(function (e) {
    u2 = g.step(lv2, u2, e[0], e[1]);
    s.assert.ok(u2, '这条路边走不通：' + e.join('-'));
  });
  s.assert.equal(g.usedCount(u2), 6);
  s.assert.false(g.isLevelClear(lv2, u2), '还剩 1-2、2-4 两条边');
  s.assert.equal(g.freeCountFrom(lv2, u2, 0), 0, '0 号点两条边都走过了 → 死路');
  s.assert.ok(g.freeCountFrom(lv2, u2, 2) > 0, '2 号点还有别的出路');
});

s.test('过关判定：刚好走完所有边才算过关', () => {
  const lv = g.LEVELS[0];   // 三角形：3 条边
  let used = {};
  used = g.step(lv, used, 0, 1);
  used = g.step(lv, used, 1, 2);
  s.assert.false(g.isLevelClear(lv, used), '还差一条边');
  used = g.step(lv, used, 2, 0);
  s.assert.true(g.isLevelClear(lv, used));
  s.assert.equal(g.usedCount(used), 3);
});

s.test('渲染几何：节点落在棋盘内、线长与角度正确', () => {
  const lv = g.LEVELS[1];
  const size = 600;
  const geo = g.geometry(lv, size);
  s.assert.equal(geo.nodes.length, lv.nodes.length);
  s.assert.equal(geo.edges.length, lv.edges.length);
  geo.nodes.forEach(function (n) {
    s.assert.ok(n.left >= 0 && n.left <= size, '节点越界：' + n.left);
    s.assert.ok(n.top >= 0 && n.top <= size, '节点越界：' + n.top);
  });
  geo.edges.forEach(function (e) {
    s.assert.ok(e.len > 0, '线长应为正数');
    s.assert.ok(e.angle > -180 && e.angle <= 180, '角度应在 (-180, 180]：' + e.angle);
  });
  // 正方形上边：水平向右，长度为 64% 棋盘宽
  const topEdge = geo.edges[0];
  s.assert.equal(topEdge.angle, 0);
  s.assert.equal(topEdge.len, Math.round(0.64 * size * 100) / 100);
});

s.test('渲染几何：坐标按比例缩放（0~100 相对坐标 → rpx）', () => {
  const lv = { name: 't', nodes: [[0, 0], [100, 50]], edges: [[0, 1]] };
  const geo = g.geometry(lv, 400);
  s.assert.deepEqual(geo.nodes[0], { left: 0, top: 0 });
  s.assert.deepEqual(geo.nodes[1], { left: 400, top: 200 });
  s.assert.equal(geo.edges[0].len, Math.round(Math.sqrt(400 * 400 + 200 * 200) * 100) / 100);
});

s.test('度数：每条边给两端各 +1', () => {
  const lv = g.LEVELS[1];
  s.assert.equal(g.degreeOf(lv, 0), 3, '0 号点：两条边 + 一条对角线');
  s.assert.equal(g.degreeOf(lv, 1), 2);
  s.assert.equal(g.degreeOf(lv, 2), 3);
  s.assert.equal(g.degreeOf(lv, 3), 2);
  let sum = 0;
  lv.nodes.forEach(function (n, i) { sum += g.degreeOf(lv, i); });
  s.assert.equal(sum, lv.edges.length * 2, '度数之和应等于边数 ×2');
});

s.test('星级：5 关制按通关数分三档', () => {
  s.assert.equal(g.starsFor(5, 5), 3);
  s.assert.equal(g.starsFor(4, 5), 2);
  s.assert.equal(g.starsFor(3, 5), 2);
  s.assert.equal(g.starsFor(2, 5), 1);
  s.assert.equal(g.starsFor(1, 5), 0);
  s.assert.equal(g.starsFor(0, 5), 0);
});

s.done();
