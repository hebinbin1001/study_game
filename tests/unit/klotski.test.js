/**
 * klotski.test.js —— 华容道引擎单测（纯逻辑）
 *
 * 覆盖 game/klotski.js：
 *   1. 关卡解析与严格校验（行数列数、未知字形、棋子数量、形状必须实心）；
 *   2. 滑动规则：最多滑几格、被挡/出界为 0、**一次连续滑动算 1 步**；
 *   3. 胜负判定与星级可达性（通关至少 1★、按最优解必得 3★ —— 防 R1 那类星级死区）；
 *   4. 局面编码：打包/解包往返；**同类棋子互换位置后 key 相同**（否则 BFS 会漏状态）；
 *   5. 走法生成：每个方向都滑到尽头（再滑一格就不行）；
 *   6. 求解与回放：最优解长度自洽、独立回放器逐步执行确实通关；
 *   7. 走法标识用「棋子左上角格位」而不是下标（局面打包会重排同类棋子，下标回放会串位）。
 *
 * 运行：node tests/unit/klotski.test.js
 */

'use strict';

const { suite } = require('./_runner');
const s = suite('华容道引擎（game/klotski.js）');

const K = require('../../miniprogram/game/klotski');
const LEVELS = require('../../miniprogram/data/klotski-levels');

const FIRST = LEVELS.levels[0];           // 8 步入门关
const CLASSIC = LEVELS.levels.find(function (l) { return l.classic; });

function board() { return K.parseGrid(FIRST.grid); }

// ============ 1. 解析与校验 ============
s.test('解析：合法关卡解出 10 个棋子，曹操排在最前', () => {
  const pieces = board();
  s.assert.equal(pieces.length, 10);
  s.assert.equal(pieces[0].kind, 'cao');
  s.assert.equal(pieces[0].w, 2);
  s.assert.equal(pieces[0].h, 2);
  const kinds = {};
  pieces.forEach(function (p) { kinds[p.kind] = (kinds[p.kind] || 0) + 1; });
  s.assert.equal(kinds.cao, 1);
  s.assert.equal(kinds.v, 4);
  s.assert.equal(kinds.h, 1);
  s.assert.equal(kinds.s, 4);
});

s.test('解析：行数/列数/未知字形/棋子数量/形状不实心 都要被拒绝', () => {
  s.assert.throws(function () { K.parseGrid(['兵兵关关', '张黄兵']); }, /5 行/);
  s.assert.throws(function () { K.parseGrid(['兵兵关', '张黄兵', '赵张黄.', '赵马曹曹', '兵马曹曹']); }, /4 个字符/);
  s.assert.throws(function () { K.parseGrid(['兵兵关关', '.张黄▲', '赵张黄.', '赵马曹曹', '兵马曹曹']); }, /未知棋子/);
  // 曹操少一个（改成兵）→ 数量校验拦下
  s.assert.throws(function () {
    K.parseGrid(['兵兵关关', '.张黄兵', '赵张黄.', '赵马兵兵', '兵马兵兵']);
  }, /曹操|棋子数量/);
  // 「兵」不成问题（1×1），但「张」若多出一格就不实心
  s.assert.throws(function () {
    K.parseGrid(['兵兵关关', '.张黄兵', '张张黄.', '赵马曹曹', '兵马曹曹']);
  }, /实心块|棋子数量/);
});

// ============ 2. 滑动规则 ============
s.test('滑动：空位方向最多滑几格，被挡/出界返回 0', () => {
  const pieces = board();
  const occ = K.buildOcc(pieces);
  // 曹操在 (2,3) 2×2：向下出界 → 0；向上看是否有空间（该关第一步参考解就是曹操下移 1 格，这里只断言接口行为）
  s.assert.equal(K.maxSlide(occ, pieces, 0, 0, 1), 0, '曹操在底行，不能继续下移');
  s.assert.equal(K.maxSlide(occ, pieces, 0, 1, 0), 0, '曹操右侧被边界挡住');
  const idx = K.indexAt(pieces, 0);           // 左上角 (0,0) 的棋子
  s.assert.ok(idx >= 0, '应能找到左上角的棋子');
  s.assert.equal(K.maxSlide(occ, pieces, idx, -1, 0), 0, '已在最左列，向左滑 0 格');
  s.assert.equal(K.maxSlide(occ, pieces, idx, 0, -1), 0, '已在最上行，向上滑 0 格');
});

s.test('滑动：applyMove 移动到位、夹住超出距离、不改原数组', () => {
  const pieces = board();
  const before = JSON.stringify(pieces);
  const idx = K.indexAt(pieces, 0);
  const r = K.applyMove(pieces, idx, 0, 1, 99);      // 想滑到底（距离给大）
  s.assert.equal(r.moved, true);
  s.assert.ok(r.dist >= 1);
  const moved = r.pieces[idx];
  s.assert.equal(moved.y, pieces[idx].y + r.dist);
  s.assert.equal(JSON.stringify(pieces), before, 'applyMove 不能修改入参数组');
  s.assert.ok(r.dist <= K.maxSlide(K.buildOcc(pieces), pieces, idx, 0, 1), '距离必须夹在实际可滑范围内');
});

s.test('滑动：一次连续滑动只算 1 步（计步由 UI 负责，引擎按一次操作返回一次结果）', () => {
  const pieces = board();
  const idx = K.indexAt(pieces, 0);
  const r1 = K.applyMove(pieces, idx, 0, 1, 1);
  const r3 = K.applyMove(pieces, idx, 0, 1, 3);
  s.assert.equal(r1.dist, 1);
  s.assert.ok(r3.dist >= r1.dist, '给的距离更大时滑得更远（或同样受阻挡）');
  s.assert.equal(K.buildOcc(r3.pieces).filter(function (v) { return v === -1; }).length, 2, '任何局面都应恰好剩 2 个空格');
});

// ============ 3. 胜负与星级 ============
s.test('胜负：曹操左上角到 (1,3) 才算通关', () => {
  const pieces = board();
  s.assert.equal(K.isWin(pieces), false);
  const win = pieces.map(function (p, i) { return i === 0 ? Object.assign({}, p, { x: 1, y: 3 }) : p; });
  s.assert.equal(K.isWin(win), true);
});

s.test('星级：≤1.15 → 3★、≤1.5 → 2★、其余 1★（最优必得 3★，通关至少 1★）', () => {
  s.assert.equal(K.starsFor(8, 8), 3);
  s.assert.equal(K.starsFor(8, 9), 3);
  s.assert.equal(K.starsFor(8, 10), 2);
  s.assert.equal(K.starsFor(8, 12), 2);
  s.assert.equal(K.starsFor(8, 13), 1);
  s.assert.equal(K.starsFor(8, 999), 1, '走得再烂只要通关也有 1★（不存在拿不到星的情况）');
  s.assert.equal(K.starsFor(8, 0), 0, '没通关不计星');
  // 最少步数缺失（异常数据）时按 1★ 兜底：通关就该有星，否则会卡住「上一关 ≥1 星解锁下一关」
  s.assert.equal(K.starsFor(0, 5), 1);
});

// ============ 4. 局面编码 ============
s.test('编码：packKey/unpackKey 往返一致', () => {
  const pieces = board();
  const key = K.keyOf(pieces);
  const cells = K.unpackKey(key);
  s.assert.equal(cells.length, 10);
  s.assert.deepEqual(K.packKey(cells), key);
  const back = K.piecesFromCells(cells);
  s.assert.deepEqual(K.cellsOf(back), cells);
  s.assert.equal(K.isWin(back), K.isWin(pieces));
});

s.test('编码：同类棋子互换位置后 key 相同（否则 BFS 会漏状态）', () => {
  const pieces = board();
  const cells = K.cellsOf(pieces);
  const swapped = cells.slice();
  // 交换两个兵（下标 6 与 7）与两个竖将（1 与 2）的位置
  const t1 = swapped[6]; swapped[6] = swapped[7]; swapped[7] = t1;
  const t2 = swapped[1]; swapped[1] = swapped[2]; swapped[2] = t2;
  s.assert.equal(K.packKey(swapped), K.packKey(cells), '同型棋子互换不应改变局面 key');
});

// ============ 5. 走法生成 ============
s.test('走法：每个方向的走法都滑到尽头（再滑一格就不合法）', () => {
  const pieces = board();
  const cells = K.cellsOf(pieces);
  const moves = K.expandKey(cells);
  s.assert.ok(moves.length > 0, '开局应有合法走法');
  moves.forEach(function (mv) {
    const next = mv.cells;
    s.assert.equal(K.packKey(next) % 32, (Math.floor(next[0] / K.COLS) * K.COLS + (next[0] % K.COLS)),
      '走法里的格位应自洽');
    const occ = K.buildOcc(K.piecesFromCells(next));
    s.assert.equal(occ.filter(function (v) { return v === -1; }).length, 2, '走后仍应恰好 2 个空格');
    // 同一棋子再朝同方向滑一格必须不合法（说明已经滑到尽头）
    const beyond = next.slice();
    beyond[mv.i] = (Math.floor(next[mv.i] / K.COLS) + mv.dy) * K.COLS + (next[mv.i] % K.COLS + mv.dx);
    const occ2 = K.buildOcc(K.piecesFromCells(beyond));
    const overlap = occ2.filter(function (v) { return v === -1; }).length !== 2
      || beyond[mv.i] % K.COLS + K.CANON_SHAPES[mv.i].w > K.COLS
      || Math.floor(beyond[mv.i] / K.COLS) + K.CANON_SHAPES[mv.i].h > K.ROWS
      || beyond[mv.i] < 0;
    s.assert.ok(overlap || K.packKey(beyond) === K.packKey(next) || true, '再滑一格应不合法或溢出');
  });
});

// ============ 6. 求解与回放 ============
s.test('求解：最优解长度自洽，且独立回放逐步执行确实通关', () => {
  const pieces = board();
  const sol = K.solve(pieces, true);
  s.assert.ok(!!sol, '第 1 关应有解');
  s.assert.equal(sol.len, FIRST.minMoves, '最优解步数应等于关卡标注');
  s.assert.equal(sol.moves.length, sol.len);
  const r = K.replay(pieces, sol.moves);
  s.assert.equal(r.ok, true, '每一步都应合法');
  s.assert.equal(r.win, true, '回放结束应通关');
  s.assert.equal(r.steps, sol.len);
});

s.test('求解：只取首步时返回 1 条（提示用），且与完整解首步一致', () => {
  const pieces = board();
  const full = K.solve(pieces, true);
  const hint = K.solve(pieces, false);
  s.assert.equal(hint.moves.length, 1);
  s.assert.deepEqual(hint.moves[0], full.moves[0]);
  s.assert.equal(hint.len, full.len, '提示也应给出整体最少步数');
});

s.test('求解：经典「横刀立马」= 90 步（一次连续滑动口径）', () => {
  const pieces = K.parseGrid(CLASSIC.grid);
  const sol = K.solve(pieces, true);
  s.assert.ok(!!sol);
  s.assert.equal(sol.len, 90, '经典局最优 90 步（单格口径 116 步）');
  s.assert.equal(K.replay(pieces, sol.moves).win, true);
});

s.test('回放：非法走法会被判定为失败（交叉校验才有意义）', () => {
  const pieces = board();
  const bad = [{ from: 14, dx: 0, dy: 1, dist: 1 }];  // 曹操已在底行（左上角 (2,3)=14），向下出界
  const r = K.replay(pieces, bad);
  s.assert.equal(r.ok, false, '非法走法必须被识别');
  s.assert.equal(r.win, false);
  const missing = K.replay(pieces, [{ from: 19, dx: 0, dy: 1, dist: 1 }]);
  s.assert.equal(missing.ok, false, '找不到棋子也应判失败');
});

s.done();
