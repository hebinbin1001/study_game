/**
 * book-sync.test.js —— 题库与教材的同步护栏（2026-10-18 全量审计后新增）
 *
 * 为什么需要：
 *   题库是"内容资产"，改它不会报错，只会悄悄让孩子做到不属于自己年级的词。
 *   2026-10-18 全量审计实际查出三类问题，都已修掉，这个文件负责不让它们回来：
 *     ① 通用词越级：一年级通用词表里混着 grape / watermelon（教材三年级才教）；
 *     ② 音标重音错位：从 ipa-dict 直接抄来的是 /kˈæt/，教材是 /kæt/；
 *     ③ 教材版本覆盖被误读：一二年级没有人教版词条、中学没有分版本词表。
 *
 * 口径（判断"这个年级该不该出现这个词"）：
 *   以 tools/dict/book-words-*.js（教材词表源）里该词**最早出现的年级**为准。
 *   通用词出现在比它更低的年级 → 越级。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('题库与教材同步');

const dict = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');
const pep = require('../../tools/dict/book-words-pep');
const wys = require('../../tools/dict/book-words-wys');
const { countNuclei, normalizeStress, normalizeSymbols } = require('../../tools/dict/ipa-normalize');

const G = ['kg', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12', 'college'];
const idx = {};
G.forEach(function (g, i) { idx[g] = i; });

/** 词 → 教材最早出现的年级（PEP 从三年级起，外研版从一年级起） */
const firstBookGrade = {};
function mark(word, g) {
  const k = String(word || '').toLowerCase();
  if (!k || idx[g] === undefined) return;
  if (!firstBookGrade[k] || idx[g] < idx[firstBookGrade[k]]) firstBookGrade[k] = g;
}
['g3', 'g4', 'g5', 'g6'].forEach(function (g) {
  (pep[g] || []).forEach(function (pair) { mark(pair[0], g); });
});
['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].forEach(function (g) {
  (wys[g] || []).forEach(function (pair) { mark(pair[0], g); });
});

s.test('英语通用词不得越级（教材更晚才教的词，不应出现在低年级通用词表）', function () {
  const bad = [];
  ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'].forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      if (it.book || it.type !== 'w1') return;                 // 只看通用英语单词
      const first = firstBookGrade[String(it.a || '').toLowerCase()];
      if (first && idx[first] > idx[g]) bad.push(g + ':' + it.a + '（教材 ' + first + '）');
    });
  });
  s.assert.deepEqual(bad, [], '通用词越级：' + bad.slice(0, 12).join(', '));
});

s.test('教材版本覆盖符合教材实际：PEP 只在小学 3~6 年级，外研版只在小学 1~6 年级', function () {
  G.forEach(function (g) {
    const items = dict.loadBuiltin(g);
    const pepN = items.filter(function (it) { return it.book === 'pep'; }).length;
    const wysN = items.filter(function (it) { return it.book === 'wys'; }).length;
    if (idx[g] <= idx.g2) {
      s.assert.equal(pepN, 0, g + ' 不应该有人教版词条（PEP 是三年级起点）');
    } else if (idx[g] <= idx.g6) {
      s.assert.true(pepN >= 20, g + ' 人教版词条仅 ' + pepN + ' 条');
      s.assert.true(wysN >= 20, g + ' 外研版词条仅 ' + wysN + ' 条');
    } else {
      s.assert.equal(pepN + wysN, 0, g + ' 属于中学/大学，不应有小学教材标签');
    }
  });
});

s.test('教材词条只能出现在对应年级（不能把三年级词表写进四年级）', function () {
  const bad = [];
  ['g3', 'g4', 'g5', 'g6'].forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      if (it.book !== 'pep' && it.book !== 'wys') return;
      const word = String(it.a || '').toLowerCase();
      const owner = firstBookGrade[word];
      // owner 比当前年级更晚 → 这个词本不属于该年级的教材
      if (owner && idx[owner] > idx[g]) bad.push(g + ':' + it.book + ':' + word + '（教材 ' + owner + '）');
    });
  });
  s.assert.deepEqual(bad, [], '教材词条放错年级：' + bad.slice(0, 12).join(', '));
});

s.test('音标：单音节词不标重音（教材写法）', function () {
  // 多音节词的重音位置由下面的「归一幂等」兜住：凡是还能被 normalizeStress
  // 改动的，就说明它还停留在词典写法（blˈuː / ɪmpˈɔːtənt），不是教材写法。
  const bad = [];
  G.forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      const ipa = String(it.ipa || '');
      if (!ipa) return;
      if (countNuclei(ipa.replace(/[ˈˌ]/g, '')) <= 1 && ipa.indexOf('ˈ') >= 0) {
        bad.push(g + ':' + it.a + '=' + ipa);
      }
    });
  });
  s.assert.deepEqual(bad, [], '单音节词不该标重音：' + bad.slice(0, 12).join(', '));
});

s.test('音标归一幂等（重建词库不会再把重音改回去）', function () {
  const changed = [];
  G.forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      if (!it.ipa) return;
      const again = normalizeStress(normalizeSymbols(it.ipa));
      if (again !== it.ipa) changed.push(g + ':' + it.a + ' ' + it.ipa + '→' + again);
    });
  });
  s.assert.deepEqual(changed, [], '归一不幂等：' + changed.slice(0, 8).join(', '));
});

s.test('音标符号只用教材出现的写法（不留 ɹ / ɫ / ɐ / ɝ 这类词典写法）', function () {
  const bad = [];
  G.forEach(function (g) {
    dict.loadBuiltin(g).forEach(function (it) {
      const ipa = String(it.ipa || '');
      if (/[ɹɫɐɝ]/.test(ipa)) bad.push(g + ':' + it.a + '=' + ipa);
    });
  });
  s.assert.deepEqual(bad, [], '残留词典写法：' + bad.slice(0, 10).join(', '));
});

s.test('每个年级仍够出题（删越级词后不能被删秃）', function () {
  G.forEach(function (g) {
    const n = dict.loadBuiltin(g).length;
    s.assert.true(n >= (g === 'kg' || g === 'college' ? 100 : 130), g + ' 仅剩 ' + n + ' 条');
  });
});

s.done();
