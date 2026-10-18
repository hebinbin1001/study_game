/**
 * clock.test.js —— 「认钟表」引擎护栏（2026-10-18 新增玩法）
 *
 * 这个玩法的失败模式和其他数字玩法不一样：**表盘画错 / 答案算错，孩子会照着一个错的
 * 表盘读出"正确答案"却被判错**。所以除了常规的选项校验，这里额外钉死两件事：
 *   ① 指针角度必须由 (hh, mm) 精确推出（时针要随分钟连续走，否则半点时仍指着整点）；
 *   ② 答案必须能从 face/prompt 用时钟算法复算出来（不是页面随手填的字符串）。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('认钟表（clock）');

const fs = require('fs');
const path = require('path');
const C = require('../../miniprogram/game/clock');

const LV = C.TOTAL_LEVELS;
const RE12 = /^(1[0-2]|[1-9]):([0-5][0-9])$/;
const RE24 = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;

function clock(level) {
  const out = [];
  for (let i = 1; i <= level; i++) out.push(i);
  return out;
}

function parse12(str) {
  const m = RE12.exec(str);
  return m ? { h: +m[1], m: +m[2] } : null;
}

// ============ 档位 ============

s.test('档位覆盖 1~30，边界 1/6/7/12/13/18/19/24/25/30', () => {
  s.assert.deepEqual(C.allowedKinds(1), ['read']);
  s.assert.deepEqual(C.allowedKinds(6), ['read']);
  s.assert.deepEqual(C.allowedKinds(7), ['read', 'elapsed']);
  s.assert.deepEqual(C.allowedKinds(12), ['read', 'elapsed']);
  s.assert.deepEqual(C.allowedKinds(13), ['read', 'elapsed']);
  s.assert.ok(C.allowedKinds(19).indexOf('elapsed') >= 0);
  s.assert.ok(C.allowedKinds(25).indexOf('h24') >= 0);
  s.assert.ok(C.allowedKinds(30).indexOf('h12') >= 0);
  // 脏参数按边界处理，不崩
  s.assert.deepEqual(C.allowedKinds(0), C.allowedKinds(1));
  s.assert.deepEqual(C.allowedKinds(999), C.allowedKinds(LV));
});

s.test('档位题型只增不减（高关会出送分题，但不会少题型）', () => {
  for (let lv = 2; lv <= LV; lv++) {
    const prev = C.allowedKinds(lv - 1);
    const cur = C.allowedKinds(lv);
    prev.forEach(function (k) {
      s.assert.ok(cur.indexOf(k) >= 0, '第 ' + lv + ' 关比上一关少了题型 ' + k);
    });
  }
});

s.test('第 n 关生成的题型 ∈ 该档允许集合（每关 60 次）', () => {
  clock(LV).forEach(function (lv) {
    const allow = C.allowedKinds(lv);
    for (let k = 0; k < 60; k++) {
      const q = C.gen(lv, (lv * 10007 + k * 7919 + 3) >>> 0);
      s.assert.ok(allow.indexOf(q.kind) >= 0,
        '第 ' + lv + ' 关出现了档位外题型 ' + q.kind);
    }
  });
});

// ============ 题面 / 答案 ============

s.test('指针角度必须由时刻精确推出（时针随分钟走）', () => {
  clock(LV).forEach(function (lv) {
    for (let k = 0; k < 20; k++) {
      const q = C.gen(lv, (lv * 31337 + k * 104729 + 7) >>> 0);
      const h = q.face.h;
      const m = q.face.m;
      s.assert.equal(q.hourDeg, (h % 12) * 30 + m * 0.5,
        '第 ' + lv + ' 关时针角度错（' + h + ':' + m + '）');
      s.assert.equal(q.minDeg, m * 6, '第 ' + lv + ' 关分针角度错（' + h + ':' + m + '）');
      s.assert.ok(q.hourDeg >= 0 && q.hourDeg < 360, '时针角度越界');
      s.assert.ok(q.minDeg >= 0 && q.minDeg < 360, '分针角度越界');
    }
  });
});

s.test('答案必须能从题面复算出来（四类题型各自校验）', () => {
  clock(LV).forEach(function (lv) {
    for (let k = 0; k < 30; k++) {
      const q = C.gen(lv, (lv * 99991 + k * 7919 + 11) >>> 0);
      const face = q.face;

      if (q.kind === 'read') {
        s.assert.equal(q.answer, C.fmt12(face.h, face.m), '认读题答案与表盘不符');
        s.assert.ok(RE12.test(q.answer), '认读题答案不是合法 12 时制：' + q.answer);
      }

      if (q.kind === 'elapsed') {
        const dm = /再过 (\d+) 分钟/.exec(q.sub);
        s.assert.ok(dm, '经过时间题没写"再过 N 分钟"：' + q.sub);
        const delta = +dm[1];
        s.assert.ok(delta > 0, '步长必须为正');
        const to = C.addMinutes(face.h, face.m, delta);
        s.assert.equal(q.answer, C.fmt12(to.h, to.m),
          '经过时间算错：' + C.fmt12(face.h, face.m) + ' + ' + delta + ' 分钟');
        // 20~24 关是"不进位"档，实际不能跨小时
        if (lv >= 19 && lv <= 24) {
          s.assert.ok(face.m + delta < 60,
            '第 ' + lv + ' 关不该出现进位：' + face.m + ' + ' + delta);
        }
      }

      if (q.kind === 'h24') {
        const p = parse12(q.prompt.replace(/^下午 /, ''));
        s.assert.ok(p, '24 时制题的题面不是「下午 h:mm」：' + q.prompt);
        const hh = p.h === 12 ? 12 : p.h + 12;
        s.assert.equal(q.answer, C.fmt24(hh, p.m), '转 24 时制算错');
        s.assert.ok(RE24.test(q.answer), '24 时制答案格式错：' + q.answer);
      }

      if (q.kind === 'h12') {
        const m24 = RE24.exec(q.prompt);
        s.assert.ok(m24, '12 时制题的题面不是 24 时制时刻：' + q.prompt);
        const hh = +m24[1];
        s.assert.ok(hh > 12, '转 12 时制的题面必须在 13 点以后，实际 ' + hh);
        s.assert.equal(q.answer, C.fmt12(hh - 12, +m24[2]), '转 12 时制算错');
      }
    }
  });
});

s.test('分钟精度符合档位：1~6 关只有整点/半点，7~12 关只出 5 的倍数', () => {
  for (let k = 0; k < 400; k++) {
    const a = C.gen(3, (k * 7919 + 5) >>> 0);
    s.assert.ok([0, 30].indexOf(a.face.m) >= 0, '整点档出现了 ' + a.face.m + ' 分');
    const b = C.gen(9, (k * 104729 + 17) >>> 0);
    if (b.kind === 'read') s.assert.equal(b.face.m % 5, 0, '5 分刻度档出现了 ' + b.face.m + ' 分');
  }
});

// ============ 选项 ============

s.test('四个选项：互不相同、恰有一个正确、格式与题型一致', () => {
  clock(LV).forEach(function (lv) {
    for (let k = 0; k < 40; k++) {
      const q = C.gen(lv, (lv * 65537 + k * 7919 + 1) >>> 0);
      s.assert.equal(q.options.length, 4, '第 ' + lv + ' 关选项不是 4 个');
      const vals = q.options.map(function (o) { return o.v; });
      const uniq = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
      s.assert.equal(uniq.length, 4, '第 ' + lv + ' 关选项有重复：' + vals.join(' '));
      const right = q.options.filter(function (o) { return o.ok; });
      s.assert.equal(right.length, 1, '第 ' + lv + ' 关正确答案不是恰好一个');
      s.assert.equal(right[0].v, q.answer, '标 ok 的选项与 answer 不一致');
      const re = q.unit === 'time24' ? RE24 : RE12;
      vals.forEach(function (v) {
        s.assert.ok(re.test(v), '第 ' + lv + ' 关选项格式不属于 ' + q.unit + '：' + v);
      });
    }
  });
});

s.test('干扰项里必须有"像但不对"的时刻（不能四个都是随手加一）', () => {
  // 抽查：认读题的干扰项至少有一个与答案同小时（读错分针）或相邻小时（读错时针）
  for (let k = 0; k < 200; k++) {
    const q = C.gen(10, (k * 7919 + 23) >>> 0);
    if (q.kind !== 'read') continue;
    const a = parse12(q.answer);
    const near = q.options.filter(function (o) {
      if (o.ok) return false;
      const p = parse12(o.v);
      return p && (p.h === a.h || Math.abs(p.h - a.h) === 1);
    });
    s.assert.ok(near.length >= 1, '认读题没有"同小时/邻小时"的干扰项：' + q.answer
      + ' ← ' + q.options.map(function (o) { return o.v; }).join(' '));
  }
});

// ============ 整关 ============

s.test('一整关：10 题、题目不重复、同 seed 可复现', () => {
  clock(LV).forEach(function (lv) {
    const qs = C.genLevel(lv, 12345 + lv);
    s.assert.equal(qs.length, C.QUESTIONS_PER_LEVEL, '第 ' + lv + ' 关题量不对');
    const keys = qs.map(function (q) { return q.kind + '|' + q.face.h + ':' + q.face.m + '|' + q.answer; });
    const uniq = keys.filter(function (v, i) { return keys.indexOf(v) === i; });
    s.assert.equal(uniq.length, keys.length, '第 ' + lv + ' 关有重复题');

    const again = C.genLevel(lv, 12345 + lv);
    s.assert.deepEqual(again.map(function (q) { return q.answer; }),
      qs.map(function (q) { return q.answer; }), '同 seed 不可复现');
  });
});

s.test('空题盘不崩：关卡 0 / 999 / 非数字都按边界处理', () => {
  [0, -3, 999, 'abc', null, undefined].forEach(function (v) {
    const q = C.gen(v, 1);
    s.assert.ok(q && q.options.length === 4, '边界入参生成失败：' + v);
  });
});

s.test('星上限 = 30 关 × 3 星 = 90（首页 getAllStars 会汇总，不能无限刷）', () => {
  s.assert.equal(C.maxStars(), 90);
});

s.test('引擎源码不得出现年级依赖（数字智力统一 grade:all）', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../miniprogram/game/clock.js'), 'utf8');
  // 先剥注释再查：文件头就写着"不接年级"，直接搜字符串会把注释也算进去（误报）
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\r\n]*/g, '');
  ['gradeScale', 'getLastGrade', 'GRADES', 'grade', 'level_grade'].forEach(function (k) {
    s.assert.equal(code.indexOf(k) < 0, true, 'clock.js 代码里出现了年级相关标识：' + k);
  });
});

s.done();
