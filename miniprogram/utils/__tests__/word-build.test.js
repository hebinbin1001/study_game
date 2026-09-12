/**
 * word-build.test.js —— 拼字类玩法共用引擎单测（玩法落地：demo g2 / g3）
 *
 * 覆盖 game/word-build.js：词条筛选（英文单词 / 成语）、词池合并降级、
 * 干扰字生成、字块与槽位的放置/取出/提示、星级。
 * 最后一组用例直接用真实词库跑通"一整局"，确保引擎能真正解出题目。
 *
 * 运行：node miniprogram/utils/__tests__/word-build.test.js
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('game/word-build.js');

const g = require('../../game/word-build');

const CONSTANTS = require('../../utils/constants');

/** 收集全部学段的词条（真实词库，用于集成用例） */
function allItems() {
  const out = [];
  CONSTANTS.GRADES.forEach(function (gr) {
    const data = require('../../data/' + gr.file);
    (data.items || []).forEach(function (it) { out.push(it); });
  });
  return out;
}

/** 确定性随机源：给定种子，序列可复现 */
function seededRandom(seed) {
  let x = seed || 1;
  return function () {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
}

s.test('常量：每局 8 题、5 条命、3 次提示、每题 10 分', () => {
  s.assert.equal(g.ROUND_Q, 8);
  // 命数 3 → 5（2026-09-12 与字母射击统一口径）：
  // 3 命时通关最多错 2 题，8 题局最低正确率 75%，1 星档拿不到（R1 同类死区）。
  s.assert.equal(g.LIVES, 5);
  s.assert.equal(g.HINTS, 3);
  s.assert.equal(g.POINTS, 10);
  s.assert.equal(g.EXTRA_TILES, 2);
});

s.test('英文词条筛选：必须纯字母且 3~10 个字母', () => {
  s.assert.true(g.isLetterItem({ a: 'apple' }));
  s.assert.true(g.isLetterItem({ a: 'dog' }));
  s.assert.true(g.isLetterItem({ a: 'impossible' }), '10 个字母仍在可拼范围内');
  s.assert.false(g.isLetterItem({ a: 'hi' }), '两个字母太短');
  s.assert.false(g.isLetterItem({ a: 'correspondence' }), '14 个字母太长，屏幕放不下字块');
  s.assert.false(g.isLetterItem({ a: '一心一意' }), '汉字不是单词');
  s.assert.false(g.isLetterItem({ a: 'apple banana' }), '带空格不是单词');
  s.assert.false(g.isLetterItem({ a: '' }));
  s.assert.false(g.isLetterItem(null));
});

s.test('成语词条筛选：不含英文字母且长度 >= 4', () => {
  s.assert.true(g.isIdiomItem({ a: '水到渠成' }));
  s.assert.true(g.isIdiomItem({ a: '一心一意' }));
  s.assert.true(g.isIdiomItem({ a: '己所不欲勿施于人' }), '长成语也算');
  s.assert.false(g.isIdiomItem({ a: '明天' }), '两字词不算成语');
  s.assert.false(g.isIdiomItem({ a: 'apple' }), '英文不算成语');
  s.assert.false(g.isIdiomItem(null));
});

s.test('词条筛选：同一答案只保留一条（去重）', () => {
  const pool = g.filterPool([
    { a: 'apple', hint: '苹果' },
    { a: 'Apple', hint: '苹果（重复）' },
    { a: 'banana', hint: '香蕉' }
  ], 'letter');
  s.assert.equal(pool.length, 2);
});

s.test('词池合并：首选够 8 条时不并入兜底词池', () => {
  const primary = [];
  for (let i = 0; i < 9; i++) primary.push({ a: 'word' + String.fromCharCode(97 + i), hint: 'x' });
  const merged = g.mergePools(primary, [{ a: 'fallbackword' }], 'letter', 8);
  s.assert.equal(merged.length, 9);
  s.assert.false(merged.some(function (it) { return it.a === 'fallbackword'; }));
});

s.test('词池合并：首选不足 8 条时并入兜底并去重', () => {
  const merged = g.mergePools(
    [{ a: 'apple' }, { a: 'banana' }],
    [{ a: 'Apple' }, { a: 'cherry' }, { a: 'date' }],
    'letter',
    3
  );
  s.assert.equal(merged.length, 4, 'apple/banana/cherry/date，Apple 与 apple 视为同一条');
  const answers = merged.map(function (it) { return it.a.toLowerCase(); });
  s.assert.equal(new Set(answers).size, answers.length);
});

s.test('抽题：数量正确、互不重复、可复现', () => {
  const pool = [];
  for (let i = 0; i < 20; i++) pool.push({ a: 'word' + i });
  for (let t = 0; t < 50; t++) {
    const qs = g.pickQuestions(pool, 8, seededRandom(t + 1));
    s.assert.equal(qs.length, 8);
    s.assert.equal(new Set(qs.map(function (x) { return x.a; })).size, 8);
  }
  s.assert.deepEqual(
    g.pickQuestions(pool, 3, seededRandom(7)).map(function (x) { return x.a; }),
    g.pickQuestions(pool, 3, seededRandom(7)).map(function (x) { return x.a; }),
    '同种子应得到同一套题'
  );
  s.assert.equal(g.pickQuestions(pool, 999).length, 20, '要的比词池多时给多少算多少');
  s.assert.equal(g.pickQuestions([], 8).length, 0);
});

s.test('题面文案：中英互译显示中文词，其余显示释义', () => {
  s.assert.equal(g.promptOf({ type: 'trans', q: '苹果', hint: '水果' }, 'letter'), '苹果');
  s.assert.equal(g.promptOf({ type: 'w1', q: 'apple', hint: '苹果' }, 'letter'), '苹果', 'w1 不能把英文答案当题面');
  s.assert.equal(g.promptOf({ type: 'c2', a: '水到渠成', hint: '条件成熟事情自然成功' }, 'idiom'), '条件成熟事情自然成功');
  s.assert.equal(g.promptOf(null, 'letter'), '');
});

s.test('干扰字：数量正确、不与答案字重复、可复现', () => {
  const pool = [{ a: '水到渠成' }, { a: '一心一意' }, { a: '守株待兔' }];
  for (let t = 0; t < 30; t++) {
    const noise = g.noiseChars(pool, '水到渠成', 2, seededRandom(t + 1));
    s.assert.equal(noise.length, 2);
    noise.forEach(function (ch) {
      s.assert.false('水到渠成'.indexOf(ch) !== -1, '干扰字不能是答案里的字：' + ch);
    });
    s.assert.allDistinct(noise);
  }
  s.assert.equal(g.noiseChars(pool, '水到渠成', 2, seededRandom(3)).join(''),
    g.noiseChars(pool, '水到渠成', 2, seededRandom(3)).join(''));
});

s.test('字块：字符多重集 = 答案 + 干扰字，id 与下标一致', () => {
  const tiles = g.makeTiles('水到渠成', ['月', '日'], seededRandom(5));
  s.assert.equal(tiles.length, 6);
  const chars = tiles.map(function (t) { return t.ch; }).sort().join('');
  s.assert.equal(chars, '日月水到渠成'.split('').sort().join(''));
  tiles.forEach(function (t, i) {
    s.assert.equal(t.id, i);
    s.assert.false(t.used);
    s.assert.false(t.hinted);
  });
});

s.test('放置与取出：状态可逆，不能越界或重复放置', () => {
  let tiles = g.makeTiles('abc', [], seededRandom(1));
  let slots = g.makeSlots(3);
  s.assert.equal(g.answerText(slots, tiles), '');
  s.assert.false(g.isComplete(slots));

  const first = g.placeTile(tiles, slots, 0);
  s.assert.true(first.tiles[0].used);
  s.assert.equal(first.slots[0], 0);

  const again = g.placeTile(first.tiles, first.slots, 0);
  s.assert.equal(g.answerText(again.slots, again.tiles), first.tiles[0].ch, '同一字块不能放两次');

  const back = g.takeSlot(first.tiles, first.slots, 0);
  s.assert.equal(back.slots[0], null);
  s.assert.false(back.tiles[0].used);
  s.assert.equal(g.answerText(back.slots, back.tiles), '');

  let full = g.makeSlots(1);
  const filled = g.placeTile(tiles, full, 1);
  s.assert.equal(filled.slots[0], 1);
  const overflow = g.placeTile(filled.tiles, filled.slots, 2);
  s.assert.equal(g.answerText(overflow.slots, overflow.tiles), tiles[1].ch, '槽位满了就放不进去');
});

s.test('提示：只补第一个错位/空位，连续提示可补全整题', () => {
  const answer = '水到渠成';
  let tiles = g.makeTiles(answer, ['月', '日'], seededRandom(9));
  let slots = g.makeSlots(4);

  let step = g.hintStep(answer, tiles, slots);
  s.assert.equal(step.index, 0);
  s.assert.equal(g.answerText(step.slots, step.tiles), '水');
  s.assert.true(step.tiles[step.slots[0]].hinted, '提示放进去的字块要标记');
  if (!step) throw new Error('提示应返回一步');

  tiles = step.tiles; slots = step.slots;
  for (let i = 0; i < 3; i++) {
    const nxt = g.hintStep(answer, tiles, slots);
    s.assert.ok(nxt, '第 ' + (i + 2) + ' 次提示不应为 null');
    tiles = nxt.tiles; slots = nxt.slots;
  }
  s.assert.true(g.isComplete(slots));
  s.assert.true(g.isCorrect(g.answerText(slots, tiles), answer), '连续提示应拼出正确答案');
  s.assert.equal(g.hintStep(answer, tiles, slots), null, '已全对时提示返回 null');
});

s.test('提示：槽位放错字时会替换为正确字', () => {
  const answer = 'abc';
  let tiles = g.makeTiles(answer, [], seededRandom(2));
  let slots = g.makeSlots(3);
  // 故意把一个"不是 a"的字块放到第一个槽位
  const wrongIdx = tiles.findIndex(function (t) { return t.ch !== answer.charAt(0); });
  s.assert.ok(wrongIdx >= 0);
  const wrong = g.placeTile(tiles, slots, wrongIdx);
  tiles = wrong.tiles; slots = wrong.slots;
  const step = g.hintStep(answer, tiles, slots);
  s.assert.ok(step);
  s.assert.equal(step.index, 0, '第一个槽位放错了，提示应先纠正它');
  s.assert.equal(g.answerText(step.slots, step.tiles).charAt(0), answer.charAt(0));
});

s.test('判定：英文忽略大小写，长度不符即判错', () => {
  s.assert.true(g.isCorrect('Apple', 'apple'));
  s.assert.true(g.isCorrect('apple', 'APPLE'));
  s.assert.false(g.isCorrect('appl', 'apple'));
  s.assert.false(g.isCorrect('', 'apple'));
});

s.test('星级：按答对比例 90% / 70% / 60% 分三档（与字母射击同口径）', () => {
  s.assert.equal(g.starsFor(8, 8), 3);
  s.assert.equal(g.starsFor(7, 8), 2, '87.5% 未到 90%，应落到 2 星');
  s.assert.equal(g.starsFor(6, 8), 2);
  s.assert.equal(g.starsFor(5, 8), 1, '62.5% 落在 1 星档（60%~69%）');
  s.assert.equal(g.starsFor(4, 8), 0, '50% 未到 60%，应无星');
  s.assert.equal(g.starsFor(3, 8), 0);
  s.assert.equal(g.starsFor(0, 8), 0);
  s.assert.equal(g.starsFor(0, 0), 0);
});

s.test('集成：用真实词库跑通字母拼词一整局（每局 8 题全部可解）', () => {
  const items = allItems();
  const pool = g.mergePools(items, items, 'letter', g.ROUND_Q);
  s.assert.ok(pool.length >= g.ROUND_Q, '英文词条应足够开一局，实际 ' + pool.length);
  const rnd = seededRandom(11);
  const qs = g.pickQuestions(pool, g.ROUND_Q, rnd);
  s.assert.equal(qs.length, g.ROUND_Q);
  qs.forEach(function (item) {
    const answer = String(item.a);
    s.assert.true(g.isLetterItem(item));
    let tiles = g.makeTiles(answer, [], rnd);
    let slots = g.makeSlots(answer.length);
    s.assert.equal(g.answerText(slots, tiles), '');
    // 用提示逐步解开这一题
    for (let i = 0; i < answer.length; i++) {
      const st = g.hintStep(answer, tiles, slots);
      s.assert.ok(st, '题目「' + answer + '」应能提示出第 ' + (i + 1) + ' 个字');
      tiles = st.tiles; slots = st.slots;
    }
    s.assert.true(g.isCorrect(g.answerText(slots, tiles), answer), '拼出的答案应正确：' + answer);
    s.assert.true(g.isComplete(slots));
  });
});

s.test('集成：用真实词库跑通成语拼字一整局（含干扰字）', () => {
  const items = allItems();
  const pool = g.mergePools(items, items, 'idiom', g.ROUND_Q);
  s.assert.ok(pool.length >= g.ROUND_Q, '成语词条应足够开一局，实际 ' + pool.length);
  const rnd = seededRandom(23);
  const qs = g.pickQuestions(pool, g.ROUND_Q, rnd);
  qs.forEach(function (item) {
    const answer = String(item.a);
    const noise = g.noiseChars(pool, answer, g.EXTRA_TILES, rnd);
    s.assert.equal(noise.length, g.EXTRA_TILES);
    let tiles = g.makeTiles(answer, noise, rnd);
    s.assert.equal(tiles.length, answer.length + g.EXTRA_TILES, '字块数 = 答案字数 + 干扰字');
    let slots = g.makeSlots(answer.length);
    for (let i = 0; i < answer.length; i++) {
      const st = g.hintStep(answer, tiles, slots);
      s.assert.ok(st);
      tiles = st.tiles; slots = st.slots;
    }
    s.assert.true(g.isCorrect(g.answerText(slots, tiles), answer), '拼出的成语应正确：' + answer);
  });
});

s.test('结算文案：包含答对题数、得分与剩余提示', () => {
  const text = g.resultText(6, 8, 60, 1);
  s.assert.contains(text, '6 / 8');
  s.assert.contains(text, '60');
  s.assert.contains(text, '1');
});

s.done();
