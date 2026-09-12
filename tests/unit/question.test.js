/**
 * question.test.js —— game/question.js 出题与干扰项逻辑单测
 *
 * 覆盖：
 *  - typeKind 题型归类（原型三分类 + 8 类型码）
 *  - genQuestion 挖空规则（英文优先挖元音 / 成语挖中间避开首字 / 单字词语随机挖）
 *  - genDistractors 选项生成（1 正确 + 3 干扰、两两不同、形近映射、conf、bank、兜底）
 *  - ensureDistractors 缺省补齐
 *
 * 运行：node tests/unit/question.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/question.js');

const q = require('../../miniprogram/game/question');

// ---------- 一、typeKind ----------
s.test('typeKind：原型三分类 en/idiom/cn 原样返回', () => {
  s.assert.equal(q.typeKind({ type: 'en' }), 'en');
  s.assert.equal(q.typeKind({ type: 'idiom' }), 'idiom');
  s.assert.equal(q.typeKind({ type: 'cn' }), 'cn');
});

s.test('typeKind：w1/w2/fill/trans 归为 en', () => {
  s.assert.equal(q.typeKind({ type: 'w1' }), 'en');
  s.assert.equal(q.typeKind({ type: 'w2' }), 'en');
  s.assert.equal(q.typeKind({ type: 'fill' }), 'en');
  s.assert.equal(q.typeKind({ type: 'trans' }), 'en');
});

s.test('typeKind：c1/c2 按长度分成语(>=4)/汉字', () => {
  s.assert.equal(q.typeKind({ type: 'c1', q: '守株待兔' }), 'idiom');
  s.assert.equal(q.typeKind({ type: 'c1', q: '大' }), 'cn');
  s.assert.equal(q.typeKind({ type: 'c2', q: '一心一意' }), 'idiom');
  s.assert.equal(q.typeKind({ type: 'c2', q: '天空' }), 'cn');
  // 兼容 w 字段命名
  s.assert.equal(q.typeKind({ type: 'c2', w: '守株待兔' }), 'idiom');
});

s.test('typeKind：xhy/zc 归为 cn，未知类型兜底 cn', () => {
  s.assert.equal(q.typeKind({ type: 'xhy' }), 'cn');
  s.assert.equal(q.typeKind({ type: 'zc' }), 'cn');
  s.assert.equal(q.typeKind({ type: 'unknown' }), 'cn');
});

// ---------- 二、genQuestion 挖空规则 ----------
s.test('genQuestion 英文单词优先挖元音', () => {
  const item = { type: 'w1', q: 'apple', a: 'apple', hint: '苹果' };
  for (let i = 0; i < 100; i++) {
    const res = q.genQuestion(item);
    s.assert.ok(['a', 'e', 'i', 'o', 'u'].indexOf(item.q[res.blankIdx]) !== -1,
      'blankIdx=' + res.blankIdx + ' 应落在元音位，实际字=' + item.q[res.blankIdx]);
    s.assert.equal(res.correct, item.q[res.blankIdx]);
  }
});

s.test('genQuestion 无元音英文单词随机挖', () => {
  const item = { type: 'w1', q: 'sky', a: 'sky', hint: '天空' };
  for (let i = 0; i < 50; i++) {
    const res = q.genQuestion(item);
    s.assert.ok(res.blankIdx >= 0 && res.blankIdx <= 2);
    s.assert.equal(res.correct, item.q[res.blankIdx]);
  }
});

s.test('genQuestion 成语（>=4字）挖中间位、避开首字', () => {
  const word = '守株待兔';
  const item = { type: 'c1', q: word, a: '株', hint: '比喻不主动努力' };
  for (let i = 0; i < 100; i++) {
    const res = q.genQuestion(item);
    s.assert.ok(res.blankIdx >= 1 && res.blankIdx <= word.length - 1,
      'blankIdx=' + res.blankIdx + ' 应避开首字');
    s.assert.equal(res.correct, word[res.blankIdx]);
  }
});

s.test('genQuestion 单字随机挖（仅 index 0）', () => {
  const res = q.genQuestion({ type: 'c1', q: '大', a: '大', hint: '大小的大' });
  s.assert.equal(res.blankIdx, 0);
  s.assert.equal(res.correct, '大');
});

s.test('genQuestion 二字词语随机挖一格', () => {
  const word = '明天';
  for (let i = 0; i < 50; i++) {
    const res = q.genQuestion({ type: 'zc', q: word, a: '天', hint: '明天' });
    s.assert.ok(res.blankIdx === 0 || res.blankIdx === 1);
    s.assert.equal(res.correct, word[res.blankIdx]);
  }
});

s.test('genQuestion 返回结构 {blankIdx, correct, options} 且 4 选项包含正确答案且不重复', () => {
  const item = { type: 'c1', q: '守株待兔', a: '株', hint: '比喻不主动努力' };
  for (let i = 0; i < 50; i++) {
    const res = q.genQuestion(item);
    s.assert.ok(Object.prototype.hasOwnProperty.call(res, 'blankIdx'));
    s.assert.ok(Object.prototype.hasOwnProperty.call(res, 'correct'));
    s.assert.ok(Array.isArray(res.options));
    s.assert.equal(res.options.length, 4);
    s.assert.ok(res.options.indexOf(res.correct) !== -1);
    s.assert.allDistinct(res.options);
  }
});

// ---------- 三、genDistractors ----------
s.test('genDistractors 英文元音题：干扰全部来自其余元音', () => {
  const item = { type: 'w1', q: 'apple', a: 'apple', hint: '苹果' };
  for (let i = 0; i < 50; i++) {
    const opts = q.genDistractors(item, 0, 'a');
    s.assert.equal(opts.length, 4);
    s.assert.allDistinct(opts);
    for (const o of opts) {
      s.assert.ok('aeiou'.indexOf(o) !== -1, '元音题选项 ' + o + ' 应为元音');
    }
    s.assert.ok(opts.indexOf('a') !== -1);
  }
});

s.test('genDistractors 英文辅音题：含形近字母且全部为英文字母', () => {
  const item = { type: 'w1', q: 'big', a: 'big', hint: '大' };
  const opts = q.genDistractors(item, 0, 'b');
  s.assert.equal(opts.length, 4);
  s.assert.allDistinct(opts);
  s.assert.ok(opts.indexOf('b') !== -1);
  s.assert.ok(opts.indexOf('d') !== -1, 'b 的形近字母 d 应作为干扰之一');
  for (const o of opts) {
    s.assert.ok(/^[a-z]$/.test(o), '选项应是小写英文字母，实际=' + o);
  }
});

s.test('genDistractors 英文 conf 易混词配对进入干扰', () => {
  const item = { type: 'w1', q: 'big', a: 'big', hint: '大', conf: 'dig' };
  const opts = q.genDistractors(item, 0, 'b');
  s.assert.equal(opts.length, 4);
  s.assert.ok(opts.indexOf('b') !== -1);
  s.assert.ok(opts.indexOf('d') !== -1, 'conf 配对字母 d 应作为干扰');
});

s.test('genDistractors 汉字：形近字映射优先，4 个不同选项', () => {
  const item = { type: 'c1', q: '守株待兔', a: '株', hint: '比喻不主动努力' };
  const opts = q.genDistractors(item, 1, '株');
  s.assert.equal(opts.length, 4);
  s.assert.allDistinct(opts);
  s.assert.ok(opts.indexOf('株') !== -1);
});

s.test('genDistractors 汉字 bank 补齐：无映射字时从同年级词库取字', () => {
  const bank = [
    { type: 'c1', q: '天地人', a: '天', hint: '天地人' },
    { type: 'c1', q: '日月星', a: '日', hint: '日月星' },
    { type: 'w1', q: 'cat', a: 'cat', hint: '猫' } // 英语词应被跳过
  ];
  const opts = q.genDistractors({ type: 'c1', q: '咦', a: '咦', hint: 'x' }, 0, '七', bank);
  s.assert.equal(opts.length, 4);
  s.assert.allDistinct(opts);
  s.assert.ok(opts.indexOf('七') !== -1);
  // 不能取到英语词 'cat' 中的字符到选项中（bank 只收集汉字条目）
  for (const o of opts) {
    s.assert.notEqual(o, 'c');
    s.assert.notEqual(o, 'a');
    s.assert.notEqual(o, 't');
  }
});

s.test('genDistractors 兜底补齐：无映射且无 bank 时也能凑足 4 项', () => {
  const opts = q.genDistractors({ type: 'c1', q: '咦咦咦', a: '咦', hint: 'x' }, 0, '咦');
  s.assert.equal(opts.length, 4);
  s.assert.allDistinct(opts);
  s.assert.ok(opts.indexOf('咦') !== -1);
});

// ---------- 四、ensureDistractors ----------
s.test('ensureDistractors 返回 4 个不重复选项且含正确答案', () => {
  const item = { type: 'c1', q: '守株待兔', a: '株', hint: '比喻不主动努力' };
  const opts = q.ensureDistractors(item);
  s.assert.equal(opts.length, 4);
  s.assert.allDistinct(opts);
});

// ---------- 五、内置词库联动（探测 genQuestion 遇 q 含 * 的行为） ----------
s.test('genQuestion 处理 q 含 * 的 c2 词条不应把 * 当正确字挖出', () => {
  // 内置词库 c2 形如 { q: '高*远*', a: '高瞻远瞩' }。
  // 出题时 q 已用 * 标注空位，genQuestion 若把 * 所在下标当作挖空位，
  // 会把 correct 算成 '*'（怪物题面/判定失真）。此测试固定随机值触发该路径。
  const origRandom = Math.random;
  let calls = 0;
  const seq = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.01, 0.11, 0.21, 0.31, 0.41, 0.51];
  Math.random = () => seq[calls++ % seq.length];
  try {
    const res = q.genQuestion({ type: 'c2', q: '高*远*', a: '高瞻远瞩', hint: '眼光远大' });
    // 期望：选中的应是可作答的真实汉字，而不是 '*' 占位符
    s.assert.notEqual(res.correct, '*', 'blankIdx=' + res.blankIdx + ' 命中了已挖空的 * 位');
    for (const o of res.options) {
      s.assert.notEqual(o, '*');
    }
  } finally {
    Math.random = origRandom;
  }
});

// ---------- 六、导出完整性 ----------
s.test('question.js 导出表完整', () => {
  for (const k of ['genQuestion', 'genDistractors', 'ensureDistractors', 'typeKind', 'getWord', 'displayChar', 'displayWord', 'CN_CONFUSE_MAP', 'EN_CONFUSE_MAP']) {
    s.assert.ok(q[k] !== undefined, '缺少导出 ' + k);
  }
  s.assert.ok(Object.keys(q.CN_CONFUSE_MAP).length > 0);
  s.assert.equal(Object.keys(q.EN_CONFUSE_MAP).length, 10); // b↔d,p↔q,n↔m,f↔t,s↔z
});

// ============================================================
// 七、词级题型（H2-B：fill/trans/xhy/zc 整词出题 + 防剧透）
// ============================================================

// ---------- 7.1 isWordLevel 判定 ----------
s.test('isWordLevel：fill/trans/xhy 恒为词级；zc 仅单字引导形态', () => {
  s.assert.true(q.isWordLevel({ type: 'fill', q: 'I __ to school.', a: 'go' }));
  s.assert.true(q.isWordLevel({ type: 'trans', q: '苹果', a: 'apple' }));
  s.assert.true(q.isWordLevel({ type: 'xhy', q: '芝麻开花', a: '节节高' }));
  s.assert.true(q.isWordLevel({ type: 'zc', q: '明', a: '天' }));
  // zc 二字词语（旧测试/旧逻辑模拟随机挖格）不是词级
  s.assert.false(q.isWordLevel({ type: 'zc', q: '明天', a: '天' }));
  // 字符级题型都不是词级
  s.assert.false(q.isWordLevel({ type: 'w1', q: 'apple', a: 'apple' }));
  s.assert.false(q.isWordLevel({ type: 'c1', q: '大', a: '大' }));
  s.assert.false(q.isWordLevel(null));
});

// ---------- 7.2 fill：__ 双下划线解析 ----------
s.test('splitWordQuestion：fill 解析 __ 为 head/tail', () => {
  const r = q.splitWordQuestion({ type: 'fill', q: 'I __ to school every day.', a: 'go' });
  s.assert.equal(r.head, 'I ');
  s.assert.equal(r.tail, ' to school every day.');
  s.assert.true(r.hasSlot);
});

s.test('genQuestion(fill)：词级结构 wordLevel/head/tail/answer 且 4 选项互异含整词', () => {
  const item = { type: 'fill', q: 'She __ to school by bus.', a: 'goes', hint: '她坐公交去上学' };
  for (let i = 0; i < 50; i++) {
    const res = q.genQuestion(item);
    s.assert.true(res.wordLevel);
    s.assert.equal(res.correct, 'goes');
    s.assert.equal(res.answer, 'goes');
    s.assert.true(res.hasSlot);
    s.assert.equal(res.head, 'She ');
    s.assert.equal(res.tail, ' to school by bus.');
    s.assert.equal(res.options.length, 4);
    s.assert.allDistinct(res.options);
    s.assert.ok(res.options.indexOf('goes') !== -1, '正确整词应在选项中');
    for (const o of res.options) {
      s.assert.ok(o.indexOf('__') === -1, '选项不应含 __ 占位');
      s.assert.ok(o.length > 0);
    }
  }
});

s.test('genQuestion(fill)：同段 bank 提供同类型整词干扰候选', () => {
  const bank = [
    { type: 'fill', q: 'I __ to school.', a: 'go', hint: '去' },
    { type: 'fill', q: 'She __ apples.', a: 'likes', hint: '喜欢' },
    { type: 'fill', q: 'He __ a book.', a: 'reads', hint: '读' },
    { type: 'w1', q: 'cat', a: 'cat', hint: '猫' } // 非 fill 不应进入 fill 候选
  ];
  const item = { type: 'fill', q: 'They __ football.', a: 'play', hint: '踢' };
  const res = q.genQuestion(item, bank);
  s.assert.equal(res.options.length, 4);
  s.assert.allDistinct(res.options);
  s.assert.ok(res.options.indexOf('play') !== -1);
});

s.test('genQuestion(fill)：无 __ 异常数据防御性仍出整词题', () => {
  const res = q.genQuestion({ type: 'fill', q: 'I go to school', a: 'go', hint: '去' });
  s.assert.true(res.wordLevel);
  s.assert.false(res.hasSlot);
  s.assert.equal(res.correct, 'go');
  s.assert.equal(res.options.length, 4);
});

// ---------- 7.3 trans：中译英整词 ----------
s.test('genQuestion(trans)：4 选项含英文整词 correct 且不重复', () => {
  const item = { type: 'trans', q: '能力', a: 'ability', hint: '名词' };
  for (let i = 0; i < 50; i++) {
    const res = q.genQuestion(item);
    s.assert.true(res.wordLevel);
    s.assert.equal(res.correct, 'ability');
    s.assert.equal(res.head, '能力');
    s.assert.equal(res.options.length, 4);
    s.assert.allDistinct(res.options);
    s.assert.ok(res.options.indexOf('ability') !== -1);
  }
});

// ---------- 7.4 xhy：歇后语后半句整词 + 防剧透 ----------
s.test('safeHint：hint 与答案相同/含答案时返回 null（防剧透），否则原样', () => {
  // xhy 词库中大量 hint === a（如 肉包子打狗/有去无回）
  s.assert.equal(q.safeHint({ type: 'xhy', q: '肉包子打狗', a: '有去无回', hint: '有去无回' }), null);
  // hint 含答案也防剧透
  s.assert.equal(q.safeHint({ type: 'xhy', q: '竹篮打水', a: '一场空', hint: '比喻一场空欢喜' }), null);
  // 安全 hint 原样返回
  s.assert.equal(q.safeHint({ type: 'xhy', q: '竹篮打水', a: '一场空', hint: '比喻白费力气' }), '比喻白费力气');
  s.assert.equal(q.safeHint({ type: 'fill', q: 'I __ it.', a: 'did', hint: '我做了它' }), '我做了它');
});

s.test('genQuestion(xhy)：hint 剧透时 hintSafe=null 且 guide=引导语', () => {
  const item = { type: 'xhy', q: '肉包子打狗', a: '有去无回', hint: '有去无回' };
  const res = q.genQuestion(item);
  s.assert.true(res.wordLevel);
  s.assert.equal(res.correct, '有去无回');
  s.assert.equal(res.hintSafe, null);
  s.assert.equal(res.guide, '选出歇后语后半句');
  s.assert.equal(res.options.length, 4);
  s.assert.allDistinct(res.options);
  s.assert.ok(res.options.indexOf('有去无回') !== -1);
});

// ---------- 7.5 zc：单字引导「组词」词级形态 ----------
s.test('genQuestion(zc 单字)：整词为单字、干扰用词库 d、选项互异不含 q', () => {
  const item = { type: 'zc', q: '明', a: '天', hint: '明天', d: ['月', '日', '白'] };
  for (let i = 0; i < 50; i++) {
    const res = q.genQuestion(item);
    s.assert.true(res.wordLevel);
    s.assert.equal(res.correct, '天');
    s.assert.equal(res.head, '明');
    s.assert.equal(res.options.length, 4);
    s.assert.allDistinct(res.options);
    s.assert.ok(res.options.indexOf('天') !== -1);
    for (const o of res.options) {
      s.assert.notEqual(o, '明', '选项不能等于引导字 q（否则自指）');
    }
  }
});

s.test('genQuestion(zc 单字)：hint=q+a 剧透 → hintSafe=null、guide=选字组词', () => {
  const item = { type: 'zc', q: '明', a: '天', hint: '明天', d: ['月', '日', '白'] };
  const res = q.genQuestion(item);
  s.assert.equal(res.hintSafe, null);
  s.assert.equal(res.guide, '给「明」选字组词');
});

s.test('genQuestion(zc 二字词语兼容)：仍走旧随机挖一格（非词级）', () => {
  const word = '明天';
  const res = q.genQuestion({ type: 'zc', q: word, a: '天', hint: '明天' });
  s.assert.false(res.wordLevel, '二字词语 zc 应保持旧字符级语义');
  s.assert.ok(res.blankIdx === 0 || res.blankIdx === 1);
  s.assert.equal(res.correct, word[res.blankIdx]);
  s.assert.equal(res.options.length, 4);
});

// ---------- 7.6 displayAnswer / wordLevelFeedback / wordAnswer ----------
// 契约（M6-4）：英文整词首字母大写（Title Case），fill 保持原始大小写；zc 返回 q+a
s.test('displayAnswer：词级英文整词首字母大写、fill 原样、zc 返回 q+a', () => {
  s.assert.equal(q.displayAnswer({ type: 'trans', q: '苹果', a: 'apple' }), 'Apple');
  s.assert.equal(q.displayAnswer({ type: 'fill', q: 'I __ it.', a: 'did', hint: '做了' }), 'did');
  s.assert.equal(q.displayAnswer({ type: 'xhy', q: '芝麻开花', a: '节节高' }), '节节高');
  s.assert.equal(q.displayAnswer({ type: 'zc', q: '明', a: '天' }), '明天');
  s.assert.equal(q.displayAnswer(null), '');
});

s.test('wordAnswer：返回整词答案原文', () => {
  s.assert.equal(q.wordAnswer({ type: 'trans', a: 'apple' }), 'apple');
  s.assert.equal(q.wordAnswer(null), '');
});

s.test('wordLevelFeedback：词级完整回执文案（不剧透作答前，作答后揭示）', () => {
  s.assert.equal(q.wordLevelFeedback({ type: 'zc', q: '明', a: '天' }), '明+天=明天');
  s.assert.equal(q.wordLevelFeedback({ type: 'xhy', q: '芝麻开花', a: '节节高' }), '芝麻开花 → 节节高');
  s.assert.equal(q.wordLevelFeedback({ type: 'trans', q: '苹果', a: 'apple' }), '苹果 = Apple');
  s.assert.equal(q.wordLevelFeedback({ type: 'fill', q: 'I __ it.', a: 'go', hint: '我做了它' }), 'go（我做了它）');
});

// ---------- 7.7 词级保证：整词题永不挖出 __ 或 * 或空串 ----------
s.test('词级题正确项与所有选项均非空、不含挖空占位符 __/*', () => {
  const items = [
    { type: 'fill', q: 'The cat __ on the mat.', a: 'is', hint: '猫在垫子上' },
    { type: 'trans', q: '苹果', a: 'apple', hint: '水果' },
    { type: 'xhy', q: '芝麻开花', a: '节节高', hint: '节节高' },
    { type: 'zc', q: '明', a: '天', hint: '明天', d: ['月', '日', '白'] }
  ];
  for (const item of items) {
    for (let i = 0; i < 30; i++) {
      const res = q.genQuestion(item);
      s.assert.true(res.wordLevel);
      s.assert.ok(res.correct.length > 0, 'correct 非空');
      for (const o of res.options) {
        s.assert.ok(o.length > 0, '选项非空');
        s.assert.ok(o.indexOf('__') === -1 && o.indexOf('*') === -1, '选项不得含占位符');
      }
    }
  }
});

// ---------- 7.8 词级导出完整性 ----------
s.test('question.js 词级导出齐全', () => {
  for (const k of ['isWordLevel', 'splitWordQuestion', 'genWordLevelQuestion', 'safeHint', 'wordLevelGuide', 'wordAnswer', 'displayAnswer', 'wordLevelFeedback']) {
    s.assert.ok(q[k] !== undefined, '缺少词级导出 ' + k);
  }
});

// ============================================================
// 八、词级引导语防剧透固化（#22）
//   背景：wordLevelGuide 对 zc 返回「给「q」选字组词」，当真实词库
//   q=写/a=字（primary12/primary34 各 1 条）时，提示行会暴露答案字「字」。
//   修复：候选引导语池 + 含答案字符自动顺延/兜底剔除，保证 guide 不含 item.a。
// ============================================================

s.test('wordLevelGuide(zc q=写 a=字)：返回引导语不含答案字「字」且非空', () => {
  const g = q.wordLevelGuide({ type: 'zc', q: '写', a: '字', hint: '写字' });
  s.assert.ok(typeof g === 'string' && g.length > 0, '返回串应为非空字符串，实际=' + JSON.stringify(g));
  s.assert.ok(g.indexOf('字') === -1, '引导语不得暴露答案字「字」，实际=' + g);
  s.assert.ok(g.indexOf('__') === -1 && g.indexOf('*') === -1, '不得含挖空占位符');
});

s.test('wordLevelGuide(xhy)：模板含后半句答案子串时自动顺延为不含 a 的候选', () => {
  // 构造 a=后半句 命中第 0 条候选「选出歇后语后半句」的场景，验证顺延剔除
  const g = q.wordLevelGuide({ type: 'xhy', q: 'X', a: '后半句', hint: '后半句' });
  s.assert.ok(typeof g === 'string' && g.length > 0, '返回串应为非空字符串，实际=' + JSON.stringify(g));
  s.assert.ok(g.indexOf('后半句') === -1, '引导语不得含答案 a，实际=' + g);
  // 真实多字后半句不命中第 0 条候选 → 走第一候选保持既有文案
  s.assert.equal(q.wordLevelGuide({ type: 'xhy', q: '肉包子打狗', a: '有去无回', hint: '有去无回' }), '选出歇后语后半句');
});

s.test('wordLevelGuide：zc 无剧透走第一候选；fill/trans 英文 a 不命中中文模板', () => {
  s.assert.equal(q.wordLevelGuide({ type: 'zc', q: '明', a: '天', hint: '明天' }), '给「明」选字组词');
  s.assert.equal(q.wordLevelGuide({ type: 'fill', q: 'I __ to school.', a: 'goes', hint: '去' }), '选择句子空缺的单词');
  s.assert.equal(q.wordLevelGuide({ type: 'trans', q: '苹果', a: 'apple', hint: '名词' }), '选出对应单词');
});

s.test('genQuestion(zc q=写 a=字)：res.guide 不含 item.a 且 hintSafe=null', () => {
  const item = { type: 'zc', q: '写', a: '字', hint: '写字', d: ['人', '书', '诗'] };
  const res = q.genQuestion(item);
  s.assert.equal(res.hintSafe, null, 'hint=写字 含答案 → 应防剧透');
  s.assert.ok(typeof res.guide === 'string' && res.guide.length > 0, 'guide 应为非空字符串');
  s.assert.ok(res.guide.indexOf('字') === -1, 'guide 不得暴露答案字「字」，实际=' + res.guide);
  s.assert.ok(res.guide.indexOf('__') === -1 && res.guide.indexOf('*') === -1);
});

// ---------- 8.6 全量真实词库 guide 防剧透（词库扩充防护固化） ----------
s.test('全量真实词库：zc/xhy/fill/trans 每条 wordLevelGuide 均不含其 a 且非空', () => {
  const fs = require('fs');
  const path = require('path');
  const constants = require('../../miniprogram/utils/constants');
  const DATA_DIR = path.join(__dirname, '../../miniprogram/data');
  const WORD_TYPES = ['zc', 'xhy', 'fill', 'trans'];
  // 期望各词级类型条数（词库扩充时此处会提醒同步确认）
  const EXPECTED = { zc: 58, xhy: 29, fill: 130, trans: 105 };
  const count = { zc: 0, xhy: 0, fill: 0, trans: 0 };
  let total = 0;
  for (const g of constants.GRADES) {
    const obj = require(path.join(DATA_DIR, g.file));
    for (const it of (obj.items || [])) {
      if (WORD_TYPES.indexOf(it.type) === -1) continue;
      count[it.type]++;
      total++;
      const a = String(it.a);
      const guide = q.wordLevelGuide(it);
      const where = '[' + g.key + ' ' + it.type + '] q=' + it.q + ' a=' + a +
        ' guide=' + JSON.stringify(guide);
      s.assert.ok(typeof guide === 'string' && guide.length > 0, where + ' → guide 为空');
      s.assert.ok(guide.indexOf(a) === -1, where + ' → guide 含答案 a（剧透）');
      s.assert.ok(guide.indexOf('__') === -1 && guide.indexOf('*') === -1, where + ' → guide 含挖空占位符');
    }
  }
  s.assert.equal(total, 322, '7 词库词级词条合计应为 322');
  for (const k of Object.keys(EXPECTED)) {
    s.assert.equal(count[k], EXPECTED[k], k + ' 条数应为 ' + EXPECTED[k] + '，实际 ' + count[k]);
  }
});

s.done();