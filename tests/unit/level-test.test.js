/**
 * level-test.test.js —— 字词定级测（2026-10-28）
 *
 * 为什么值得测：
 *   · 推荐年级是「写进全局设置」的东西，判错了会让整站题目都错档；
 *   · 估算词量会出现在分享卡片上，不能出现 0 或负数；
 *   · 「答对 8 题」有两种完全不同的分布（前段全对 / 每段各错一题），
 *     判定必须看「连续通过」而不是总分，这条最容易在重构时被改坏。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('字词定级测');

const levelTest = require('../../miniprogram/utils/level-test');
const constants = require('../../miniprogram/utils/constants');

/** 造作答记录：passMap = { kg: 2, g3: 0, ... } 表示各段答对几题 */
function answersOf(passMap) {
  const out = [];
  levelTest.LADDER.forEach(function (g) {
    const n = passMap[g] || 0;
    for (let i = 0; i < levelTest.PER_GRADE; i++) {
      out.push({ grade: g, ok: i < n });
    }
  });
  return out;
}

s.test('题目数量与结构：5 段 × 2 题，全部是合法四选一', () => {
  const qs = levelTest.buildTest('unit-seed');
  s.assert.equal(qs.length, levelTest.TOTAL);
  s.assert.equal(qs.length, 10);
  qs.forEach(function (q, i) {
    s.assert.equal(q.options.length, 4, '第 ' + i + ' 题选项数');
    s.assert.ok(levelTest.LADDER.indexOf(q.grade) >= 0, '第 ' + i + ' 题学段合法');
    s.assert.equal(q.gradeLabel, levelTest.labelOf(q.grade), '第 ' + i + ' 题学段名');
    s.assert.ok(q.word && q.word.length > 0, '第 ' + i + ' 题题面非空');
    const hit = q.options.filter(function (o) { return String(o.key) === String(q.answerKey); });
    s.assert.equal(hit.length, 1, '第 ' + i + ' 题 answerKey 唯一');
    s.assert.equal(hit[0].text, q.meaning, '第 ' + i + ' 题答案指向正确项');
  });
});

s.test('由易到难：前两题属于最低学段，最后两题属于最高学段', () => {
  const qs = levelTest.buildTest('unit-seed');
  s.assert.equal(qs[0].grade, levelTest.LADDER[0]);
  s.assert.equal(qs[1].grade, levelTest.LADDER[0]);
  s.assert.equal(qs[qs.length - 1].grade, levelTest.LADDER[levelTest.LADDER.length - 1]);
});

s.test('同一种子可复现，不同种子换题', () => {
  const a = levelTest.buildTest('same');
  const b = levelTest.buildTest('same');
  s.assert.deepEqual(a, b);
  const c = levelTest.buildTest('other');
  const wa = a.map(function (q) { return q.word; }).join('|');
  const wc = c.map(function (q) { return q.word; }).join('|');
  s.assert.notEqual(wa, wc);
});

s.test('全对 → 推荐年级高于最高测试段（初三全对不该还从初三开始）', () => {
  const map = {};
  levelTest.LADDER.forEach(function (g) { map[g] = levelTest.PER_GRADE; });
  const res = levelTest.scoreOf(answersOf(map));
  s.assert.equal(res.correct, 10);
  s.assert.equal(res.rate, 100);
  const g9 = constants.GRADES.map(function (g) { return g.key; }).indexOf('g9');
  const rec = constants.GRADES.map(function (g) { return g.key; }).indexOf(res.grade);
  s.assert.ok(rec > g9, '推荐年级应高于 g9，实际 ' + res.grade);
  s.assert.ok(res.words > 0, '词量应为正数');
  s.assert.equal(res.rows.length, levelTest.LADDER.length);
});

s.test('低段全对、下一段全错 → 停在低段（不能被总分抬高）', () => {
  const res = levelTest.scoreOf(answersOf({ kg: 2, g3: 0 }));
  s.assert.equal(res.grade, 'kg');
  // 4 题对 2 题 = 50%，不是 80% —— 只统计实际作答的 10 题
  s.assert.equal(res.correct, 2);
  s.assert.equal(res.rate, 20);
});

s.test('每段各错一题（总分 50%）与「前两段全对、后面全错」推荐不同', () => {
  const spread = {};
  levelTest.LADDER.forEach(function (g) { spread[g] = 1; });
  const front = { kg: 2, g3: 2 };
  const a = levelTest.scoreOf(answersOf(spread));
  const b = levelTest.scoreOf(answersOf(front));
  s.assert.equal(a.correct, 5);
  s.assert.equal(b.correct, 4);
  // 连续通过：每段都过了至少 1 题 → 会一路走到最高段，再往上推一档
  s.assert.equal(a.grade, 'g10');
  // 前两段全对、g5 一题没对 → 停在 g3（不是按总分 40% 落到 g1~g2）
  s.assert.equal(b.grade, 'g3');
});

s.test('全错 → 落到最低段，评语不为空', () => {
  const res = levelTest.scoreOf(answersOf({}));
  s.assert.equal(res.grade, 'kg');
  s.assert.equal(res.correct, 0);
  s.assert.equal(res.rate, 0);
  s.assert.ok(res.verdict && res.verdict.length > 0);
  s.assert.ok(res.words >= 0);
});

s.test('未作答 / 空数组不崩，返回 0 题', () => {
  const res = levelTest.scoreOf([]);
  s.assert.equal(res.total, 0);
  s.assert.equal(res.rate, 0);
  s.assert.equal(res.grade, 'kg');
  const res2 = levelTest.scoreOf(null);
  s.assert.equal(res2.total, 0);
});

s.test('推荐年级一定在合法学段内，且 words 不小于 0', () => {
  const passKeys = constants.GRADES.map(function (g) { return g.key; });
  // 遍历所有「每段对 0~2 题」的组合（3^5 = 243 种），保证不会推到一个不存在的学段
  const opts = [0, 1, 2];
  let combos = 0;
  opts.forEach(function (a1) {
    opts.forEach(function (a2) {
      opts.forEach(function (a3) {
        opts.forEach(function (a4) {
          opts.forEach(function (a5) {
            const map = {};
            map[levelTest.LADDER[0]] = a1;
            map[levelTest.LADDER[1]] = a2;
            map[levelTest.LADDER[2]] = a3;
            map[levelTest.LADDER[3]] = a4;
            map[levelTest.LADDER[4]] = a5;
            const res = levelTest.scoreOf(answersOf(map));
            s.assert.ok(passKeys.indexOf(res.grade) >= 0, '推荐年级非法：' + res.grade);
            s.assert.ok(res.words >= 0, '词量为负：' + res.words);
            s.assert.ok(res.gradeLabel && res.gradeLabel.length > 0, '缺少学段名');
            combos++;
          });
        });
      });
    });
  });
  s.assert.equal(combos, 243);
});

s.done();
