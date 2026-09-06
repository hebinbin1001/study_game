/**
 * parser.test.js —— utils/parser.js 纯文本词库解析器单测
 *
 * 覆盖：全角｜转半角、\r\n 兼容、空行/# 注释跳过、字段切分、d 干扰项逗号分隔、行号保留。
 *
 * 运行：node miniprogram/utils/__tests__/parser.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/parser.js');

const p = require('../parser');

s.test('splitLines：全角｜ 转半角 |，统一 \\r\\n / \\r / \\n', () => {
  const lines = p.splitLines('w1|cat|a|猫\r\nc1｜大｜大｜大\r\nw1|dog|d|狗');
  s.assert.equal(lines.length, 3);
  s.assert.equal(lines[1], 'c1|大|大|大');
  const lines2 = p.splitLines('a\rb\nc');
  s.assert.equal(lines2.length, 3);
});

s.test('splitLines：空/非字符串输入返回空数组', () => {
  s.assert.equal(p.splitLines(null).length, 0);
  s.assert.equal(p.splitLines('').length, 0);
  s.assert.equal(p.splitLines(undefined).length, 0);
  s.assert.equal(p.splitLines(123).length, 0);
});

s.test('shouldSkip：空行与 # 注释行判定', () => {
  s.assert.true(p.shouldSkip(''));
  s.assert.true(p.shouldSkip('   '));
  s.assert.true(p.shouldSkip('# 注释'));
  s.assert.true(p.shouldSkip('  # 带缩进注释'));
  s.assert.false(p.shouldSkip('w1|cat|a|猫'));
  s.assert.false(p.shouldSkip('a#b|c'));
});

s.test('splitFields：按 | 切分并 trim 每段', () => {
  s.assert.deepEqual(p.splitFields(' w1 | cat | a | 猫 '), ['w1', 'cat', 'a', '猫']);
});

s.test('splitDistractors：按逗号切分、trim、去空白项', () => {
  s.assert.deepEqual(p.splitDistractors(' 珠 , 柱 , 林 '), ['珠', '柱', '林']);
  s.assert.deepEqual(p.splitDistractors(''), []);
  s.assert.deepEqual(p.splitDistractors(null), []);
  s.assert.deepEqual(p.splitDistractors('a,,b'), ['a', 'b']);
});

s.test('parseText：标准行解析出 fields/distractors 与行号', () => {
  const res = p.parseText('w1|cat|a|猫|e,o,i\nc2|天*|天空|释义|');
  s.assert.equal(res.items.length, 2);
  s.assert.deepEqual(res.items[0].fields, ['w1', 'cat', 'a', '猫', 'e,o,i']);
  s.assert.deepEqual(res.items[0].distractors, ['e', 'o', 'i']);
  s.assert.equal(res.items[0].lineNo, 1);
  s.assert.equal(res.items[1].lineNo, 2);
  s.assert.equal(res.items[1].distractors.length, 0);
});

s.test('parseText：跳过空行与 # 注释，但保留原始行号', () => {
  const text = 'w1|cat|a|猫\n\n# 这是注释\n   \nc1|守*待兔|株|比喻';
  const res = p.parseText(text);
  s.assert.equal(res.items.length, 2);
  s.assert.equal(res.items[0].lineNo, 1);
  s.assert.equal(res.items[1].lineNo, 5);
  s.assert.equal(res.errors.length, 0);
});

s.test('parseText：\r\n 与全角｜混合文本', () => {
  const text = 'w1｜apple｜a｜苹果\r\n\r\n# c\r\nw1｜dog｜d｜狗\r\n';
  const res = p.parseText(text);
  s.assert.equal(res.items.length, 2);
  s.assert.deepEqual(res.items[0].fields, ['w1', 'apple', 'a', '苹果']);
  s.assert.equal(res.items[0].lineNo, 1);
  // 第 2 行为空行、第 3 行为 # 注释，故第 4 行 dog 的 lineNo 为 4
  s.assert.equal(res.items[1].lineNo, 4);
});

s.test('parseText：空文本/纯注释文本无产物', () => {
  s.assert.equal(p.parseText('').items.length, 0);
  s.assert.equal(p.parseText('# only comment\n\n').items.length, 0);
  s.assert.equal(p.parseText(null).items.length, 0);
});

s.test('parseText：4 字段行（无干扰项）fields 为 4 段', () => {
  const res = p.parseText('xhy|芝麻开花|节节高|比喻');
  s.assert.equal(res.items.length, 1);
  s.assert.deepEqual(res.items[0].fields, ['xhy', '芝麻开花', '节节高', '比喻']);
  s.assert.deepEqual(res.items[0].distractors, []);
});

s.test('parseText：导出内部函数', () => {
  for (const k of ['splitLines', 'shouldSkip', 'splitFields', 'splitDistractors']) {
    s.assert.equal(typeof p[k], 'function');
  }
});

s.done();