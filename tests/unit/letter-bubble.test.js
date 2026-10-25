/**
 * Boss 补字母泡泡龙：题库过滤、缺口唯一、护盾泡泡与关卡接入护栏。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { suite } = require('./_runner');
const s = suite('Boss 补字母泡泡龙');

const lib = require('../../miniprogram/game/letter-bubble');
const challenge = require('../../miniprogram/utils/challenge');
const rng = require('../../miniprogram/utils/rng');

const item = {
  type: 'w1',
  q: 'school',
  a: 'school',
  hint: '学校',
  ipa: 'skuːl'
};

s.test('只接受有释义的纯英文 w1 词条', () => {
  s.assert.equal(lib.usableItem(item), true);
  s.assert.equal(lib.usableItem({ type: 'w2', q: 'apple', hint: '苹果' }), false);
  s.assert.equal(lib.usableItem({ type: 'w1', q: '苹果', hint: '苹果' }), false);
  s.assert.equal(lib.usableItem({ type: 'w1', q: 'cat', hint: '' }), false);
});

s.test('题面、缺口和字母卡一致', () => {
  const round = lib.buildRound(item, {
    bubbleCount: 8,
    random: rng.makeRng(7)
  });
  s.assert.equal(round.word, 'school');
  s.assert.equal(round.meaning, '学校');
  s.assert.match(round.missing, /^[a-z]$/);
  s.assert.equal(round.letters[round.blankIndex].blank, true);
  s.assert.equal(round.letters[round.blankIndex].ch, round.missing);
});

s.test('护盾里恰好一个正确答案，其余字母不重复', () => {
  const round = lib.buildRound(item, {
    bubbleCount: 9,
    random: rng.makeRng(19)
  });
  const lower = round.bubbles.map(function (b) { return b.lower; });
  s.assert.equal(round.bubbles.length, 9);
  s.assert.equal(round.bubbles.filter(function (b) { return b.correct; }).length, 1);
  s.assert.equal(new Set(lower).size, lower.length);
  s.assert.equal(lower.filter(function (ch) { return ch === round.missing; }).length, 1);
});

s.test('同种子可复现，不同种子会换缺口或护盾顺序', () => {
  const a = lib.buildRound(item, { bubbleCount: 8, random: rng.makeRng(77) });
  const b = lib.buildRound(item, { bubbleCount: 8, random: rng.makeRng(77) });
  const c = lib.buildRound(item, { bubbleCount: 8, random: rng.makeRng(78) });
  s.assert.equal(a.blankIndex, b.blankIndex);
  s.assert.deepEqual(a.bubbles.map(function (x) { return x.letter; }),
    b.bubbles.map(function (x) { return x.letter; }));
  s.assert.notDeepEqual(
    a.bubbles.map(function (x) { return x.letter; }),
    c.bubbles.map(function (x) { return x.letter; })
  );
});

s.test('正确/错误命中判定明确', () => {
  const round = lib.buildRound(item, { bubbleCount: 7, random: rng.makeRng(5) });
  const right = round.bubbles.find(function (b) { return b.correct; });
  const wrong = round.bubbles.find(function (b) { return !b.correct; });
  s.assert.equal(lib.resolve(round, right.id).ok, true);
  s.assert.equal(lib.resolve(round, wrong.id).ok, false);
  s.assert.equal(lib.resolve(round, 'not-found').reason, 'not-found');
});

s.test('星级沿用 90/70/60；题量与命数让三档可达', () => {
  s.assert.equal(lib.starsOf(10, 10), 3);
  s.assert.equal(lib.starsOf(8, 10), 2);
  s.assert.equal(lib.starsOf(6, 10), 1);
  ['kg', 'g3', 'g10', 'college'].forEach(function (g) {
    const p = challenge.paramsOf(g, 'letterBubble');
    const reach = challenge.starReachability(p.count, p.lives);
    s.assert.deepEqual(reach.reachable, [1, 2, 3], g + ' 应三档可达');
  });
});

s.test('新玩法已进入主线与独立玩法线，并复用统一页面', () => {
  s.assert.ok(challenge.MODES.letterBubble);
  s.assert.equal(challenge.MODES.letterBubble.gameType, 'letter_bubble');
  s.assert.equal(challenge.MODES.letterBubble.page, '/pages/letter-bubble/letter-bubble');
  s.assert.ok(challenge.LINE_MODES.indexOf('letterBubble') >= 0);
  s.assert.ok(challenge.TEMPLATE.some(function (row) { return row.mode === 'letterBubble'; }));
  const url = challenge.lineUrl('g3', 'letterBubble', 4);
  s.assert.contains(url, '/pages/letter-bubble/letter-bubble?');
  s.assert.contains(url, 'line=mode_letterBubble');
});

s.test('页面接入成绩上报、本机星级与管理员停玩直链守卫', () => {
  const js = fs.readFileSync(
    path.join(__dirname, '../../miniprogram/pages/letter-bubble/letter-bubble.js'), 'utf8');
  s.assert.contains(js, 'playReport.reportPlay');
  s.assert.contains(js, 'storage.saveStars');
  s.assert.contains(js, "gameStatus.isPaused(GAME_KEY)");
  s.assert.contains(js, '管理员已暂停');
});

s.done();
