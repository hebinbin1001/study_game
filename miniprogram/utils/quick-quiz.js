/**
 * utils/quick-quiz.js —— 按种子组一套「看词选义」选择题（每日挑战 / 好友 PK 共用）
 *
 * 为什么单独抽出来：
 *   · 每日挑战赛要求「同一天、同一学段、所有人同一套题」；
 *   · 好友 PK 要求「发起人和应战人同一套题」。
 *   两者都是「同一个种子 → 同一套题」，因此共用这一份组题逻辑，
 *   随机源一律来自 utils/rng.js（可复现），不用 Math.random。
 *
 * 返回结构（页面只负责渲染）：
 *   {
 *     index: 0,
 *     word: 'apple',            // 题面
 *     meaning: '苹果',           // 正确答案
 *     sub: '选出正确的释义',
 *     options: [{ text, key }], // 4 个选项，key 为 '0'~'3'
 *     answerKey: '1'            // 正确项 key
 *   }
 */
'use strict';

var dict = require('./dict');
var rng = require('./rng');

/** 干扰项兜底（词库太小、凑不满 3 个干扰时用） */
var FALLBACK = ['以上都不是', '暂时想不起来', '换一个'];

/**
 * 词条 → 题面文本（去掉 * 挖空标记）
 * @param {Object} item
 * @returns {string}
 */
function wordOf(item) {
  return String((item && (item.a || item.q)) || '').replace(/\*/g, '');
}

/**
 * 词条 → 释义文本（没有 hint 就用答案本身，保证不出空串）
 * @param {Object} item
 * @returns {string}
 */
function meaningOf(item) {
  var m = item && item.hint;
  if (m) return String(m);
  return wordOf(item);
}

/**
 * 组一套题。
 * @param {string} grade 学段 key
 * @param {number|string} seed 种子（数字或字符串，字符串会自动 hash）
 * @param {number} [count=10] 题数
 * @returns {Array<Object>} 题目数组；题库为空时返回 []
 */
function buildQuiz(grade, seed, count) {
  var items = dict.loadByGrade(grade);
  if (!items || !items.length) return [];

  var want = Math.max(1, Math.min(parseInt(count, 10) || 10, items.length));
  var rand = rng.makeRng(seed);
  // 抽题：从整个学段题库里按种子取 N 条不重复
  var picked = rng.pickN(items, want, rand);

  return picked.map(function (item, i) {
    var correct = meaningOf(item);
    var seen = {};
    seen[correct] = true;
    var distractors = [];

    // 干扰项：同一学段其他词条的释义，按同一随机源打散后取前 3 个不同的
    var pool = rng.shuffle(items, rand);
    for (var j = 0; j < pool.length && distractors.length < 3; j++) {
      var h = meaningOf(pool[j]);
      if (!h || h === correct || seen[h]) continue;
      seen[h] = true;
      distractors.push(h);
    }
    // 兜底补齐（保证永远是 4 选项）
    for (var k = 0; distractors.length < 3 && k < FALLBACK.length; k++) {
      if (!seen[FALLBACK[k]]) {
        seen[FALLBACK[k]] = true;
        distractors.push(FALLBACK[k]);
      }
    }

    var options = rng.shuffle([correct].concat(distractors), rand);
    var answerKey = String(options.indexOf(correct));
    return {
      index: i,
      word: wordOf(item),
      meaning: correct,
      sub: '选出正确的释义',
      options: options.map(function (t, oi) { return { text: t, key: String(oi) }; }),
      answerKey: answerKey
    };
  });
}

module.exports = {
  buildQuiz: buildQuiz,
  wordOf: wordOf,
  meaningOf: meaningOf
};
