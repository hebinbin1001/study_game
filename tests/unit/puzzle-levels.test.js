/**
 * puzzle-levels.test.js —— 数字智力关卡表（第三批 · 第 4 条地基）
 *
 * 口径（用户 2026-09-13 拍板）：
 *   · 口算冲刺 / 算式天平：按年级分档（每学段一关）
 *   · 记忆矩阵：按格子数 × 数字位数分档
 *   · 24点/数独/华容道/一笔画：沿用现成关卡表的数量
 *   · 2048：不设上限（0），按可达性扩关
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('数字智力关卡表');

const lv = require('../../miniprogram/utils/puzzle-levels');
const constants = require('../../miniprogram/utils/constants');

s.test('口算冲刺 / 算式天平：按年级分档，一学段一关', () => {
  ['sprint', 'balance'].forEach(function (k) {
    const list = lv.levelsOf(k);
    s.assert.equal(list.length, constants.GRADES.length, k + ' 应有 7 档');
    s.assert.equal(list[0].params.grade, constants.GRADES[0].key);
    s.assert.equal(list[6].params.grade, constants.GRADES[6].key);
    list.forEach(function (it, i) {
      s.assert.equal(it.no, i + 1);
      s.assert.ok(!!it.sub, k + ' 第 ' + it.no + ' 关要有难度说明');
    });
  });
});

s.test('记忆矩阵：格子数 × 数字位数分档，至少 30 关', () => {
  const list = lv.levelsOf('memory');
  s.assert.ok(list.length >= 30, '实际 ' + list.length);
  s.assert.ok(list[0].params.rows >= 2 && list[0].params.cols >= 2);
  s.assert.ok(list[list.length - 1].params.digits >= list[0].params.digits, '数字位数应递增');
  s.assert.contains(list[0].sub, '格');
});

s.test('固定关卡表玩法：数量与现成数据一致', () => {
  s.assert.equal(lv.levelsOf('math24').length, 60);
  s.assert.equal(lv.levelsOf('sudoku').length, 60);
  s.assert.equal(lv.levelsOf('klotski').length, 30);
  s.assert.equal(lv.levelsOf('onestroke').length, 34);
  s.assert.equal(lv.totalOf('onestroke'), 34);
});

s.test('2048：不设上限（0），不返回假关卡列表', () => {
  s.assert.equal(lv.totalOf('g2048'), 0);
  s.assert.equal(lv.levelsOf('g2048').length, 0);
});

s.test('未知玩法：返回空数组而不是抛错', () => {
  s.assert.deepEqual(lv.levelsOf('not-a-game'), []);
  s.assert.deepEqual(lv.levelsOf(''), []);
  s.assert.deepEqual(lv.levelsOf(null), []);
});
