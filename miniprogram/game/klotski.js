/**
 * game/klotski.js —— 华容道引擎（纯逻辑，无 wx 依赖，可单测）
 *
 * 玩法（对齐参考实现 E:\Code\小程序\huarongdao，规则经穷举校验）：
 *   · 5 行 × 4 列棋盘，标准 10 子：曹操 2×2 ×1、竖将 1×2 ×4、横将 2×1 ×1、小兵 1×1 ×4
 *     （占 18 格，留 2 个空格）；
 *   · 拖动棋子沿直线滑到尽头；**一次连续滑动算 1 步**（滑得越远越省步数）；
 *   · 把曹操的左上角移到 (1,3)（即底边中间 2×2 出口）即通关；
 *   · 星级按「实际步数 / 理论最少步数」：≤1.15 → 3★、≤1.5 → 2★，否则 1★。
 *
 * 设计要点：
 *   1. 棋子按规范顺序排列（曹操 → 4 竖将 → 横将 → 4 兵）；
 *      但**走法不用「棋子下标」标识**：局面打包时同类棋子会按格位重排，下标在回放时会串位。
 *      走法统一写作 [棋子左上角格位, dx, dy, 格数]（与参考实现一致），任何局面都能唯一定位棋子；
 *   2. 局面压成**单个整数**（10 个格位 × 5 bit = 50 bit，JS 双精度可安全表示），
 *      BFS 去重与存档都用它；
 *   3. 求解是纯计算（BFS），关卡数据里仍会预存最优解：正常通关流程不必现算，
 *      只有玩家走偏后的「提示」才现算。
 *
 * 关联：pages/klotski（页面）、data/klotski-levels.js（30 关构建产物）、e2e/gen-klotski-levels.js（生成器）
 */

'use strict';

const COLS = 4;
const ROWS = 5;
const CELLS = COLS * ROWS;

// 曹操左上角到达此格即通关（底边中间 2×2）
const GOAL_X = 1;
const GOAL_Y = 3;
const GOAL_CELL = GOAL_Y * COLS + GOAL_X;   // 13

// 字形 → 名称与尺寸（兵是 1×1，多格会拆成多个独立棋子）
const PIECE_META = {
  '曹': { name: '曹操', kind: 'cao', w: 2, h: 2 },
  '关': { name: '关羽', kind: 'h',   w: 2, h: 1 },
  '张': { name: '张飞', kind: 'v',   w: 1, h: 2 },
  '赵': { name: '赵云', kind: 'v',   w: 1, h: 2 },
  '马': { name: '马超', kind: 'v',   w: 1, h: 2 },
  '黄': { name: '黄忠', kind: 'v',   w: 1, h: 2 },
  '兵': { name: '兵',   kind: 's',   w: 1, h: 1 }
};

// 规范顺序下的形状表（下标 0~9 与走法里的棋子下标一一对应）
const CANON_SHAPES = [
  { w: 2, h: 2 },                                             // 0 曹操
  { w: 1, h: 2 }, { w: 1, h: 2 }, { w: 1, h: 2 }, { w: 1, h: 2 }, // 1~4 竖将
  { w: 2, h: 1 },                                             // 5 横将
  { w: 1, h: 1 }, { w: 1, h: 1 }, { w: 1, h: 1 }, { w: 1, h: 1 }  // 6~9 兵
];

// 5 bit × 10 = 50 bit，用 2 的幂累加（避免位运算 32 位截断）
const POW32 = [1, 32, 1024, 32768, 1048576, 33554432, 1073741824, 34359738368, 1099511627776, 35184372088832];

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * 解析关卡网格（5 行 × 4 列的字符串数组）→ 规范顺序的棋子数组。
 * 严格校验形状与数量：曹操 1、竖将 4、横将 1、兵 4（多一个少一个都直接报错）。
 * @param {string[]} grid 如 ['兵兵关关', '.张黄兵', '赵张黄.', '赵马曹曹', '兵马曹曹']
 * @returns {Array<{glyph:string,name:string,kind:string,x:number,y:number,w:number,h:number}>}
 */
function parseGrid(grid) {
  if (!Array.isArray(grid) || grid.length !== ROWS) {
    throw new Error('关卡网格必须是 ' + ROWS + ' 行');
  }
  const cellsOf = {};
  for (let y = 0; y < ROWS; y++) {
    const row = String(grid[y]).split('');
    if (row.length !== COLS) throw new Error('每行必须是 ' + COLS + ' 个字符');
    for (let x = 0; x < COLS; x++) {
      const g = row[x];
      if (g === '.' || g === ' ') continue;
      if (!PIECE_META[g]) throw new Error('未知棋子字形: ' + g);
      (cellsOf[g] = cellsOf[g] || []).push([x, y]);
    }
  }

  const pieces = [];
  Object.keys(cellsOf).forEach((g) => {
    const meta = PIECE_META[g];
    const cells = cellsOf[g];
    if (meta.kind === 's') {
      // 兵：每个格子是独立棋子
      cells.forEach(([x, y]) => {
        pieces.push({ glyph: g, name: meta.name, kind: 's', x: x, y: y, w: 1, h: 1 });
      });
      return;
    }
    // 其余字形：要求同字形的格子构成若干个「实心矩形」（连通块逐一校验）
    const set = {};
    cells.forEach(([x, y]) => { set[x + ',' + y] = 1; });
    const seen = {};
    cells.forEach(([sx, sy]) => {
      const startKey = sx + ',' + sy;
      if (seen[startKey]) return;
      const comp = [];
      const stack = [[sx, sy]];
      seen[startKey] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        comp.push([cx, cy]);
        [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]].forEach(([nx, ny]) => {
          const k = nx + ',' + ny;
          if (set[k] && !seen[k]) { seen[k] = 1; stack.push([nx, ny]); }
        });
      }
      const xs = comp.map((c) => c[0]);
      const ys = comp.map((c) => c[1]);
      const x0 = Math.min.apply(null, xs);
      const y0 = Math.min.apply(null, ys);
      const w = Math.max.apply(null, xs) - x0 + 1;
      const h = Math.max.apply(null, ys) - y0 + 1;
      if (w !== meta.w || h !== meta.h || comp.length !== meta.w * meta.h) {
        throw new Error('棋子「' + g + '」应构成 ' + meta.w + '×' + meta.h + ' 实心块，实际 ' + comp.length + ' 格');
      }
      pieces.push({ glyph: g, name: meta.name, kind: meta.kind, x: x0, y: y0, w: meta.w, h: meta.h });
    });
  });

  const count = { cao: 0, v: 0, h: 0, s: 0 };
  pieces.forEach((p) => { count[p.kind]++; });
  if (count.cao !== 1) throw new Error('曹操必须恰好 1 个');
  if (count.v !== 4 || count.h !== 1 || count.s !== 4) {
    throw new Error('棋子数量应为 竖4/横1/兵4，实际 竖' + count.v + '/横' + count.h + '/兵' + count.s);
  }

  return sortCanonical(pieces);
}

/**
 * 按规范顺序排序：曹操 → 竖将（按格位升序）→ 横将 → 兵（按格位升序）。
 * 走法数据里的「棋子下标」就是这个顺序。
 */
function sortCanonical(pieces) {
  const order = { cao: 0, v: 1, h: 2, s: 3 };
  return pieces.slice().sort((a, b) => {
    const ka = order[a.kind];
    const kb = order[b.kind];
    if (ka !== kb) return ka - kb;
    return (a.y * COLS + a.x) - (b.y * COLS + b.x);
  });
}

/** 占位表：长度 20，值为棋子下标或 -1 */
function buildOcc(pieces) {
  const occ = new Array(CELLS).fill(-1);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    for (let dy = 0; dy < p.h; dy++) {
      for (let dx = 0; dx < p.w; dx++) occ[(p.y + dy) * COLS + (p.x + dx)] = i;
    }
  }
  return occ;
}

/**
 * 某棋子沿单位方向最多能滑几格（0 = 被挡住 / 出界）。
 */
function maxSlide(occ, pieces, i, dx, dy) {
  const p = pieces[i];
  if (!p) return 0;
  let n = 0;
  for (let step = 1; step <= COLS + ROWS; step++) {
    const nx = p.x + dx * step;
    const ny = p.y + dy * step;
    if (nx < 0 || ny < 0 || nx + p.w > COLS || ny + p.h > ROWS) break;
    let free = true;
    for (let yy = ny; yy < ny + p.h && free; yy++) {
      for (let xx = nx; xx < nx + p.w; xx++) {
        const o = occ[yy * COLS + xx];
        if (o !== -1 && o !== i) { free = false; break; }
      }
    }
    if (!free) break;
    n = step;
  }
  return n;
}

/**
 * 执行一次滑动（不改原数组）。dist 会被夹到实际可滑范围内。
 * @returns {{pieces:Array, moved:boolean, dist:number}}
 */
function applyMove(pieces, i, dx, dy, dist) {
  const occ = buildOcc(pieces);
  const can = maxSlide(occ, pieces, i, dx, dy);
  const n = Math.min(can, Math.max(0, parseInt(dist, 10) || 0));
  if (!n) return { pieces: pieces, moved: false, dist: 0 };
  const next = pieces.map((p, idx) => (idx === i ? Object.assign({}, p, { x: p.x + dx * n, y: p.y + dy * n }) : p));
  return { pieces: next, moved: true, dist: n };
}

/** 是否通关（曹操左上角到出口） */
function isWin(pieces) {
  const cao = pieces[0];
  return !!cao && cao.kind === 'cao' && cao.x === GOAL_X && cao.y === GOAL_Y;
}

/** 规范顺序的棋子 → 10 个格位（用于打包） */
function cellsOf(pieces) {
  return pieces.map((p) => p.y * COLS + p.x);
}

/** 格位数组排序规则：曹操(0) / 竖将(1~4 升序) / 横将(5) / 兵(6~9 升序) */
function canonicalCells(cells) {
  const v = cells.slice(1, 5).sort((a, b) => a - b);
  const s = cells.slice(6, 10).sort((a, b) => a - b);
  return [cells[0]].concat(v, [cells[5]], s);
}

/** 打包成单个整数（BFS 去重 / 存档用） */
function packKey(cells) {
  const c = canonicalCells(cells);
  let k = 0;
  for (let i = 0; i < 10; i++) k += c[i] * POW32[i];
  return k;
}

/** 解包回 10 个格位（规范顺序） */
function unpackKey(key) {
  const out = new Array(10);
  let rest = key;
  for (let i = 0; i < 10; i++) {
    out[i] = rest % 32;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/** 由格位还原成棋子数组（UI/回放用） */
function piecesFromCells(cells) {
  return cells.map((cell, i) => {
    const shape = CANON_SHAPES[i];
    const glyph = i === 0 ? '曹' : (i === 5 ? '关' : (i >= 6 ? '兵' : ''));
    const meta = i === 0 ? PIECE_META['曹'] : (i === 5 ? PIECE_META['关'] : (i >= 6 ? PIECE_META['兵'] : { name: '将' }));
    return {
      glyph: glyph || '将',
      name: meta.name || '将',
      kind: i === 0 ? 'cao' : (i === 5 ? 'h' : (i >= 6 ? 's' : 'v')),
      x: cell % COLS,
      y: Math.floor(cell / COLS),
      w: shape.w,
      h: shape.h
    };
  });
}

/** 当前局面的 key */
function keyOf(pieces) {
  return packKey(cellsOf(pieces));
}

/**
 * 由格位展开全部合法滑动（一次滑到底算一步）。
 * @param {number[]} cells 规范顺序的 10 个格位
 * @returns {Array<{i:number,to:number,dx:number,dy:number,dist:number}>}
 */
function expandKey(cells) {
  const occ = new Array(CELLS).fill(-1);
  for (let i = 0; i < 10; i++) {
    const shape = CANON_SHAPES[i];
    const x = cells[i] % COLS;
    const y = Math.floor(cells[i] / COLS);
    for (let dy = 0; dy < shape.h; dy++) {
      for (let dx = 0; dx < shape.w; dx++) occ[(y + dy) * COLS + (x + dx)] = i;
    }
  }
  const out = [];
  for (let i = 0; i < 10; i++) {
    const shape = CANON_SHAPES[i];
    const x0 = cells[i] % COLS;
    const y0 = Math.floor(cells[i] / COLS);
    DIRS.forEach(([dx, dy]) => {
      for (let step = 1; step <= COLS + ROWS; step++) {
        const x = x0 + dx * step;
        const y = y0 + dy * step;
        if (x < 0 || y < 0 || x + shape.w > COLS || y + shape.h > ROWS) break;
        let free = true;
        for (let yy = y; yy < y + shape.h && free; yy++) {
          for (let xx = x; xx < x + shape.w; xx++) {
            const o = occ[yy * COLS + xx];
            if (o !== -1 && o !== i) { free = false; break; }
          }
        }
        if (!free) break;
        const next = cells.slice();
        next[i] = y * COLS + x;
        out.push({ i: i, from: cells[i], to: y * COLS + x, dx: dx, dy: dy, dist: step, cells: next });
      }
    });
  }
  return out;
}

/**
 * 从某局面 BFS 求最优解（层序搜索，首次到达出口即最优）。
 * @param {number} key 当前局面
 * @param {boolean} [full] true 返回完整解法（演示用）；false 只返回第一步（提示用）
 * @param {number} [maxDepth] 安全上限（默认 400，远超本棋盘理论最远 101 步）
 * @returns {{moves:Array<{from:number,dx:number,dy:number,dist:number}>, len:number}|null}
 */
function solveKey(key, full, maxDepth) {
  const limit = maxDepth || 400;
  if (key % 32 === GOAL_CELL) return { moves: [], len: 0 };
  const parent = {};                    // key(string) → { prev, move }  （对象比 Map 在小程序里更省）
  parent[key] = null;
  let frontier = [key];
  let depth = 0;
  while (frontier.length && depth < limit) {
    const next = [];
    for (let f = 0; f < frontier.length; f++) {
      const k = frontier[f];
      const moves = expandKey(unpackKey(k));
      for (let m = 0; m < moves.length; m++) {
        const mv = moves[m];
        const nk = packKey(mv.cells);
        if (parent[nk] !== undefined) continue;
        parent[nk] = { prev: k, move: { from: mv.from, dx: mv.dx, dy: mv.dy, dist: mv.dist } };
        if (nk % 32 === GOAL_CELL) {
          const path = [];
          let cur = nk;
          while (parent[cur]) {
            path.push(parent[cur].move);
            cur = parent[cur].prev;
          }
          path.reverse();
          return full ? { moves: path, len: path.length } : { moves: path.slice(0, 1), len: path.length };
        }
        next.push(nk);
      }
    }
    frontier = next;
    depth++;
  }
  return null;
}

/** 从棋子局面直接求解（便捷入口） */
function solve(pieces, full, maxDepth) {
  return solveKey(keyOf(pieces), full, maxDepth);
}

/**
 * 在给定局面上依次回放走法，返回 { pieces, ok }；
 * 任何一步非法（被挡/出界）都会把 ok 置为 false，供测试与生成器做正确性校验。
 * @param {Array} pieces 起始局面
 * @param {Array} moves 走法 [棋子左上角格位, dx, dy, 格数] 或 {from,dx,dy,dist}
 */
function replay(pieces, moves) {
  let cur = pieces;
  let ok = true;
  let count = 0;
  (moves || []).forEach((mv) => {
    const m = Array.isArray(mv)
      ? { from: mv[0], dx: mv[1], dy: mv[2], dist: mv[3] }
      : { from: mv.from, dx: mv.dx, dy: mv.dy, dist: mv.dist };
    const idx = cur.findIndex((p) => p.y * COLS + p.x === m.from);
    if (idx < 0) { ok = false; return; }
    const r = applyMove(cur, idx, m.dx, m.dy, m.dist);
    if (!r.moved || r.dist !== m.dist) ok = false;
    cur = r.pieces;
    count++;
  });
  return { pieces: cur, ok: ok, steps: count, win: isWin(cur) };
}

/**
 * 找到当前局面里「左上角在 from 格」的棋子下标（UI 提示/演示用）。
 * @returns {number} 找不到返回 -1
 */
function indexAt(pieces, fromCell) {
  for (let i = 0; i < pieces.length; i++) {
    if (pieces[i].y * COLS + pieces[i].x === fromCell) return i;
  }
  return -1;
}

/**
 * 星级：实际步数 / 理论最少步数 —— ≤1.15 → 3★、≤1.5 → 2★，否则 1★。
 * 说明：只要通关就至少 1★（不会出现「拿不到星」的死区）；理论上按最优解走必得 3★。
 */
function starsFor(minMoves, moves) {
  const best = Math.max(1, parseInt(minMoves, 10) || 0);
  const used = Math.max(0, parseInt(moves, 10) || 0);
  if (!used) return 0;
  const ratio = used / best;
  // 加一点容差：免得「恰好 1.15 倍」因浮点误差掉到 2★（如 115/100）
  const EPS = 1e-9;
  if (ratio <= 1.15 + EPS) return 3;
  if (ratio <= 1.5 + EPS) return 2;
  return 1;
}

/** 把走法压成紧凑数组（关卡数据里存这个，最省体积） */
function packMoves(moves) {
  return (moves || []).map((m) => [m.from, m.dx, m.dy, m.dist]);
}

module.exports = {
  COLS: COLS,
  ROWS: ROWS,
  CELLS: CELLS,
  GOAL_X: GOAL_X,
  GOAL_Y: GOAL_Y,
  GOAL_CELL: GOAL_CELL,
  PIECE_META: PIECE_META,
  CANON_SHAPES: CANON_SHAPES,
  parseGrid: parseGrid,
  sortCanonical: sortCanonical,
  buildOcc: buildOcc,
  maxSlide: maxSlide,
  applyMove: applyMove,
  isWin: isWin,
  cellsOf: cellsOf,
  piecesFromCells: piecesFromCells,
  packKey: packKey,
  unpackKey: unpackKey,
  keyOf: keyOf,
  expandKey: expandKey,
  solveKey: solveKey,
  solve: solve,
  replay: replay,
  indexAt: indexAt,
  starsFor: starsFor,
  packMoves: packMoves
};
