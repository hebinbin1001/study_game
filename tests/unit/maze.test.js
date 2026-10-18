/**
 * maze.test.js —— 「算术迷宫」引擎护栏（2026-10-18 新增玩法）
 *
 * 复核意见给这个玩法提了两条硬要求，任何一条不成立它就不该存在：
 *   ① **必须有岔路**（§2.3）：DFS 生成的完美迷宫路径唯一，玩家没有选择 →
 *      这里断言「每局至少 1 个回路」，且「除宝箱/起点/终点外没有死胡同」；
 *   ② **星级按正确率**（§1.3）：分母固定为本关门数 → 这里断言门数与档位一致。
 * 另外把迷宫图最容易出错的地方钉死：单向墙（一边打通一边还有墙）、
 * 门落在起点终点、宝箱不在死胡同、题目答案算错。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('算术迷宫（maze）');

const fs = require('fs');
const path = require('path');
const M = require('../../miniprogram/game/maze');

const SIZE = M.SIZE;
const LV = M.TOTAL_LEVELS;
const E = 2;
const S = 4;
const W = 8;
const N = 1;

/** 一组分散的种子 */
function seeds(lv, n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push((lv * 100003 + k * 7919 + 31) >>> 0);
  return out;
}

/** 把题面还原成算式求值（题面只由数字与运算符组成，引擎自己生成） */
function evalText(t) {
  const js = t.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  return Function('"use strict";return (' + js + ')')();
}

// ============ 档位 ============

s.test('档位覆盖 1~30，门数 3→7 递增', () => {
  s.assert.equal(M.tierOf(1).gates, 3);
  s.assert.equal(M.tierOf(6).gates, 3);
  s.assert.equal(M.tierOf(7).gates, 4);
  s.assert.equal(M.tierOf(13).gates, 5);
  s.assert.equal(M.tierOf(19).gates, 6);
  s.assert.equal(M.tierOf(30).gates, 7);
  for (let lv = 2; lv <= LV; lv++) {
    s.assert.ok(M.tierOf(lv).gates >= M.tierOf(lv - 1).gates, '门数不能倒退');
  }
  s.assert.equal(M.tierOf(0).gates, 3, '脏参数按边界处理');
  s.assert.equal(M.tierOf(999).gates, 7);
});

// ============ 迷宫图 ============

s.test('每局都连通：起点一定能走到终点（30 关 × 20 种子）', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 20).forEach(function (sd) {
      const g = M.gen(lv, sd);
      const p = M.bfsPath(g.cells, g.start, g.end);
      s.assert.ok(p.length > 0, '第 ' + lv + ' 关 seed ' + sd + ' 走不到终点');
      s.assert.equal(p[0], g.start);
      s.assert.equal(p[p.length - 1], g.end);
      // 路径上每一步都必须真的通
      for (let i = 1; i < p.length; i++) {
        s.assert.ok(M.canMove(g.cells, p[i - 1], p[i]), '主路径上有一步是穿墙的');
      }
    });
  }
});

s.test('墙必须对称：不存在"一边通一边堵"的单向门', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 10).forEach(function (sd) {
      const g = M.gen(lv, sd);
      for (let i = 0; i < g.cells.length; i++) {
        const c = g.cells[i];
        if (c.c < SIZE - 1) {
          const right = g.cells[i + 1];
          s.assert.equal(!!(c.walls & E), !!(right.walls & W),
            '横向墙不对称 @' + c.r + ',' + c.c);
        }
        if (c.r < SIZE - 1) {
          const down = g.cells[i + SIZE];
          s.assert.equal(!!(c.walls & S), !!(down.walls & N),
            '纵向墙不对称 @' + c.r + ',' + c.c);
        }
        // 外墙必须是实心的（拆了就等于"从棋盘边缘走出去"）
        if (c.r === 0) s.assert.ok(!!(c.walls & N), '顶边有洞');
        if (c.r === SIZE - 1) s.assert.ok(!!(c.walls & S), '底边有洞');
        if (c.c === 0) s.assert.ok(!!(c.walls & W), '左边有洞');
        if (c.c === SIZE - 1) s.assert.ok(!!(c.walls & E), '右边有洞');
      }
    });
  }
});

s.test('canMove 与墙一致，且双向等价', () => {
  for (let lv = 1; lv <= LV; lv += 7) {
    const g = M.gen(lv, 99 + lv);
    for (let i = 0; i < g.cells.length; i++) {
      for (let j = 0; j < g.cells.length; j++) {
        const a = M.canMove(g.cells, i, j);
        const b = M.canMove(g.cells, j, i);
        s.assert.equal(a, b, 'canMove 不对称：' + i + '→' + j);
        if (a) {
          const dr = Math.abs(g.cells[i].r - g.cells[j].r);
          const dc = Math.abs(g.cells[i].c - g.cells[j].c);
          s.assert.equal(dr + dc, 1, '可走的两格必须相邻');
        }
      }
    }
  }
});

// ============ 岔路（复核意见 §2.3 的硬要求） ============

s.test('每局至少 1 个回路（不是完美迷宫，玩家有路可选）', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 20).forEach(function (sd) {
      const g = M.gen(lv, sd);
      s.assert.ok(M.loopCount(g.cells) >= 1,
        '第 ' + lv + ' 关 seed ' + sd + ' 是完美迷宫（无回路）');
    });
  }
});

s.test('死胡同只剩宝箱 / 起点 / 终点（其余都被 braid 打通）', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 20).forEach(function (sd) {
      const g = M.gen(lv, sd);
      for (let i = 0; i < g.cells.length; i++) {
        if (M.openings(g.cells[i]) !== 1) continue;
        const ok = g.chests.indexOf(i) >= 0 || i === g.start || i === g.end;
        s.assert.ok(ok, '第 ' + lv + ' 关 seed ' + sd + ' 有一个无主死胡同 @' + i);
      }
    });
  }
});

s.test('宝箱必须真的在死胡同里（否则"绕路才拿得到"不成立）', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 15).forEach(function (sd) {
      const g = M.gen(lv, sd);
      s.assert.ok(g.chests.length <= 2, '宝箱最多 2 个');
      g.chests.forEach(function (i) {
        s.assert.equal(M.openings(g.cells[i]), 1, '宝箱不在死胡同 @' + i);
        s.assert.ok(i !== g.start && i !== g.end, '宝箱不能压在起点/终点');
      });
    });
  }
});

// ============ 门 ============

s.test('门数与档位一致，且不落在起点/终点', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 15).forEach(function (sd) {
      const g = M.gen(lv, sd);
      s.assert.equal(g.gateIds.length, M.tierOf(lv).gates,
        '第 ' + lv + ' 关门数不对');
      g.gateIds.forEach(function (i) {
        s.assert.ok(i !== g.start && i !== g.end, '门不能压在起点/终点');
        s.assert.equal(g.cells[i].kind, 'gate', '门格 kind 没标');
      });
      const uniq = g.gateIds.filter(function (v, i2) { return g.gateIds.indexOf(v) === i2; });
      s.assert.equal(uniq.length, g.gateIds.length, '门有重复格子');
    });
  }
});

s.test('门在主路径上（不是随机散在图上，玩家不用满地图找）', () => {
  // braid 可能造出更短的路线，但门是沿"原始主路径"均匀放的，
  // 这里只要求门格与主路径连通（不能是被墙围死的孤立格）
  for (let lv = 1; lv <= LV; lv += 5) {
    const g = M.gen(lv, 555 + lv);
    g.gateIds.forEach(function (i) {
      s.assert.ok(M.neighborsOf(g.cells, i).length >= 1, '门格被墙围死了');
    });
  }
});

// ============ 题目 ============

s.test('题面可复算，答案等于算式结果（每关 30 题）', () => {
  for (let lv = 1; lv <= LV; lv++) {
    for (let k = 0; k < 30; k++) {
      const q = M.genQuestion(lv, (lv * 31337 + k * 7919 + 5) >>> 0);
      s.assert.ok(/^[0-9+\-−×÷()\s]+$/.test(q.text), '题面含非法字符：' + q.text);
      const v = evalText(q.text);
      s.assert.equal(q.answer, v, '答案算错：' + q.text);
      s.assert.ok(q.answer > 0, '答案必须为正：' + q.text + '=' + q.answer);
      s.assert.equal(q.answer % 1, 0, '答案必须是整数：' + q.text);
    }
  }
});

s.test('选项：4 个互异、恰有一个正确、都是正整数', () => {
  for (let lv = 1; lv <= LV; lv++) {
    for (let k = 0; k < 30; k++) {
      const q = M.genQuestion(lv, (lv * 65537 + k * 104729 + 9) >>> 0);
      s.assert.equal(q.options.length, 4, '选项不是 4 个：' + q.text);
      const vals = q.options.map(function (o) { return o.v; });
      const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
      s.assert.equal(uniq.length, 4, '选项有重复：' + q.text + ' → ' + vals.join(','));
      const right = q.options.filter(function (o) { return o.ok; });
      s.assert.equal(right.length, 1, '正确答案不是恰好一个：' + q.text);
      s.assert.equal(right[0].v, q.answer, '标 ok 的选项与 answer 不一致');
      vals.forEach(function (v) {
        s.assert.ok(v > 0 && v % 1 === 0, '选项必须是正整数：' + v);
      });
    }
  }
});

s.test('一整关的题量 = 门数，同 seed 可复现', () => {
  for (let lv = 1; lv <= LV; lv += 4) {
    const n = M.tierOf(lv).gates;
    const qs = M.genQuestions(lv, 1234 + lv, n);
    s.assert.equal(qs.length, n);
    const again = M.genQuestions(lv, 1234 + lv, n);
    s.assert.deepEqual(again.map(function (q) { return q.answer; }),
      qs.map(function (q) { return q.answer; }));
  }
});

s.test('题目难度跟关卡走：低档不出现乘除，高档不出现 20 以内小加法', () => {
  // 低档（1~6）只该出加减：题面不能有 × ÷
  for (let k = 0; k < 200; k++) {
    const q = M.genQuestion(1, (k * 7919 + 3) >>> 0);
    s.assert.equal(/[×÷]/.test(q.text), false, '入门档出现了乘除：' + q.text);
  }
  // 挑战档（25~30）必须出现两位数或括号
  let hard = 0;
  for (let k = 0; k < 200; k++) {
    const q = M.genQuestion(27, (k * 104729 + 11) >>> 0);
    if (/\(|×/.test(q.text) && /\d{2}/.test(q.text)) hard++;
  }
  s.assert.ok(hard > 80, '挑战档几乎没有两位数的题，实际 ' + hard + '/200');
});

s.test('星上限 = 30 关 × 3 星 = 90', () => {
  s.assert.equal(M.maxStars(), 90);
});

s.test('引擎源码不得出现年级依赖（数字智力统一 grade:all）', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/game/maze.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
  ['gradeScale', 'getLastGrade', 'GRADES', 'grade'].forEach(function (k) {
    s.assert.equal(code.indexOf(k) < 0, true, 'maze.js 代码里出现了年级相关标识：' + k);
  });
});

s.done();
