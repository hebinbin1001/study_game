/**
 * sensitive.test.js —— utils/sensitive.js 敏感词过滤单测
 *
 * 覆盖：命中返回 true、正常文本返回 false、findSensitive 返回具体词、非字符串输入安全。
 *
 * 运行：node tests/unit/sensitive.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/sensitive.js');

const sv = require('../../miniprogram/utils/sensitive');

s.test('containsSensitive：常见敏感词命中返回 true', () => {
  const hits = ['反动', '台独', '法轮', '色情', '淫秽', '裸聊', '暴力', '杀人',
    '炸弹', '傻逼', '毒品', '冰毒', '赌博', '诈骗', '黑客', '刷单'];
  for (const w of hits) {
    s.assert.true(sv.containsSensitive('这是一段包含' + w + '的文字'), '应命中敏感词：' + w);
  }
});

s.test('containsSensitive：英文大小写不敏感命中', () => {
  s.assert.true(sv.containsSensitive('I watch AV videos'));   // 命中 ' av '（词库含前后空格形式）
  s.assert.true(sv.containsSensitive('她是 AV 女优'));          // 命中 'av女优'/'AV '
  s.assert.true(sv.containsSensitive('av女优内容'));             // 小写命中 'av女优'
});

s.test('containsSensitive：正常文本返回 false', () => {
  s.assert.false(sv.containsSensitive('今天天气很好，我们一起学习吧'));
  s.assert.false(sv.containsSensitive('apple banana orange'));
  s.assert.false(sv.containsSensitive('Hello World'));
});

s.test('containsSensitive：非字符串/空输入安全返回 false', () => {
  s.assert.false(sv.containsSensitive(''));
  s.assert.false(sv.containsSensitive(null));
  s.assert.false(sv.containsSensitive(undefined));
  s.assert.false(sv.containsSensitive(12345));
  s.assert.false(sv.containsSensitive(['反动']));
});

s.test('findSensitive：返回命中的首个敏感词', () => {
  s.assert.equal(sv.findSensitive('含有色情的内容'), '色情');
  s.assert.equal(sv.findSensitive('正常内容'), null);
});

s.test('SENSITIVE_WORDS：导出词库非空且不含空字符串', () => {
  s.assert.ok(Array.isArray(sv.SENSITIVE_WORDS));
  s.assert.ok(sv.SENSITIVE_WORDS.length >= 50);
  for (const w of sv.SENSITIVE_WORDS) {
    s.assert.notEqual(w.trim(), '');
  }
});

s.done();