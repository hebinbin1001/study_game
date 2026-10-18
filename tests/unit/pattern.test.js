/**
 * pattern.test.js —— 「找规律」引擎护栏（2026-10-18 新增玩法）
 *
 * 这个玩法最容易出的三类事故：
 *   ① 题面本身不成立（声明的规则算不出答案）—— 孩子"做对了却被判错"；
 *   ② 选项里出现第二个也对的答案 / 没有正确答案 —— 必答错或必蒙对；
 *   ③ 偷偷按年级出题 —— 与数字智力"全局 grade:'all'"的口径冲突，成绩不可比。
 * 下面把它们全部钉死。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('找规律（pattern）');

const fs = require('fs');
const path = require('path');
const P = require('../../miniprogram/game/pattern');

const LV = P.TOTAL_LEVELS;
const levels = [];
for (let i = 1; i <= LV; i++) levels.push(i);

/** 一组确定但分散的种子，避免只测到某个偶然分支 */
function seedsFor(lv, n) {
  const out = [];
  for (let k = 0; k < n; k++) out.push((lv * 100003 + k * 7919 + 13) >>> 0);
  return out;
}

// ============ 档位表 ============

s.test('档位覆盖 1~30 且边界正确（1/6/7/12/13/18/19/24/25/30）', () => {
  s.assert.deepEqual(P.allowedKinds(1), ['shape', 'arith']);
  s.assert.deepEqual(P.allowedKinds(6), P.allowedKinds(1));
  s.assert.deepEqual(P.allowedKinds(7), ['shape', 'arith', 'dec', 'alt']);
  s.assert.deepEqual(P.allowedKinds(12), P.allowedKinds(7));
  s.assert.ok(P.allowedKinds(13).indexOf('sq') >= 0);
  s.assert.ok(P.allowedKinds(18).indexOf('sq') >= 0);
  s.assert.ok(P.allowedKinds(19).indexOf('alt2') >= 0);
  s.assert.ok(P.allowedKinds(24).indexOf('alt2') >= 0);
  s.assert.ok(P.allowedKinds(25).indexOf('fib') >= 0);
  s.assert.ok(P.allowedKinds(30).indexOf('fib') >= 0);
  // 越界参数按边界处理（关卡页传脏数据不崩）
  s.assert.deepEqual(P.allowedKinds(0), P.allowedKinds(1));
  s.assert.deepEqual(P.allowedKinds(999), P.allowedKinds(LV));
});

s.test('档位题型只增不减（不倒退）', () => {
  for (let lv = 2; lv <= LV; lv++) {
    const prev = P.allowedKinds(lv - 1);
    const cur = P.allowedKinds(lv);
    prev.forEach(function (k) {
      s.assert.ok(cur.indexOf(k) >= 0, '第 ' + lv + ' 关比上一关少了题型 ' + k);
    });
  }
});

s.test('每一关生成的题型都落在该档允许集合内', () => {
  levels.forEach(function (lv) {
    const allow = P.allowedKinds(lv);
    seedsFor(lv, 60).forEach(function (seed) {
      const q = P.gen(lv, seed);
      s.assert.ok(allow.indexOf(q.kind) >= 0,
        '第 ' + lv + ' 关出了档位不允许的题型 ' + q.kind);
    });
  });
});

s.test('入门档（1~6 关）抽 1000 次也不会出现平方数/斐波那契/等比', () => {
  const banned = ['sq', 'fib', 'geo', 'alt2', 'alt', 'dec'];
  for (let k = 0; k < 1000; k++) {
    const q = P.gen(1 + (k % 6), (900000 + k * 7919) >>> 0);
    banned.forEach(function (b) {
      s.assert.notEqual(q.kind, b, '第 ' + (1 + (k % 6)) + ' 关不该出现 ' + b);
    });
  }
});

// ============ 不接年级 ============

s.test('引擎源码里不得出现 grade / getLastGrade / gradeScale（数字智力的口径）', () => {
  const file = path.join(__dirname, '../../miniprogram/game/pattern.js');
  const src = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
  s.assert.equal(src.indexOf('gradeScale'), -1, '找规律不该按学段出题');
  s.assert.equal(src.indexOf('getLastGrade'), -1, '找规律不该读当前年级');
  s.assert.equal(/\bgrade\b/.test(src), false, '找规律引擎里不该出现 grade');
});

// ============ 题面成立 ============

/** 按声明的规则回算，验证 known 与 answer 真的满足规则 */
function checkRule(q) {
  const k = q.known;
  const a = q.answer;

  switch (q.kind) {
    case 'shape': {
      // AB / AABB / ABC 都是"最小周期循环"，统一定义：找最小的 p（2~4）满足
      // k[i] === k[i-p]（对所有 i>=p），答案必须等于 k[len % p]。
      // 7 个已知项的答案下标正好是 7 % p，所以这一条能直接抓住"答案错位"。
      let period = 0;
      for (let p = 2; p <= 4; p++) {
        let ok = true;
        for (let i = p; i < k.length; i++) if (k[i] !== k[i - p]) ok = false;
        if (ok) { period = p; break; }
      }
      s.assert.ok(period > 0, '图形题已知项不构成 2~4 的循环：' + k.join(' '));
      s.assert.equal(a, k[k.length % period], '循环的下一项算错（周期 ' + period + '）');
      break;
    }
    case 'arith': {
      const d = k[1] - k[0];
      s.assert.ok(d > 0, '等差公差应为正');
      for (let i = 1; i < k.length; i++) s.assert.equal(k[i] - k[i - 1], d);
      s.assert.equal(a, k[k.length - 1] + d);
      break;
    }
    case 'dec': {
      const d = k[1] - k[0];
      s.assert.ok(d < 0, '递减数列公差应为负');
      for (let i = 1; i < k.length; i++) s.assert.equal(k[i] - k[i - 1], d);
      s.assert.equal(a, k[k.length - 1] + d);
      s.assert.ok(a > 0, '递减数列不该出现 0 或负数');
      break;
    }
    case 'alt': {
      const a1 = k[1] - k[0];
      const b1 = k[2] - k[1];
      s.assert.ok(a1 > 0 && b1 > 0, '交替加减每步都应递增');
      s.assert.notEqual(a1, b1, '交替的两个步长不该相同');
      for (let i = 2; i < k.length; i++) {
        s.assert.equal(k[i] - k[i - 1], (i % 2 === 0) ? b1 : a1);
      }
      // 步长序列是 [a1, b1, a1, b1 …]，k 有 5 项已用掉 4 步，下一步是第 4 步（偶数 → a1）
      s.assert.equal(a, k[k.length - 1] + (k.length % 2 === 0 ? b1 : a1));
      break;
    }
    case 'geo': {
      for (let i = 1; i < k.length; i++) s.assert.equal(k[i], k[i - 1] * 2);
      s.assert.equal(a, k[k.length - 1] * 2);
      break;
    }
    case 'sq': {
      const r0 = Math.round(Math.sqrt(k[0]));
      s.assert.equal(r0 * r0, k[0], '首项应是完全平方数');
      for (let i = 0; i < k.length; i++) s.assert.equal(k[i], (r0 + i) * (r0 + i));
      const rn = r0 + k.length;
      s.assert.equal(a, rn * rn);
      break;
    }
    case 'alt2': {
      const d0 = k[1] - k[0];
      s.assert.ok(d0 > 0);
      for (let i = 1; i < k.length; i++) {
        s.assert.equal(k[i] - k[i - 1], d0 + (i - 1), '二阶等差"差每次多 1"不成立');
      }
      s.assert.equal(a, k[k.length - 1] + d0 + (k.length - 1));
      break;
    }
    case 'fib': {
      for (let i = 2; i < k.length; i++) s.assert.equal(k[i], k[i - 1] + k[i - 2]);
      s.assert.equal(a, k[k.length - 1] + k[k.length - 2]);
      break;
    }
    default:
      s.assert.fail('未知题型 ' + q.kind);
  }
}

s.test('每一关的题面都严格满足自己声明的规则（1~30 关 × 40 题）', () => {
  levels.forEach(function (lv) {
    seedsFor(lv, 40).forEach(function (seed) {
      checkRule(P.gen(lv, seed));
    });
  });
});

s.test('数值范围：正整数且不超过 3 位数（珠子里放得下）', () => {
  levels.forEach(function (lv) {
    seedsFor(lv, 25).forEach(function (seed) {
      const q = P.gen(lv, seed);
      if (q.unit === 'emoji') return;
      q.known.concat([q.answer]).forEach(function (v) {
        s.assert.equal(typeof v, 'number', '题面出现了非数字');
        s.assert.ok(v > 0 && v % 1 === 0, '题面出现非正整数：' + v);
        s.assert.ok(String(v).length <= 3, '题面出现 4 位数（格子放不下）：' + v);
      });
    });
  });
});

s.test('图形题：答案必须真的出现在序列里（不是凭空造一个 emoji）', () => {
  let checked = 0;
  levels.forEach(function (lv) {
    seedsFor(lv, 20).forEach(function (seed) {
      const q = P.gen(lv, seed);
      if (q.unit !== 'emoji') return;
      checked++;
      s.assert.ok(q.known.indexOf(q.answer) >= 0, '图形题答案不在符号集合里');
    });
  });
  s.assert.ok(checked > 0, '没抽到任何图形题，用例失效');
});

// ============ 选项 ============

s.test('每题恰好 4 个选项，互不相同，且只有一个是正确答案', () => {
  levels.forEach(function (lv) {
    seedsFor(lv, 30).forEach(function (seed) {
      const q = P.gen(lv, seed);
      s.assert.equal(q.options.length, 4, '选项数量不是 4');
      s.assert.allDistinct(q.options.map(function (o) { return o.v; }), '选项重复：' + JSON.stringify(q.options));
      const oks = q.options.filter(function (o) { return o.ok; });
      s.assert.equal(oks.length, 1, '正确答案个数不是 1');
      s.assert.equal(oks[0].v, q.answer, '标记为正确的选项不是答案本身');
    });
  });
});

s.test('干扰项都不等于答案（不能送分）', () => {
  levels.forEach(function (lv) {
    seedsFor(lv, 20).forEach(function (seed) {
      const q = P.gen(lv, seed);
      q.options.forEach(function (o) {
        if (!o.ok) s.assert.notEqual(o.v, q.answer);
      });
    });
  });
});

s.test('数字题的干扰项必须是正整数（不能出现 0 / 负数 / 小数）', () => {
  levels.forEach(function (lv) {
    seedsFor(lv, 20).forEach(function (seed) {
      const q = P.gen(lv, seed);
      if (q.unit === 'emoji') return;
      q.options.forEach(function (o) {
        s.assert.ok(typeof o.v === 'number' && o.v > 0 && o.v % 1 === 0,
          '干扰项不合法：' + o.v);
      });
    });
  });
});

// ============ 整关 ============

s.test('一整关 10 题且题面不重复', () => {
  levels.forEach(function (lv) {
    const qs = P.genLevel(lv, lv * 37 + 101);
    s.assert.equal(qs.length, P.QUESTIONS_PER_LEVEL);
    const keys = qs.map(function (q) { return q.known.join('|') + '>' + q.answer; });
    s.assert.allDistinct(keys, '第 ' + lv + ' 关出现重复题目');
  });
});

s.test('重玩换题：同关不同 seed 得到不同题面', () => {
  let diff = 0;
  for (let k = 0; k < 20; k++) {
    const a = P.genLevel(13, 1000 + k * 977);
    const b = P.genLevel(13, 2000 + k * 1337);
    if (a.map(function (q) { return q.known.join(','); }).join('#')
      !== b.map(function (q) { return q.known.join(','); }).join('#')) diff++;
  }
  s.assert.ok(diff >= 18, '两套题应几乎全不同，实际只差 ' + diff + '/20');
});

// ============ 星星经济 ============

s.test('星上限 = 30 关 × 3 星 = 90（不能无限刷星）', () => {
  s.assert.equal(P.TOTAL_LEVELS, 30);
  s.assert.equal(P.maxStars(), 90);
});

s.done();
