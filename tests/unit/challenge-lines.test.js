/**
 * challenge-lines.test.js —— 玩法线（P3 一期）单元测试
 *
 * 背景（用户 2026-09-13 反馈）：
 *   「闯关学习只有从字母射击才可以进去，其他题库的玩法都是单独的」——改造前 6 款题库玩法
 *   点进去都是自由练、不写任何进度。一期给每款玩法各做一条 30 关玩法线。
 *
 * 覆盖（这几条都是踩过坑或会踩坑的点，改动时别绕开）：
 *   1. 规模与形状：6 条线 × 每学段 30 关，lineLevelAt 字段齐备；
 *   2. 命名空间：玩法线一律 mode_ 前缀，且与主线 @challenge@、「按题型练」@idiom@ 不撞车
 *      （成语拼字的玩法 key 就叫 idiom，不加前缀会覆盖题型练习的存档）；
 *   3. 可复现：同关同种子、跨关/跨学段/跨玩法不同；
 *   4. 难度递增：射击题量 10→15（命数同步 5→6）、拼词/成语题量递增、贪吃蛇词数递增、
 *      配对类固定 8 对（版式已定型）；
 *   5. 星级可达性：每档参数下 1/2/3 星都拿得到（R1 同类护栏，别再造出 1 星死区）；
 *   6. contextOf：主线/玩法线/非法 line 回退、seed 覆盖、存档键；
 *   7. lineProgress：已通关数 / 星数 / 下一关。
 *
 * 运行：node tests/unit/challenge-lines.test.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('玩法线（P3 一期）');

const challenge = require('../../miniprogram/utils/challenge');
const constants = require('../../miniprogram/utils/constants');

const ROOT = path.join(__dirname, '..', '..', 'miniprogram');
const GRADES = constants.GRADES.map(function (g) { return g.key; });

// ============ 1. 规模与形状 ============
s.test('规模：6 条玩法线，每条每学段 30 关', () => {
  s.assert.equal(challenge.LINE_MODES.length, 6);
  challenge.LINE_MODES.forEach(function (mode) {
    s.assert.ok(challenge.MODES[mode], mode + ' 必须是 MODES 里已有的玩法');
    GRADES.forEach(function (g) {
      const rows = challenge.lineLevelsOf(g, mode);
      s.assert.equal(rows.length, 30, g + '/' + mode + ' 应有 30 关');
      s.assert.equal(rows[0].level, 1);
      s.assert.equal(rows[29].level, 30);
      rows.forEach(function (r) {
        s.assert.equal(r.mode, mode);
        s.assert.equal(r.line, challenge.lineKeyOf(mode));
        s.assert.equal(r.isBoss, false, '玩法线没有 Boss 关');
        s.assert.equal(!!r.seed, true);
        s.assert.equal(!!r.sub, true, '每关要有参数摘要（关卡行副标题）');
      });
    });
  });
});

s.test('页面存在：每条线指向的玩法页四件套齐全', () => {
  challenge.LINE_MODES.forEach(function (mode) {
    const page = challenge.lineLevelAt('primary34', mode, 1).page;
    ['js', 'wxml', 'wxss', 'json'].forEach(function (ext) {
      s.assert.true(fs.existsSync(path.join(ROOT, page.replace(/^\//, '') + '.' + ext)),
        page + '.' + ext + ' 不存在');
    });
  });
});

s.test('越界与非法玩法：返回 null，不抛错', () => {
  s.assert.equal(challenge.lineLevelAt('primary34', 'link', 0), null);
  s.assert.equal(challenge.lineLevelAt('primary34', 'link', 31), null);
  s.assert.equal(challenge.lineLevelAt('primary34', 'notAMode', 1), null);
  s.assert.equal(challenge.lineUrl('primary34', 'notAMode', 1), '');
});

// ============ 2. 命名空间 ============
s.test('命名空间：玩法线一律 mode_ 前缀，且不与主线/题型练习撞车', () => {
  s.assert.equal(challenge.lineKeyOf('idiom'), 'mode_idiom');
  s.assert.equal(challenge.lineKeyOf('link'), 'mode_link');
  s.assert.equal(challenge.isLineKey('mode_link'), true);
  s.assert.equal(challenge.isLineKey('link'), false, '裸玩法 key 不是线 key');
  s.assert.equal(challenge.isLineKey('challenge'), false);
  s.assert.equal(challenge.isLineKey('idiom'), false, '题型分组 key 不能被当成玩法线');
  s.assert.equal(challenge.lineMode('mode_link'), 'link');
  s.assert.equal(challenge.lineMode('challenge'), '');
  s.assert.equal(challenge.lineMode('idiom'), '');
  // 关键：成语拼字玩法线 ≠ 成语题型练习的存档键
  s.assert.notEqual(challenge.lineKeyOf('idiom'), 'idiom');
});

s.test('存档键形状：<学段>@<线>@<关卡>', () => {
  const ctx = challenge.contextOf({
    challenge: '1', line: 'mode_link', grade: 'primary34', level: 7, seed: '123'
  });
  s.assert.equal(ctx.key, 'primary34@mode_link@7');
  s.assert.equal(ctx.isChallenge, true);
  s.assert.equal(ctx.mode, 'link');
  s.assert.equal(ctx.line, 'mode_link');
  s.assert.equal(ctx.seed, 123);
});

// ============ 3. 可复现 ============
s.test('种子：同关可复现、跨关/跨学段/跨玩法不同', () => {
  const a = challenge.lineSeedOf('primary34', 'link', 3);
  const b = challenge.lineSeedOf('primary34', 'link', 3);
  s.assert.equal(a, b, '同一关两次必须一致');
  s.assert.notEqual(a, challenge.lineSeedOf('primary34', 'link', 4), '不同关应不同');
  s.assert.notEqual(a, challenge.lineSeedOf('primary34', 'snake', 3), '不同玩法应不同');
  s.assert.notEqual(a, challenge.lineSeedOf('junior', 'link', 3), '不同学段应不同');
  // 与主线同 (学段, 关卡) 也不能撞：两套题的种子来源不同
  s.assert.notEqual(a, challenge.seedOf('primary34', 3), '玩法线种子不应等于主线种子');
});

// ============ 4. 难度递增 ============
s.test('难度递增：射击 10→15 题、命数 5→6（题量涨了必须同步加命）', () => {
  const first = challenge.lineParams('primary34', 'shoot', 1);
  const last = challenge.lineParams('primary34', 'shoot', 30);
  s.assert.equal(first.totalQ, 10);
  s.assert.equal(first.lives, 5);
  s.assert.equal(last.totalQ, 15);
  s.assert.equal(last.lives, 6);
  let prev = 0;
  for (let lv = 1; lv <= 30; lv++) {
    const p = challenge.lineParams('primary34', 'shoot', lv);
    s.assert.ok(p.totalQ >= prev, '题量不应回退');
    prev = p.totalQ;
  }
});

s.test('难度递增：拼词/成语题量、贪吃蛇词数单调不减', () => {
  ['wordBuild', 'idiom'].forEach(function (mode) {
    const first = challenge.lineParams('primary34', mode, 1).count;
    const last = challenge.lineParams('primary34', mode, 30).count;
    s.assert.ok(last > first, mode + ' 末档题量应大于首档');
  });
  const snakeFirst = challenge.lineParams('primary34', 'snake', 1).words;
  const snakeLast = challenge.lineParams('primary34', 'snake', 30).words;
  s.assert.ok(snakeLast > snakeFirst, '贪吃蛇末档词数应大于首档');
});

s.test('配对类（消消乐/连连看）一期不递增：牌面固定，不改版式', () => {
  ['match', 'link'].forEach(function (mode) {
    for (let lv = 1; lv <= 30; lv++) {
      s.assert.equal(challenge.lineParams('primary34', mode, lv).pairs, 8,
        mode + ' 第 ' + lv + ' 关对数必须固定 8（4×4 版式）');
    }
  });
});

// ============ 5. 星级可达性 ============
s.test('星级可达性：射击每档 1/2/3 星都拿得到', () => {
  for (let lv = 1; lv <= 30; lv++) {
    const p = challenge.lineParams('primary34', 'shoot', lv);
    const r = challenge.starReachability(p.totalQ, p.lives);
    s.assert.deepEqual(r.reachable, [1, 2, 3],
      '第 ' + lv + ' 关（' + p.totalQ + ' 题 / ' + p.lives + ' 命，最低通关 '
      + r.minRate.toFixed(1) + '%）三档星都必须可达');
    s.assert.ok(r.minRate >= 60, '通关最低正确率不应低于 60%（否则通关拿不到星）');
  }
});

s.test('星级可达性：拼词/成语每档 1 星与 3 星都可拿', () => {
  GRADES.forEach(function (g) {
    ['wordBuild', 'idiom'].forEach(function (mode) {
      for (let lv = 1; lv <= 30; lv += 5) {
        const p = challenge.lineParams(g, mode, lv);
        const r = challenge.starReachability(p.count, 5);
        s.assert.ok(r.reachable.indexOf(3) >= 0, g + '/' + mode + '/' + lv + ' 应能拿 3 星');
        s.assert.ok(r.reachable.indexOf(1) >= 0, g + '/' + mode + '/' + lv + ' 应能拿 1 星');
      }
    });
  });
});

// ============ 6. contextOf ============
s.test('contextOf：主线行为与改造前完全一致', () => {
  const ctx = challenge.contextOf({ challenge: '1', grade: 'primary34', level: 4 });
  const lv = challenge.levelAt('primary34', 4);
  s.assert.equal(ctx.line, 'challenge');
  s.assert.equal(ctx.key, 'primary34@challenge@4');
  s.assert.equal(ctx.mode, lv.mode);
  s.assert.equal(ctx.seed, challenge.seedOf('primary34', 4));
  s.assert.equal(ctx.isChallenge, true);
  s.assert.equal(!!ctx.label, true);
});

s.test('contextOf：非法/缺参不会把自己当成挑战局', () => {
  s.assert.equal(challenge.contextOf({}).isChallenge, false);
  s.assert.equal(challenge.contextOf({ challenge: '1' }).isChallenge, false, '缺 grade/level 不算挑战局');
  s.assert.equal(challenge.contextOf({ challenge: '0', grade: 'primary34', level: 1 }).isChallenge, false);
  // 非法 line 回退主线（老链接不带 line，行为不变）
  const ctx = challenge.contextOf({ challenge: '1', line: 'bogus', grade: 'primary34', level: 4 });
  s.assert.equal(ctx.line, 'challenge');
  s.assert.equal(ctx.key, 'primary34@challenge@4');
});

s.test('lineUrl：带 challenge/line/grade/level/seed', () => {
  const url = challenge.lineUrl('primary34', 'link', 7);
  s.assert.contains(url, '/pages/link/link?challenge=1');
  s.assert.contains(url, 'line=mode_link');
  s.assert.contains(url, 'grade=primary34');
  s.assert.contains(url, 'level=7');
  s.assert.contains(url, 'seed=' + challenge.lineSeedOf('primary34', 'link', 7));
});

// ============ 7. lineProgress ============
s.test('lineProgress：已通关数 / 星数 / 下一关', () => {
  const stars = {};
  stars['primary34@mode_link@1'] = 3;
  stars['primary34@mode_link@2'] = 2;
  stars['primary34@challenge@1'] = 3;      // 主线存档不该被算进来
  stars['primary34@idiom@1'] = 3;          // 题型练习存档也不该被算进来
  const p = challenge.lineProgress(stars, 'primary34', 'link');
  s.assert.equal(p.cleared, 2);
  s.assert.equal(p.earned, 5);
  s.assert.equal(p.total, 90);
  s.assert.equal(p.next, 3);
});

s.test('lineProgress：全空 / 全通 / 缺参边界', () => {
  const empty = challenge.lineProgress({}, 'primary34', 'snake');
  s.assert.equal(empty.cleared, 0);
  s.assert.equal(empty.earned, 0);
  s.assert.equal(empty.next, 1);
  const full = {};
  for (let i = 1; i <= 30; i++) full['primary34@mode_snake@' + i] = 3;
  const f = challenge.lineProgress(full, 'primary34', 'snake');
  s.assert.equal(f.cleared, 30);
  s.assert.equal(f.earned, 90);
  s.assert.equal(f.next, 30, '全通后 next 停在最后一关（继续刷星）');
  s.assert.equal(challenge.lineProgress(null, 'primary34', 'snake').cleared, 0);
});
