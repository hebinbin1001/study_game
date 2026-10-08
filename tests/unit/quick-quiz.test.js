/**
 * quick-quiz.test.js —— 每日挑战 / 好友 PK 的组题
 *
 * 为什么值得测：
 *   · 同一个种子必须得到完全一样的题面与选项顺序（否则 PK 双方不是同一套题、
 *     每日挑战「全服同题」也失真）；
 *   · 选项必须恰好 4 个、含且仅含 1 个正确项。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('每日挑战 / PK 组题');

const quiz = require('../../miniprogram/utils/quick-quiz');

s.test('同一种子 → 完全相同的题面与选项顺序', () => {
  const a = quiz.buildQuiz('g3', 'daily:2026-10-08:g3', 10);
  const b = quiz.buildQuiz('g3', 'daily:2026-10-08:g3', 10);
  s.assert.deepEqual(a, b);
  s.assert.equal(a.length, 10);
});

s.test('不同种子 → 题目顺序不同（不能永远一套）', () => {
  const a = quiz.buildQuiz('g3', 'seed-a', 10);
  const b = quiz.buildQuiz('g3', 'seed-b', 10);
  const wordsA = a.map(function (q) { return q.word; }).join('|');
  const wordsB = b.map(function (q) { return q.word; }).join('|');
  s.assert.notEqual(wordsA, wordsB);
});

s.test('每题恰好 4 个选项，且只含 1 个正确项', () => {
  const list = quiz.buildQuiz('g4', 'check-options', 12);
  s.assert.equal(list.length, 12);
  list.forEach(function (q, i) {
    s.assert.equal(q.options.length, 4, '第 ' + i + ' 题选项数');
    const texts = q.options.map(function (o) { return o.text; });
    s.assert.equal(new Set(texts).size, 4, '第 ' + i + ' 题选项去重');
    const hit = q.options.filter(function (o) { return o.text === q.meaning; });
    s.assert.equal(hit.length, 1, '第 ' + i + ' 题正确项唯一');
    s.assert.equal(q.options[parseInt(q.answerKey, 10)].text, q.meaning, '第 ' + i + ' 题 answerKey 指向正确项');
  });
});

s.test('题面不为空、不含挖空星号', () => {
  ['kg', 'g1', 'g6', 'g7', 'g12', 'college'].forEach(function (g) {
    const list = quiz.buildQuiz(g, 'word-check:' + g, 5);
    list.forEach(function (q) {
      s.assert.true(q.word.length > 0, g + ' 题面为空');
      s.assert.false(q.word.indexOf('*') >= 0, g + ' 题面残留星号：' + q.word);
    });
  });
});

s.test('题库为空/非法学段 → 返回空数组，不抛异常', () => {
  s.assert.deepEqual(quiz.buildQuiz('not-a-grade', 'x', 10), []);
  s.assert.deepEqual(quiz.buildQuiz('', 'x', 10), []);
});

s.test('请求题数超过题库容量时取全量（不报错）', () => {
  const list = quiz.buildQuiz('g1', 'all', 9999);
  s.assert.true(list.length > 0);
  s.assert.true(list.length <= 9999);
});

s.done();
