/**
 * ipa.test.js —— 英语词条音标护栏
 *
 * 音标由 tools/dict/add-ipa.js 在构建期写进 data/*.js（小程序端跑不了词典库）。
 * 以后补词表如果忘了跑这个脚本，英语词就会出现「有单词没音标」——
 * 单看数据是合法的，只有真出到那道题才发现，所以这里钉一条覆盖率护栏。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('英语词条音标');

const dict = require('../../miniprogram/utils/dict');

const GRADES = ['kg', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12', 'college'];
const EN_TYPES = ['w1', 'w2', 'trans', 'fill'];
const CN_TYPES = ['c1', 'c2', 'xhy', 'zc'];

s.test('英语词条音标覆盖率 ≥ 95%（构建期脚本漏跑会掉下来）', () => {
  let total = 0;
  let withIpa = 0;
  const low = [];
  GRADES.forEach(function (g) {
    const en = dict.loadBuiltin(g).filter(function (it) { return EN_TYPES.indexOf(it.type) >= 0; });
    const got = en.filter(function (it) { return !!it.ipa; }).length;
    total += en.length;
    withIpa += got;
    const rate = en.length ? got / en.length : 1;
    if (en.length >= 20 && rate < 0.95) low.push(g + ':' + Math.round(rate * 100) + '%');
  });
  const overall = total ? withIpa / total : 0;
  s.assert.true(overall >= 0.95, '总覆盖率 ' + Math.round(overall * 100) + '%');
  s.assert.deepEqual(low, [], '这些学段低于 95%：' + low.join(','));
});

s.test('音标格式干净：不带斜杠、不带音节点、不带零宽字符', () => {
  GRADES.forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      if (!it.ipa) return;
      const v = String(it.ipa);
      s.assert.false(v.indexOf('/') >= 0, g + ' 残留斜杠：' + v);
      s.assert.false(v.indexOf('.') >= 0, g + ' 残留音节点：' + v);
      s.assert.false(/[\u200b-\u200d\ufeff]/.test(v), g + ' 残留零宽字符：' + v);
      s.assert.true(v.length >= 2 && v.length <= 40, g + ' 音标长度异常：' + v);
      s.assert.equal(v, v.trim(), g + ' 音标首尾有空格：' + JSON.stringify(v));
    });
  });
});

s.test('汉字/成语类词条不应带英语音标', () => {
  GRADES.forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      if (CN_TYPES.indexOf(it.type) < 0) return;
      s.assert.false(!!it.ipa, g + ' 汉字词条带了音标：' + it.q);
    });
  });
});

s.test('抽样检查：常见词的音标符合预期', () => {
  const find = function (grade, word) {
    return dict.loadBuiltin(grade).filter(function (it) {
      return String(it.a || '').toLowerCase() === word;
    })[0];
  };
  const apple = find('kg', 'apple') || find('g1', 'apple');
  s.assert.true(!!apple && /æ/.test(apple.ipa), 'apple 音标应含 æ，实际 ' + (apple && apple.ipa));
  const cat = find('kg', 'cat');
  s.assert.true(!!cat && /k/.test(cat.ipa), 'cat 音标应含 k，实际 ' + (cat && cat.ipa));
});

s.done();
