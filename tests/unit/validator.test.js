/**
 * validator.test.js —— utils/validator.js 词库校验器单测
 *
 * 覆盖 validateLine 的 7 项校验：
 *   1 类型码 ∈8 种  2 字段数 ≥3  3 w2/c2 星位自洽（q/a 等长 + 非星位同位一致 + ≥1 星）
 *   4 答案∈题目(w1 无* 时)  5 干扰项不含答案  6 敏感词  7 重复检测
 * 以及 validateAll 批量校验、错误全量汇聚、通过词条结构。
 *
 * 运行：node tests/unit/validator.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('utils/validator.js');

const v = require('../../tools/dict/validator');
const constants = require('../../miniprogram/utils/constants');

s.test('TYPE_CODES 共 8 种', () => {
  s.assert.equal(constants.TYPE_CODES.length, 8);
});

// ---------- 校验 1：类型码 ----------
s.test('校验1：合法类型码通过', () => {
  for (const code of constants.TYPE_CODES) {
    const r = v.validateLine([code, '题目', '答案', '释义'], 1, {});
    // 只要不含“类型码不认识”错误即可（其他错误不影响类型码判定）
    s.assert.equal(v.checkTypeCode([code, 'q', 'a', 'h']), null);
  }
});

s.test('校验1：非法类型码报错', () => {
  const r = v.validateLine(['xx', 'cat', 'a', '猫'], 3, {});
  s.assert.equal(r.item, null);
  s.assert.equal(r.errors.length >= 1, true);
  s.assert.ok(r.errors.some((e) => e.line === 3 && String(e.reason).indexOf('类型码「xx」不认识') !== -1));
});

// ---------- 校验 2：字段数 ----------
s.test('校验2：字段数 4（type|q|a|hint）通过', () => {
  s.assert.equal(v.checkFieldCount(['w1', 'cat', 'a', '猫']), null);
});

s.test('校验2：字段数 5（含 d）通过', () => {
  s.assert.equal(v.checkFieldCount(['w1', 'cat', 'a', '猫', 'e,o']), null);
});

s.test('校验2：字段数 3 报缺提示/释义', () => {
  const r = v.validateLine(['w1', 'cat', 'a'], 1, {});
  s.assert.equal(r.item, null);
  s.assert.ok(r.errors.some((e) => e.reason.indexOf('字段不足') !== -1));
});

s.test('校验2：字段数 2 报字段不足错误（不产生 item）', () => {
  const r = v.validateLine(['w1', 'cat'], 1, {});
  s.assert.equal(r.item, null);
  s.assert.equal(r.errors.length, 1); // 仅字段数不足一条错误，随后提前返回
  s.assert.ok(r.errors.some((e) => e.reason.indexOf('字段不足') !== -1));
});

// ---------- 校验 2.5：题目/答案不得为空白串（修复"空 q/a 可入库"） ----------
s.test('校验2.5：正常词条（含首尾空格字段）仍通过，不被误拒', () => {
  // parser 会 trim 每段；此处模拟直接调用，空格内容 trim 后非空应放行
  const r = v.validateLine(['w1', ' apple ', 'a', '苹果', 'e,o'], 1, {});
  s.assert.equal(r.errors.length, 0);
  s.assert.ok(r.item !== null);
});

s.test('校验2.5：空题目被拒，报「题目为空」', () => {
  const r = v.validateLine(['w1', '', 'a', '猫'], 2, {});
  s.assert.equal(r.item, null);
  s.assert.ok(r.errors.some((e) => e.reason === '题目为空'));
});

s.test('校验2.5：空答案被拒，报「答案为空」', () => {
  const r = v.validateLine(['w1', 'cat', '', '猫'], 3, {});
  s.assert.equal(r.item, null);
  s.assert.ok(r.errors.some((e) => e.reason === '答案为空'));
});

s.test('校验2.5：题目仅空格被拒', () => {
  const r = v.validateLine(['w1', '   ', 'a', '猫'], 4, {});
  s.assert.equal(r.item, null);
  s.assert.ok(r.errors.some((e) => e.reason === '题目为空'));
});

s.test('校验2.5：答案仅空格被拒', () => {
  const r = v.validateLine(['w1', 'cat', '   ', '猫'], 5, {});
  s.assert.equal(r.item, null);
  s.assert.ok(r.errors.some((e) => e.reason === '答案为空'));
});

s.test('校验2.5：题目与答案同时为空全量报两条错误', () => {
  const r = v.validateLine(['w1', '', '', 'hint'], 6, {});
  s.assert.equal(r.item, null);
  s.assert.equal(r.errors.length, 2);
  s.assert.ok(r.errors.some((e) => e.reason === '题目为空'));
  s.assert.ok(r.errors.some((e) => e.reason === '答案为空'));
});

s.test('校验2.5：单项函数 checkNotEmpty 导出且行为正确', () => {
  s.assert.deepEqual(v.checkNotEmpty(['w1', 'cat', 'a', 'hint']), []);
  s.assert.deepEqual(v.checkNotEmpty(['w1', '', 'a', 'hint']), ['题目为空']);
  s.assert.deepEqual(v.checkNotEmpty(['w1', 'cat', ' ', 'hint']), ['答案为空']);
  s.assert.deepEqual(v.checkNotEmpty(['w1', '  ', '  ', 'hint']), ['题目为空', '答案为空']);
});

s.test('校验2.5：空题目不污染 seenSet（不登记空白键）', () => {
  const seen = {};
  v.validateLine(['w1', '', 'a', '猫'], 7, seen);
  s.assert.equal(Object.prototype.hasOwnProperty.call(seen, ''), false);
});

// ---------- 校验 3：w2/c2 星位自洽 ----------
// 产品统一语义：q 为带 * 模板，q.length===a.length，非 '*' 位与 a 同位一致，
// 至少含 1 个 '*'；a 是完整答案词。
s.test('校验3：w2/c2 星位自洽（q/a 等长、非星位一致、含星）时通过', () => {
  // w2：单词挖 2 格（q='d*ffic*lt'，a 完整词 difficult）
  s.assert.equal(v.checkBlankCount(['w2', 'd*ffic*lt', 'difficult', '困难的']), null);
  // c2：两字词挖 1 格（q='天*'，a 完整词 天空）
  s.assert.equal(v.checkBlankCount(['c2', '天*', '天空', '天上的空间']), null);
  // c2：四字成语挖 2 格（q='水*渠*'，a 完整词 水到渠成）
  s.assert.equal(v.checkBlankCount(['c2', '水*渠*', '水到渠成', '条件成熟事情自然成功']), null);
});

s.test('校验3：w2/c2 星位不自洽时报错', () => {
  // 长度不等（模板长 9 vs 答案长 7）：'be*u*i*ul' 应为完整词 beautiful（9）才自洽
  const e1 = v.checkBlankCount(['w2', 'be*u*i*ul', 'improve', '改进']);
  s.assert.notEqual(e1, null);
  s.assert.contains(e1, '长度不一致');
  // 同位不一致（第 1 位题面 天 ≠ 答案 目）
  const e2 = v.checkBlankCount(['c2', '天*', '目地', '释义']);
  s.assert.notEqual(e2, null);
  s.assert.contains(e2, '不一致');
  // 无挖空标记（w2/c2 至少 1 个 *）
  const e3 = v.checkBlankCount(['c2', '天空', '天空', '释义']);
  s.assert.notEqual(e3, null);
  s.assert.contains(e3, '*');
  // validateLine 整链路同样报错（不产出词条）
  const r = v.validateLine(['c2', 'a*b*g*u*s', 'ambiguous', '释义'], 2, {});
  s.assert.equal(r.item, null);
  s.assert.ok(r.errors.some((x) => x.reason.indexOf('不一致') !== -1));
});

s.test('校验3：非 w2/c2 类型不检查星位', () => {
  // w1/c1 即使 q 显式标 * 或 q/a 不等长，也不走本项校验
  s.assert.equal(v.checkBlankCount(['w1', 'd*g', 'dog', '狗']), null);
  s.assert.equal(v.checkBlankCount(['c1', '守*待兔', '株', '比喻']), null);
});

// ---------- 校验 4：答案 ∈ 题目（仅 w1 且无 *） ----------
s.test('校验4：w1 无* 且答案字符都在题目中则通过', () => {
  s.assert.equal(v.checkAnswerInQuestion(['w1', 'cat', 'a', '猫']), null);
  s.assert.equal(v.checkAnswerInQuestion(['w1', 'cat', 'cat', '猫']), null);
});

s.test('校验4：w1 无* 答案不在题目时报错', () => {
  const e = v.checkAnswerInQuestion(['w1', 'cat', 'x', '猫']);
  s.assert.contains(e, '不在题目中');
});

s.test('校验4：w1 显式标 * 或非 w1 跳过检查', () => {
  s.assert.equal(v.checkAnswerInQuestion(['w1', 'd*g', 'o', '狗']), null);
  s.assert.equal(v.checkAnswerInQuestion(['c2', '天*', '天空', '释义']), null);
});

// ---------- 校验 5：干扰项不含答案 ----------
s.test('校验5：干扰项含答案报错', () => {
  const r = v.validateLine(['c1', '守*待兔', '株', '比喻', '珠,株,林'], 1, {});
  s.assert.ok(r.errors.some((x) => x.reason.indexOf('干扰项重复正确答案') !== -1));
});

s.test('校验5：干扰项不含答案通过', () => {
  s.assert.equal(v.checkDistractorNotAnswer(['c1', '守*待兔', '株', '比喻'], ['珠', '柱', '林']), null);
  s.assert.equal(v.checkDistractorNotAnswer(['c1', '守*待兔', '株', '比喻'], []), null);
  s.assert.equal(v.checkDistractorNotAnswer(['c1', '守*待兔', '株', '比喻'], undefined), null);
});

// ---------- 校验 6：敏感词 ----------
s.test('校验6：题目/答案/提示/干扰含敏感词报错', () => {
  const e = v.checkSensitive(['w1', 'cat', 'a', '色情网站'], []);
  s.assert.contains(e, '敏感');
  const r = v.validateLine(['w1', 'cat', 'a', '宣传邪教'], 4, {});
  s.assert.ok(r.errors.some((x) => x.reason.indexOf('包含敏感内容') !== -1));
});

s.test('校验6：正常内容通过', () => {
  s.assert.equal(v.checkSensitive(['w1', 'apple', 'a', '苹果'], ['e', 'o', 'i']), null);
});

// ---------- 校验 7：重复题目 ----------
s.test('校验7：重复题目检测记录行号并报错', () => {
  const seen = {};
  const r1 = v.validateLine(['w1', 'cat', 'a', '猫'], 1, seen);
  s.assert.equal(r1.item !== null, true);
  s.assert.equal(seen.cat, 1);
  const r2 = v.validateLine(['w1', 'cat', 'a', '猫'], 8, seen);
  s.assert.ok(r2.errors.some((x) => x.reason.indexOf('与第 1 行题目重复') !== -1));
});

s.test('校验7：seenSet 隔离时相同题目不视为重复', () => {
  const seenA = {}, seenB = {};
  v.validateLine(['w1', 'dog', 'd', '狗'], 2, seenA);
  const r = v.validateLine(['w1', 'dog', 'd', '狗'], 9, seenB);
  s.assert.equal(r.item !== null, true);
});

// ---------- 错误全量汇聚 & 成功产出 ----------
s.test('validateLine 错误全量汇聚（多错误同行保留）', () => {
  // 类型码合法(w1)以让后续校验执行：答案 x 不在题目、干扰 x=答案、hint 含敏感词
  const r = v.validateLine(['w1', 'cat', 'x', '色情', 'x'], 6, {});
  s.assert.equal(r.item, null);
  const reasons = r.errors.map((e) => e.reason).join('|');
  s.assert.contains(reasons, '答案「x」不在题目中');   // 校验4（w1 无星）
  s.assert.contains(reasons, '干扰项重复正确答案');      // 校验5（x 与答案 x 相同）
  s.assert.contains(reasons, '包含敏感内容');           // 校验6
});

s.test('validateLine 全部通过产出 WordItem（含可选 d）', () => {
  const r = v.validateLine(['c1', '守*待兔', '株', '比喻', '珠,柱,林'], 3, {});
  s.assert.equal(r.errors.length, 0);
  s.assert.deepEqual(r.item, {
    type: 'c1', q: '守*待兔', a: '株', hint: '比喻', d: ['珠', '柱', '林']
  });
});

s.test('validateLine 通过且无干扰项时不带 d 字段', () => {
  const r = v.validateLine(['w1', 'cat', 'a', '猫'], 1, {});
  s.assert.equal(r.errors.length, 0);
  s.assert.equal(r.item.d, undefined);
  s.assert.deepEqual(r.item, { type: 'w1', q: 'cat', a: 'a', hint: '猫' });
});

s.test('validateLine 字段数不足(1字段)时只做基础校验并提前返回', () => {
  const r = v.validateLine(['w1'], 5, {});
  s.assert.equal(r.item, null);
  s.assert.ok(r.errors.length >= 1);
});

// ---------- validateAll ----------
s.test('validateAll：批量通过/失败聚合且保留解析期错误', () => {
  const parsed = [
    { lineNo: 1, fields: ['w1', 'cat', 'a', '猫'], distractors: [] },
    { lineNo: 2, fields: ['bad', 'dog', 'd', '狗'], distractors: [] },
    { lineNo: 3, fields: ['w1', 'cat', 'a', '猫'], distractors: [] }
  ];
  const parseErrors = [{ line: 0, reason: '解析期错误样例' }];
  const res = v.validateAll(parsed, parseErrors);
  s.assert.equal(res.items.length, 1); // 仅第 1 行通过（第 3 行与第 1 行题目重复）
  s.assert.ok(res.errors.some((e) => e.reason === '解析期错误样例'));
  s.assert.ok(res.errors.some((e) => e.reason.indexOf('类型码「bad」不认识') !== -1));
  s.assert.ok(res.errors.some((e) => e.reason.indexOf('题目重复') !== -1));
});

// ---------- parser + validator 端到端 ----------
s.test('端到端：parseText + validateAll 串联校验导入文本', () => {
  const parser = require('../../tools/dict/parser');
  const text = [
    'w1|cat|a|猫|e,o,i',   // 合法
    'c2|天*|天空云|释义',     // q/a 长度不等 → 报长度不一致
    'w1|cat|a|猫',          // 与第1行题目重复
    '# 注释',
    'bad|dog|d|狗'          // 类型码非法
  ].join('\n');
  const parsed = parser.parseText(text);
  const res = v.validateAll(parsed.items, parsed.errors);
  s.assert.equal(res.items.length, 1);
  s.assert.equal(parsed.items.length, 4);
  const reasons = res.errors.map((e) => e.reason).join('|');
  s.assert.contains(reasons, '长度不一致');
  s.assert.contains(reasons, '与第 1 行题目重复');
  s.assert.contains(reasons, '类型码「bad」不认识');
});

s.done();
