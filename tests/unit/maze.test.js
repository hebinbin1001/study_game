/**
 * maze.test.js —— 「词义迷宫」引擎护栏（2026-10-21 由算术迷宫重做）
 *
 * 重点：
 *   ① 迷宫图必须连通、有回路、宝箱在死胡同；门/起点/终点不重叠；
 *   ② 门题必须全部是「词/成语 → 中文释义」，4 选 1、答案唯一；
 *   ③ 同 seed 同题（断点续玩 / 固定牌面）；
 *   ④ 引擎保持纯逻辑：不读年级、不读词库、不碰 wx；词库由页面传入。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('词义迷宫（maze）');

const fs = require('fs');
const path = require('path');
const M = require('../../miniprogram/game/maze');
const dict = require('../../miniprogram/utils/dict');

const SIZE = M.SIZE;
const LV = M.TOTAL_LEVELS;
const E = 2;
const S = 4;
const W = 8;
const N = 1;

function seeds(lv, n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push((lv * 100003 + k * 7919 + 31) >>> 0);
  return out;
}

function mixedPool() {
  const out = [];
  ['g1', 'g3', 'g6', 'g9', 'g12'].forEach(function (g) {
    out.push.apply(out, dict.loadByGrade(g) || []);
  });
  return out;
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

s.test('每局都连通：起点一定能走到终点（30 关 × 10 种子）', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 10).forEach(function (sd) {
      const g = M.gen(lv, sd);
      const p = M.bfsPath(g.cells, g.start, g.end);
      s.assert.ok(p.length > 0, '第 ' + lv + ' 关 seed ' + sd + ' 走不到终点');
      s.assert.equal(p[0], g.start);
      s.assert.equal(p[p.length - 1], g.end);
      for (let i = 1; i < p.length; i++) {
        s.assert.ok(M.canMove(g.cells, p[i - 1], p[i]), '主路径上有一步是穿墙的');
      }
    });
  }
});

s.test('墙对称、外墙实心、canMove 双向等价', () => {
  for (let lv = 1; lv <= LV; lv += 5) {
    const g = M.gen(lv, 99 + lv);
    for (let i = 0; i < g.cells.length; i++) {
      const c = g.cells[i];
      if (c.c < SIZE - 1) {
        s.assert.equal(!!(c.walls & E), !!(g.cells[i + 1].walls & W), '横向墙不对称');
      }
      if (c.r < SIZE - 1) {
        s.assert.equal(!!(c.walls & S), !!(g.cells[i + SIZE].walls & N), '纵向墙不对称');
      }
      if (c.r === 0) s.assert.ok(!!(c.walls & N), '顶边有洞');
      if (c.r === SIZE - 1) s.assert.ok(!!(c.walls & S), '底边有洞');
      if (c.c === 0) s.assert.ok(!!(c.walls & W), '左边有洞');
      if (c.c === SIZE - 1) s.assert.ok(!!(c.walls & E), '右边有洞');
      for (let j = 0; j < g.cells.length; j++) {
        s.assert.equal(M.canMove(g.cells, i, j), M.canMove(g.cells, j, i), 'canMove 不对称');
      }
    }
  }
});

s.test('每局至少 1 个回路；宝箱在死胡同且不压起点/终点', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 10).forEach(function (sd) {
      const g = M.gen(lv, sd);
      s.assert.ok(M.loopCount(g.cells) >= 1, '第 ' + lv + ' 关没有回路');
      s.assert.ok(g.chests.length <= 2, '宝箱最多 2 个');
      g.chests.forEach(function (i) {
        s.assert.equal(M.openings(g.cells[i]), 1, '宝箱不在死胡同 @' + i);
        s.assert.ok(i !== g.start && i !== g.end, '宝箱不能压在起点/终点');
      });
      for (let i = 0; i < g.cells.length; i++) {
        if (M.openings(g.cells[i]) !== 1) continue;
        s.assert.ok(g.chests.indexOf(i) >= 0 || i === g.start || i === g.end,
          '第 ' + lv + ' 关有无主死胡同 @' + i);
      }
    });
  }
});

s.test('门数与档位一致、不压起点终点、每道门都可达', () => {
  for (let lv = 1; lv <= LV; lv++) {
    seeds(lv, 10).forEach(function (sd) {
      const g = M.gen(lv, sd);
      s.assert.equal(g.gateIds.length, M.tierOf(lv).gates);
      g.gateIds.forEach(function (i) {
        s.assert.ok(i !== g.start && i !== g.end, '门不能压在起点/终点');
        s.assert.equal(g.cells[i].kind, 'gate');
        s.assert.ok(M.bfsPath(g.cells, g.start, i).length > 0, '门不可达 @' + i);
      });
    });
  }
});

// ============ 词义题 ============

s.test('词义题：题面/释义/4 个互异选项/唯一答案（30 关 × 20 题）', () => {
  const pool = mixedPool();
  s.assert.ok(pool.length > 100, '测试词库太小');
  for (let lv = 1; lv <= LV; lv++) {
    for (let k = 0; k < 20; k++) {
      const q = M.genWordQuestion(lv, (lv * 65537 + k * 104729 + 9) >>> 0, pool);
      s.assert.ok(q, '第 ' + lv + ' 关第 ' + k + ' 题生成失败');
      s.assert.ok(q.text && q.text.length > 0, '题面为空');
      s.assert.ok(q.text.indexOf('*') < 0, '题面仍含挖空星号：' + q.text);
      s.assert.ok(q.prompt && q.prompt.length > 0, '缺少答题提示');
      s.assert.ok(typeof q.answer === 'string' && q.answer.length > 0, '答案为空');
      s.assert.equal(q.options.length, 4);
      const vals = q.options.map(function (o) { return o.v; });
      s.assert.equal(vals.filter(function (v, i) { return vals.indexOf(v) === i; }).length, 4,
        '选项有重复：' + vals.join(','));
      const right = q.options.filter(function (o) { return o.ok; });
      s.assert.equal(right.length, 1, '正确答案不是恰好一个');
      s.assert.equal(right[0].v, q.answer, 'ok 选项与 answer 不一致');
    }
  }
});

s.test('同 seed 同题；低档偏短词、高档偏成语', () => {
  const pool = mixedPool();
  for (let lv = 1; lv <= LV; lv += 4) {
    const a = M.genWordQuestion(lv, 1234 + lv, pool);
    const b = M.genWordQuestion(lv, 1234 + lv, pool);
    s.assert.deepEqual(
      { text: a.text, answer: a.answer, options: a.options.map(function (o) { return o.v + ':' + o.ok; }) },
      { text: b.text, answer: b.answer, options: b.options.map(function (o) { return o.v + ':' + o.ok; }) }
    );
  }
  // 低档只从 w1/c1 里取（词库足够，不会回退全量）
  for (let k = 0; k < 30; k++) {
    const q = M.genWordQuestion(1, (k * 7919 + 3) >>> 0, pool);
    s.assert.ok(q.type === 'w1' || q.type === 'c1', '低档出现了高难题型：' + q.type);
  }
});

s.test('小词库可出题；空词库安全返回 null', () => {
  const tiny = [
    { type: 'w1', q: 'cat', a: 'cat', hint: '猫' },
    { type: 'w1', q: 'dog', a: 'dog', hint: '狗' },
    { type: 'w1', q: 'book', a: 'book', hint: '书' },
    { type: 'w1', q: 'water', a: 'water', hint: '水' }
  ];
  const q = M.genWordQuestion(1, 77, tiny);
  s.assert.ok(q);
  s.assert.equal(q.options.length, 4);
  s.assert.equal(M.genWordQuestion(1, 77, []), null);
});

s.test('一整关题量 = 门数，同 seed 可复现', () => {
  const pool = mixedPool();
  for (let lv = 1; lv <= LV; lv += 4) {
    const n = M.tierOf(lv).gates;
    const qs = M.genWordQuestions(lv, 1234 + lv, n, pool);
    s.assert.equal(qs.length, n);
    const again = M.genWordQuestions(lv, 1234 + lv, n, pool);
    s.assert.deepEqual(again.map(function (q) { return q.answer; }),
      qs.map(function (q) { return q.answer; }));
  }
});

s.test('星上限 = 30 关 × 3 星 = 90', () => {
  s.assert.equal(M.maxStars(), 90);
});

s.test('引擎保持纯逻辑：不读年级 / 词库 / wx', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/game/maze.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
  ['getLastGrade', 'loadByGrade', 'require(\'../../utils/dict\')', 'require(\'../../utils/storage\')', 'wx.']
    .forEach(function (k) {
      s.assert.equal(code.indexOf(k) < 0, true, 'maze.js 代码里出现了非纯逻辑标识：' + k);
    });
});

s.done();
