/**
 * type-label.test.js —— 类型码中文名映射
 *
 * 2026-10-18 用户反馈：学习报告「薄弱题型（错题分布）」直接显示 w1/c1/match，
 * 玩家看不懂。这里钉死：词库 8 类型码与常见玩法来源都必须有中文名，
 * 且不允许把内部码原样当作展示名。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('类型码中文名');

const constants = require('../../miniprogram/utils/constants');
const typeLabel = require('../../miniprogram/utils/type-label');

s.test('词库 8 类型码都有中文名（且不是内部码本身）', () => {
  constants.TYPE_CODES.forEach((code) => {
    const name = typeLabel.labelOf(code);
    s.assert.ok(!!name, code + ' 缺少中文名');
    s.assert.ok(name !== code, code + ' 仍显示内部码');
  });
});

s.test('常见玩法来源使用玩家熟悉的玩法名', () => {
  s.assert.equal(typeLabel.labelOf('match'), '词义消消乐');
  s.assert.equal(typeLabel.labelOf('link'), '词语连连看');
  s.assert.equal(typeLabel.labelOf('idiom'), '成语拼字');
  s.assert.equal(typeLabel.labelOf('word_build'), '字母拼词');
  s.assert.equal(typeLabel.labelOf('word_warrior'), '字母射击');
});

s.test('空值与未知码有兜底，不会渲染成 undefined', () => {
  s.assert.equal(typeLabel.labelOf(''), '其他');
  s.assert.equal(typeLabel.labelOf(null), '其他');
  s.assert.equal(typeLabel.labelOf(undefined), '其他');
  s.assert.equal(typeLabel.labelOf('unknown_x'), 'unknown_x');
});

s.test('报告页的数据映射使用 typeLabel 字段', () => {
  const fs = require('fs');
  const path = require('path');
  const wxml = fs.readFileSync(
    path.join(__dirname, '../../miniprogram/pages/report/report.wxml'), 'utf8');
  s.assert.ok(wxml.indexOf('{{item.typeLabel}}') >= 0, '报告页未使用中文类型名');
  s.assert.ok(wxml.indexOf('{{item.type}}') < 0, '报告页仍直接绑定内部类型码');
});

s.done();
