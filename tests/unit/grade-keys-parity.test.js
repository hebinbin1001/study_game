/**
 * grade-keys-parity.test.js —— 前后端学段清单一致性
 *
 * 服务端用 GRADE_KEYS 校验每日挑战 / PK 的学段参数；前端 GRADES 决定题源。
 * 将来新增学段（比如再拆一个「研究生」）只改一边，会出现「前端有卡、服务端拒收」。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('前后端学段清单一致性');

const front = require('../../miniprogram/utils/constants');
const back = require('../../server/grade-keys');

s.test('学段 key 与顺序完全一致（14 档）', () => {
  const frontKeys = front.GRADES.map(function (g) { return g.key; });
  s.assert.deepEqual(back.GRADE_KEYS, frontKeys);
  s.assert.equal(back.GRADE_KEYS.length, 14);
});

s.test('isValidGrade：合法通过、非法拒绝（含旧学段 key）', () => {
  s.assert.true(back.isValidGrade('kg'));
  s.assert.true(back.isValidGrade('g1'));
  s.assert.true(back.isValidGrade('college'));
  s.assert.false(back.isValidGrade('primary12'));
  s.assert.false(back.isValidGrade('junior'));
  s.assert.false(back.isValidGrade(''));
  s.assert.false(back.isValidGrade(null));
  s.assert.false(back.isValidGrade('g99'));
});

s.done();
