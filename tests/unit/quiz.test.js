/**
 * quiz.test.js —— 限时抢答纯逻辑（2026-09-19 一期第 4 件）
 *
 * 覆盖出题（题干/干扰项/不可用条目）、计分（连击加成与封顶）、星级（按总题量算，
 * 不许「只答 2 题全对拿 3 星」）、以及结算结果口径。
 */
'use strict';

const { suite } = require('./_runner');
const s = suite('限时抢答（quiz）');

const quiz = require('../../miniprogram/game/quiz');
const bankLib = require('../../miniprogram/game/quiz-bank');
const dict = require('../../miniprogram/utils/dict');
const constants = require('../../miniprogram/utils/constants');

function w(type, q, a, hint) {
  return { type: type, q: q, a: a, hint: hint || '' };
}

s.test('出题：题干取释义、答案取完整词、恰好 4 个互不相同的选项', () => {
  const bank = [
    w('w1', 'cat', 'cat', '猫'),
    w('w1', 'dog', 'dog', '狗'),
    w('w1', 'pig', 'pig', '猪'),
    w('w1', 'cow', 'cow', '牛')
  ];
  const r = quiz.buildRound(bank[0], bank);
  s.assert.equal(r.stem, '猫');
  s.assert.equal(r.answer, 'cat');
  s.assert.equal(r.options.length, 4);
  s.assert.equal(r.options.filter((o) => o.ok).length, 1, '正确项恰好一个');
  s.assert.allDistinct(r.options.map((o) => o.text), '选项互不相同');
});

s.test('题干与答案相同（c1 的 q=云 a=云）判为不可用，避免直接剧透', () => {
  const bank = [w('c1', '云', '云', ''), w('c1', '雨', '雨', ''), w('c1', '雪', '雪', ''), w('c1', '风', '风', '')];
  s.assert.equal(quiz.buildRound(bank[0], bank), null);
});

s.test('hint 缺失时退用题面（w2 去掉星号当提示）', () => {
  const r = quiz.buildRound(w('w2', '*l*ph*nt', 'elephant', ''), [w('w2', 'be*r', 'bear', '')]);
  s.assert.equal(r.stem, 'lphnt');
});

s.test('干扰项优先同题型，词库过小时用兜底池凑够 4 个', () => {
  const r = quiz.buildRound(w('w1', 'cat', 'cat', '猫'), []);
  s.assert.equal(r.options.length, 4, '词库为空也要能成题');
  s.assert.equal(r.options.filter((o) => o.ok).length, 1);
});

s.test('计分：基础分 + 连击加成，最高封顶', () => {
  s.assert.equal(quiz.scoreOf(1), quiz.CONFIG.scorePerCorrect);
  s.assert.ok(quiz.scoreOf(3) > quiz.scoreOf(1), '连击越高分越多');
  s.assert.equal(quiz.scoreOf(999),
    quiz.CONFIG.scorePerCorrect + quiz.CONFIG.scoreComboMax, '加成封顶');
  s.assert.equal(quiz.scoreOf(0), quiz.CONFIG.scorePerCorrect, '连击 0 按 1 算');
});

s.test('连击文案：<2 不出，3/5 带火苗与庆祝', () => {
  s.assert.equal(quiz.comboTextOf(1), '');
  s.assert.equal(quiz.comboTextOf(2), '2 连击!');
  s.assert.equal(quiz.comboTextOf(3), '3 连击!🔥');
  s.assert.equal(quiz.comboTextOf(5), '5 连击!🎉');
});

s.test('星级按「答对 / 本局题量」折算（未答完的算错，不许小样本刷 3 星）', () => {
  s.assert.equal(quiz.starsOf(10, 10), 3);
  s.assert.equal(quiz.starsOf(9, 10), 3);
  s.assert.equal(quiz.starsOf(8, 10), 2);
  s.assert.equal(quiz.starsOf(7, 10), 2);
  s.assert.equal(quiz.starsOf(6, 10), 1);
  s.assert.equal(quiz.starsOf(5, 10), 0);
  s.assert.equal(quiz.starsOf(2, 2), 3, '按比例算本身是对的');
  // 但结算口径用的是「总题量」当分母 → 只答 2 题全对拿不到 3 星
  s.assert.equal(quiz.resultOf({ right: 2, answered: 2, totalQ: 10, score: 20 }).stars, 0);
});

s.test('结算：答满题量算通关；时间耗尽提前结束按未答完算', () => {
  const full = quiz.resultOf({ right: 9, answered: 10, totalQ: 10, score: 120, maxCombo: 4 });
  s.assert.equal(full.win, true);
  s.assert.equal(full.stars, 3);
  s.assert.equal(full.rate, 90);
  const timeout = quiz.resultOf({ right: 6, answered: 7, totalQ: 10, score: 70, timeLeft: 0 });
  s.assert.equal(timeout.win, false, '没答满不算通关');
  s.assert.equal(timeout.stars, 1);
});

s.test('全量真实词库冒烟：多数条目都能成题，且成题都合规', () => {
  let built = 0;
  let skipped = 0;
  constants.GRADES.forEach((g) => {
    const bank = dict.loadByGrade(g.key);
    bank.forEach((item) => {
      const r = quiz.buildRound(item, bank);
      if (!r) { skipped++; return; }
      built++;
      s.assert.equal(r.options.length, 4, '选项数必须是 4：' + JSON.stringify(item));
      s.assert.equal(r.options.filter((o) => o.ok).length, 1, '正确项恰好一个：' + JSON.stringify(item));
      s.assert.ok(r.stem !== r.answer, '题干不能等于答案：' + JSON.stringify(item));
    });
  });
  s.assert.ok(built > 500, '能成题的条目应占多数（实际 ' + built + '，跳过 ' + skipped + '）');
  s.assert.ok(skipped < built * 0.3, '跳过的比例不应超过 30%（实际 ' + skipped + '/' + (built + skipped) + '）');
});

s.test('题目组装模块的纯函数：pickDistinct 去重且不吃排除项', () => {
  s.assert.deepEqual(bankLib.pickDistinct(['a', 'b', 'a', 'c'], 3, ['a']), ['b', 'c']);
  s.assert.deepEqual(bankLib.pickDistinct([], 3, []), []);
  s.assert.equal(bankLib.OPTION_COUNT, 4);
});
