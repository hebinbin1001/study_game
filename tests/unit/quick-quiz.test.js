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

// ---- buildQuizFromItems（2026-10-28 生词本组局）----

s.test('buildQuizFromItems：同种子出同一套题（重练不该靠记位置蒙对）', () => {
  const items = [
    { word: 'apple', hint: '苹果' },
    { word: 'banana', hint: '香蕉' },
    { word: 'cat', hint: '猫' },
  ];
  const pool = quiz.buildQuiz('g3', 'pool-seed', 10);
  const a = quiz.buildQuizFromItems(items, 'fav-1', 3, pool);
  const b = quiz.buildQuizFromItems(items, 'fav-1', 3, pool);
  s.assert.deepEqual(a, b);
  s.assert.equal(a.length, 3);
});

s.test('buildQuizFromItems：干扰项来自传入的词库池，而不是只有收藏的那几个', () => {
  const items = [{ word: 'apple', hint: '苹果' }];
  const pool = quiz.buildQuiz('g3', 'pool-seed', 30);
  const list = quiz.buildQuizFromItems(items, 'fav-2', 1, pool);
  s.assert.equal(list.length, 1);
  const q = list[0];
  s.assert.equal(q.word, 'apple');
  s.assert.equal(q.options.length, 4); // 只收藏 1 个词也能凑满 4 个选项
  const texts = q.options.map(function (o) { return o.text; });
  s.assert.true(texts.indexOf('苹果') >= 0);
  // 干扰项不能是兜底占位 —— 那说明池子没被用上
  s.assert.false(texts.indexOf('以上都不是') >= 0);
});

s.test('buildQuizFromItems：收藏项没有 a/q 字段也能出题（wordOf 兼容 item.word）', () => {
  const items = [
    { word: 'take off', hint: '起飞' },
    { word: 'look up', hint: '查阅' },
  ];
  const list = quiz.buildQuizFromItems(items, 'fav-3', 2, []);
  s.assert.equal(list.length, 2);
  list.forEach(function (q) {
    s.assert.true(q.word.length > 0);
    s.assert.equal(q.options.length, 4);
  });
  s.assert.equal(quiz.wordOf({ word: 'hello' }), 'hello');
});

s.test('buildQuizFromItems：空列表返回空数组，不抛异常（空生词本点组局）', () => {
  s.assert.deepEqual(quiz.buildQuizFromItems([], 'x', 10), []);
  s.assert.deepEqual(quiz.buildQuizFromItems(null, 'x', 10), []);
});

s.done();
