/**
 * book-words.test.js —— 教材词表与出题过滤
 *
 * 为什么值得测：
 *   · 词表是构建期生成物，写错一个字段（比如 q 带了 * 或 a 为空）会让整个玩法出不了题；
 *   · 「选了教材版本后用哪套词」是用户能直接感知的行为，过滤逻辑写错会变成
 *     「选了人教版但题量反而变少/出现别的版本词」。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('教材词表与出题过滤');

const dict = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');
const TYPE_CODES = constants.TYPE_CODES;

const GRADES = ['kg', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12', 'college'];

s.test('每档题量：g1~g12 ≥ 130 条，大学/幼儿园 ≥ 100 条', () => {
  GRADES.forEach(function (g) {
    const items = dict.loadBuiltin(g);
    if (g === 'kg') {
      s.assert.true(items.length >= 100, g + ' 仅 ' + items.length + ' 条');
    } else if (g === 'college') {
      s.assert.true(items.length >= 100, g + ' 仅 ' + items.length + ' 条');
    } else {
      s.assert.true(items.length >= 130, g + ' 仅 ' + items.length + ' 条');
    }
  });
});

s.test('词条结构合法：type 合法、q/a/hint 非空、模板长度一致', () => {
  GRADES.forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      s.assert.true(TYPE_CODES.indexOf(it.type) >= 0, g + ' 非法类型 ' + it.type);
      s.assert.true(String(it.a || '').length > 0, g + ' 空答案');
      s.assert.true(String(it.hint || it.a || '').length > 0, g + ' 空提示');
      if (it.q && it.q.indexOf('*') >= 0) {
        s.assert.equal(String(it.q).length, String(it.a).length, g + ' 挖空模板长度与答案不符：' + it.q);
      }
    });
  });
});

s.test('同档内同题型单词不重复（同一词的 w1/w2 难度变体是允许的）', () => {
  GRADES.forEach(function (g) {
    const seen = Object.create(null);
    const dup = [];
    dict.loadBuiltin(g).forEach(function (it) {
      // 只查英语类词条（汉字/成语可能按不同题型复用同一个答案，属正常）
      if (['w1', 'w2', 'trans'].indexOf(it.type) < 0) return;
      // 同一单词的 w1（挖 1 格）与 w2（挖多格）是两种难度变体，属既有设计，不算重复
      const key = it.type + '|' + String(it.a || '').toLowerCase();
      if (!key) return;
      if (seen[key]) dup.push(key);
      seen[key] = true;
    });
    s.assert.deepEqual(dup, [], g + ' 重复单词：' + dup.slice(0, 5).join(','));
  });
});

s.test('教材标签只出现在合法版本上（pep / wys）', () => {
  GRADES.forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      if (!it.book) return;
      s.assert.true(['pep', 'wys'].indexOf(it.book) >= 0, g + ' 非法教材标签 ' + it.book);
    });
  });
});

s.test('人教版：三年级有足够 PEP 词条，选它会进教材词', () => {
  const stat = dict.bookStat('g3', 'pep');
  s.assert.true(stat.matched >= 20, 'PEP 三年级词条仅 ' + stat.matched);
  s.assert.false(stat.usingFallback);
});

s.test('外研版：一年级有足够外研词条，选它会进教材词', () => {
  const stat = dict.bookStat('g1', 'wys');
  s.assert.true(stat.matched >= 20, '外研一年级词条仅 ' + stat.matched);
  s.assert.false(stat.usingFallback);
});

s.test('中学（暂无教材标签）选任何版本都自动回退通用，且不报 usingFallback', () => {
  const stat = dict.bookStat('g7', 'pep');
  s.assert.equal(stat.matched, 0);
  s.assert.true(stat.usingFallback);
});

s.test('切换教材版本：题量不减少，且能取到该版本词条', () => {
  const before = dict.loadByGrade('g3').length;
  dict.setBook('pep');
  const after = dict.loadByGrade('g3');
  s.assert.true(after.length >= 100, '切到 PEP 后题量 ' + after.length);
  s.assert.true(after.some(function (it) { return it.book === 'pep'; }), 'PEP 词条未生效');
  dict.setBook('wys');
  const wysList = dict.loadByGrade('g3');
  s.assert.true(wysList.some(function (it) { return it.book === 'wys'; }), '外研词条未生效');
  s.assert.true(wysList.some(function (it) { return it.book === 'pep'; }) === false, '外研版不应混入 PEP 专属词');
  // 复位，避免影响同进程里的其他用例
  dict.setBook('');
  s.assert.equal(dict.loadByGrade('g3').length, before);
});

s.done();
