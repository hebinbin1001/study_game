/**
 * tests/unit/puzzle-resume.test.js —— 断点续玩存档模块
 *
 * 覆盖：写入/读取往返、关卡匹配、过期作废、版本不兼容作废、超长拒写、
 *       序列化异常不抛错、clear/has/levelOf、存储 key 口径。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/puzzle-resume');

// storage 在非 wx 环境用内存兜底，测试之间手动清干净
const storage = require('../../miniprogram/utils/storage');
const resume = require('../../miniprogram/utils/puzzle-resume');

function reset(game) {
  resume.clear(game || 'klotski');
}

s.test('写入后能原样读回', () => {
  reset();
  const state = { pieces: [{ glyph: '曹', x: 1, y: 3 }], moves: 17 };
  s.assert.true(resume.save('klotski', 5, state));
  const snap = resume.load('klotski');
  s.assert.ok(snap);
  s.assert.equal(snap.game, 'klotski');
  s.assert.equal(snap.level, 5);
  s.assert.equal(snap.v, resume.VERSION);
  s.assert.deepEqual(snap.state, state);
  s.assert.true(typeof snap.ts === 'number' && snap.ts > 0);
});

s.test('loadFor 只在关卡匹配时返回', () => {
  reset();
  resume.save('g2048', 7, { board: [2, 0, 0, 0] });
  s.assert.ok(resume.loadFor('g2048', 7));
  s.assert.equal(resume.loadFor('g2048', 8), null);
  // 关卡不匹配时**不清除**存档：用户只是点进了别的关
  s.assert.ok(resume.load('g2048'), '不匹配时不应清掉存档');
  s.assert.equal(resume.levelOf('g2048'), 7);
  reset('g2048');
});

s.test('clear 之后读不到，has 为假', () => {
  reset();
  s.assert.false(resume.has('maze'));
  resume.save('maze', 3, { pos: 12 });
  s.assert.true(resume.has('maze'));
  resume.clear('maze');
  s.assert.false(resume.has('maze'));
  s.assert.equal(resume.load('maze'), null);
  s.assert.equal(resume.levelOf('maze'), 0);
});

s.test('超过有效期的存档自动作废并清除', () => {
  reset('hanoi');
  // 直接写一条 8 天前的快照，绕过 save 的 ts
  storage.set(resume.keyOf('hanoi'), {
    v: resume.VERSION, game: 'hanoi', level: 2,
    ts: Date.now() - (resume.MAX_AGE_MS + 24 * 3600 * 1000),
    state: { steps: 9 }
  });
  s.assert.equal(resume.load('hanoi'), null);
  s.assert.equal(storage.get(resume.keyOf('hanoi')), '', '过期快照应被清掉，不能一直占位');
});

s.test('版本号不匹配的旧存档直接作废', () => {
  reset('sudoku');
  storage.set(resume.keyOf('sudoku'), {
    v: resume.VERSION + 1, game: 'sudoku', level: 1, ts: Date.now(), state: { n: 4 }
  });
  s.assert.equal(resume.load('sudoku'), null);
  s.assert.equal(storage.get(resume.keyOf('sudoku')), '');
});

s.test('超过 64KB 的快照拒写，且不会留下旧残档', () => {
  reset('one-stroke');
  resume.save('one-stroke', 1, { path: [0, 1] });
  const huge = { path: new Array(20000).fill('x'.repeat(8)) };
  s.assert.false(resume.save('one-stroke', 1, huge));
  s.assert.equal(resume.load('one-stroke'), null, '超长快照应把旧档一并清掉，避免读到自相矛盾的残局');
});

s.test('不可序列化的状态不抛错、返回 false', () => {
  reset('math24');
  const circ = { a: 1 };
  circ.self = circ;                       // 循环引用 → JSON.stringify 抛 TypeError
  s.assert.false(resume.save('math24', 1, circ));
  s.assert.equal(resume.load('math24'), null);
});

s.test('参数非法时不写入', () => {
  reset('clock');
  s.assert.false(resume.save('', 1, { a: 1 }), '缺玩法 key');
  s.assert.false(resume.save('clock', 0, { a: 1 }), '关卡号 < 1');
  s.assert.false(resume.save('clock', 1, null), '状态为 null');
  s.assert.false(resume.save('clock', 1, undefined), '状态为 undefined');
  s.assert.equal(resume.load('clock'), null);
});

s.test('key 口径固定为 ww_resume_<game>', () => {
  s.assert.equal(resume.keyOf('klotski'), 'ww_resume_klotski');
  s.assert.equal(resume.keyOf(''), 'ww_resume_');
  reset('klotski');
  resume.save('klotski', 1, { moves: 0 });
  s.assert.ok(storage.get('ww_resume_klotski'), '应写入约定的 key');
  reset('klotski');
});

s.test('不同玩法互不覆盖', () => {
  reset('klotski');
  reset('maze');
  resume.save('klotski', 3, { moves: 5 });
  resume.save('maze', 9, { pos: 30 });
  s.assert.equal(resume.load('klotski').level, 3);
  s.assert.equal(resume.load('maze').level, 9);
  reset('klotski');
  reset('maze');
});

s.done();
