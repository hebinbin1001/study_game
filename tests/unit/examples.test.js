/**
 * examples.test.js —— 词条例句数据（2026-10-28 起分批补）
 *
 * 为什么值得测：
 *   · 例句是**手写内容**，最常见的错不是崩溃，是「看着像对的」——比如句子里的词
 *     拼成了另一个词、英文写完忘了写中文、或者词库里那词早就被删了自己不知道；
 *     这些都不会让任何代码报错，只会让用户在错题卡上看到一句错话；
 *   · 键写错一个字母，例句就永远不会显示（静默失效），而 diff 里看不出来；
 *   · 错题卡是一行小字，长句会挤成三行把卡片撑破。
 *
 * 所以这里做四件事：键必须真的在词库里、英文句必须含该词、必须有中文翻译、
 * 长度必须压住。全部逐条比对，不抽样。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('词条例句');

const examples = require('../../miniprogram/data/examples');
const dict = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');

/** 已知的合法学段 key（防止数据文件里写出 g15 这种） */
const GRADES = constants.GRADES.map((g) => g.key);

/** 单条例句最长字符数（结算页错题卡一行小字，超了会挤成三行） */
const MAX_LEN = 100;

/** 单条例句里的英文部分最长字符数 —— 中文翻译本身很短，卡住英文就够了 */
const MAX_EN = 60;

/** 是否含中文（用来判断「翻译到底写没写」） */
function hasCJK(text) {
  return /[\u4e00-\u9fa5]/.test(text);
}

/**
 * 英文句是否包含该词（允许常见词形变化）。
 * 为什么不只做 indexOf：`collect` 的例句写 `She collects stamps` 是合格的，
 * 但 `collect` 单独出现时也要求整词匹配，否则 `act` 会被 `active` 误判为命中。
 */
function containsWord(sentence, word) {
  const esc = String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('\\b' + esc + '(s|es|ed|d|ing|er|est)?\\b', 'i');
  return re.test(sentence);
}

/** 拆成 [英文句, 中文翻译] */
function splitPair(value) {
  const text = String(value || '');
  // 第一个中文字符之前的部分算英文
  const idx = text.search(/[\u4e00-\u9fa5]/);
  if (idx <= 0) return ['', text.trim()];
  return [text.slice(0, idx).trim(), text.slice(idx).trim()];
}

/** 该年级词库里所有答案（小写）→ 原始词形 */
function answerSet(grade) {
  const map = {};
  const items = dict.loadBuiltin(grade) || [];
  for (const it of items) {
    if (it && it.a) map[String(it.a).toLowerCase()] = String(it.a);
  }
  return map;
}

// ---------- 一、数据形状 ----------

s.test('数据文件结构：只含合法学段、每条都是非空字符串', () => {
  const keys = Object.keys(examples);
  s.assert.ok(keys.length > 0, '例句文件是空的');
  for (const grade of keys) {
    s.assert.ok(GRADES.indexOf(grade) !== -1, '例句里出现未知学段 ' + grade);
    const table = examples[grade];
    s.assert.equal(typeof table, 'object', grade + ' 应该是对象');
    for (const word of Object.keys(table)) {
      const v = table[word];
      s.assert.equal(typeof v, 'string', grade + '.' + word + ' 的值必须是字符串');
      s.assert.ok(v.trim().length > 0, grade + '.' + word + ' 是空串');
    }
  }
});

s.test('例句总量：至少 100 条（第一批规模），且不重复', () => {
  let total = 0;
  const all = [];
  for (const grade of Object.keys(examples)) {
    for (const word of Object.keys(examples[grade])) {
      total++;
      all.push(examples[grade][word]);
    }
  }
  s.assert.ok(total >= 100, '例句总数 ' + total + ' 少于第一批的 100 条');
  // 同一句英文出现在两个词下 = 多半是复制粘贴时忘了改词
  s.assert.allDistinct(all, '存在完全相同的例句，可能是复制未改');
});

// ---------- 二、逐条校验 ----------

s.test('键必须真的存在于对应年级词库（防拼错 / 词库删词后悬空）', () => {
  for (const grade of Object.keys(examples)) {
    const live = answerSet(grade);
    for (const word of Object.keys(examples[grade])) {
      s.assert.ok(live[word.toLowerCase()],
        grade + ' 词库里没有「' + word + '」这个词，例句永远不会显示');
    }
  }
});

s.test('英文句必须包含该词（允许 -s/-ed/-ing 变形）', () => {
  for (const grade of Object.keys(examples)) {
    for (const word of Object.keys(examples[grade])) {
      const en = splitPair(examples[grade][word])[0];
      s.assert.ok(containsWord(en, word),
        grade + '.' + word + ' 的英文句里找不到这个词：' + en);
    }
  }
});

s.test('必须有中文翻译，且与英文之间有分隔', () => {
  for (const grade of Object.keys(examples)) {
    for (const word of Object.keys(examples[grade])) {
      const value = examples[grade][word];
      const pair = splitPair(value);
      s.assert.ok(hasCJK(value), grade + '.' + word + ' 没有中文翻译');
      s.assert.ok(pair[0].length > 0, grade + '.' + word + ' 只有中文、没有英文句');
      // 英文与中文之间必须留一个空格，否则渲染成「...day.我度过了...」粘在一起
      s.assert.ok(/[\s]$/.test(value.slice(0, value.length - pair[1].length)),
        grade + '.' + word + ' 的英文与中文之间缺空格');
    }
  }
});

s.test('长度压得住错题卡：整条 ≤ 100 字符，英文句 ≤ 60 字符', () => {
  for (const grade of Object.keys(examples)) {
    for (const word of Object.keys(examples[grade])) {
      const value = examples[grade][word];
      const en = splitPair(value)[0];
      s.assert.ok(value.length <= MAX_LEN,
        grade + '.' + word + ' 整条 ' + value.length + ' 字符，超过 ' + MAX_LEN);
      s.assert.ok(en.length <= MAX_EN,
        grade + '.' + word + ' 英文句 ' + en.length + ' 字符，超过 ' + MAX_EN);
    }
  }
});

s.test('英文句是完整句子：首字母大写，以 . ? ! 结尾', () => {
  for (const grade of Object.keys(examples)) {
    for (const word of Object.keys(examples[grade])) {
      const en = splitPair(examples[grade][word])[0];
      s.assert.ok(/^[A-Z]/.test(en), grade + '.' + word + ' 英文句没有首字母大写：' + en);
      s.assert.ok(/[.?!]$/.test(en), grade + '.' + word + ' 英文句没有句末标点：' + en);
      // 中文全角标点混进英文句里，多半是写完英文直接接了中文
      s.assert.ok(!/[，。！？；：]/.test(en), grade + '.' + word + ' 英文句里混入了中文标点');
    }
  }
});

// ---------- 三、与词库对接 ----------

s.test('attachExamples：例句确实装到了词条上（loadBuiltin 出口可见）', () => {
  const grade = Object.keys(examples).find((g) => Object.keys(examples[g]).length > 0);
  const table = examples[grade];
  const word = Object.keys(table)[0];
  const items = dict.loadBuiltin(grade);
  const hit = items.filter((it) => it && String(it.a).toLowerCase() === word.toLowerCase());
  s.assert.ok(hit.length > 0, '词库里找不到 ' + grade + '.' + word);
  s.assert.ok(hit[0].ex, '词条 ' + word + ' 上没有 ex 字段，attachExamples 没生效');
  s.assert.equal(hit[0].ex, table[word], 'ex 内容与数据文件不一致');

  // loadByGrade（套过用户覆盖层）也要带着例句
  const viaLoad = dict.loadByGrade(grade)
    .filter((it) => it && String(it.a).toLowerCase() === word.toLowerCase());
  s.assert.ok(viaLoad.length > 0 && viaLoad[0].ex, 'loadByGrade 出口丢了 ex');
});

s.test('attachExamples：一条都补不上时返回原数组（不为结构统一白拷贝 2400 条）', () => {
  const input = [{ type: 'w1', q: 'zzzz', a: 'zzzz', hint: 'x' }];
  const out = dict.attachExamples(input, 'kg');   // kg 有例句表，但 zzzz 不在表里
  s.assert.equal(out, input, '一条都没补上却复制了新数组');
  s.assert.ok(!input[0].ex, '不该给没有例句的词条塞空 ex');
});

s.test('attachExamples：词条自带的 ex 优先于数据文件（用户在题库里改过的不被覆盖）', () => {
  const grade = Object.keys(examples).find((g) => Object.keys(examples[g]).length > 0);
  const word = Object.keys(examples[grade])[0];
  const table = examples[grade];

  // 直接喂给纯函数：带 ex 的词条原样保留，不带 ex 的才从数据文件补
  const input = [
    { type: 'w1', q: word, a: word, hint: 'x', ex: 'MINE. 我自己写的。' },
    { type: 'w1', q: word + '2', a: word, hint: 'x' }
  ];
  const out = dict.attachExamples(input, grade);
  s.assert.equal(out[0].ex, 'MINE. 我自己写的。', '词条自带的 ex 被数据文件覆盖了');
  s.assert.equal(out[1].ex, table[word], '没有 ex 的词条应当从数据文件补上');
  s.assert.notEqual(out, input, '有补装时必须返回新数组（不能改入参）');
  s.assert.equal(input[1].ex, undefined, '入参被改写了');
});

s.test('attachExamples：没有例句的学段 / 空输入，原样返回不崩', () => {
  const input = [{ type: 'w1', q: 'x', a: 'x', hint: 'y' }];
  s.assert.equal(dict.attachExamples(input, 'g99'), input, '未知学段应原样返回');
  s.assert.equal(dict.attachExamples([], 'kg').length, 0);
  s.assert.equal(dict.attachExamples(null, 'kg'), null, 'null 输入应原样返回');
});

s.done();
