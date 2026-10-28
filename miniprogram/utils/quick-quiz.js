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
  // item.word 是生词本收藏项（2026-10-28）：收藏记录只存 word/hint/ipa，
  // 没有题库里的 a/q 字段，这里兼容一下，免得页面为了组题再手写一遍映射。
  return String((item && (item.a || item.q || item.word)) || '').replace(/\*/g, '');
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
/**
 * 组题内核：从 pickPool 抽题，从 distractorPool 取干扰项。
 *
 * 为什么把「抽哪些词」和「干扰项从哪来」拆成两个池：
 *   生词本组局要用**收藏的词**当题目，但干扰项得来自**整个学段词库** ——
 *   只收藏了 3 个词的人，如果干扰项也从收藏里取，四个选项会变成
 *   「苹果 / 香蕉 / 以上都不是 / 暂时想不起来」，题就废了。
 *
 * @param {Array<Object>} pickPool 出题池
 * @param {number|string} seed
 * @param {number} count
 * @param {Array<Object>} distractorPool 干扰项池（为空则退回出题池）
 */
function buildCore(pickPool, seed, count, distractorPool) {
  var items = pickPool;
  if (!items || !items.length) return [];
  var poolBase = distractorPool && distractorPool.length ? distractorPool : items;

  var want = Math.max(1, Math.min(parseInt(count, 10) || 10, items.length));
  var rand = rng.makeRng(seed);
  // 抽题：从整个池子里按种子取 N 条不重复
  var picked = rng.pickN(items, want, rand);

  return picked.map(function (item, i) {
    var correct = meaningOf(item);
    var seen = {};
    seen[correct] = true;
    var distractors = [];

    // 干扰项：池内其他词条的释义，按同一随机源打散后取前 3 个不同的
    var pool = rng.shuffle(poolBase, rand);
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

/**
 * 组一套题（每日挑战 / 好友 PK 用）。
 * @param {string} grade 学段 key
 * @param {number|string} seed 种子（数字或字符串，字符串会自动 hash）
 * @param {number} [count=10] 题数
 * @returns {Array<Object>} 题目数组；题库为空时返回 []
 */
function buildQuiz(grade, seed, count) {
  var items = dict.loadByGrade(grade);
  // 干扰池与出题池传同一份引用，行为与拆分前完全一致：
  // 「同一种子出同一套题」是 PK 与每日挑战的地基，不能因为重构而漂移。
  return buildCore(items, seed, count, items);
}

/**
 * 用指定词条组一套题（生词本组局用）。
 * @param {Array<Object>} items 出题词条（先由页面从 /api/favorite/list 取回）
 * @param {number|string} seed
 * @param {number} [count=10]
 * @param {Array<Object>} [distractorPool] 干扰项池，通常是 dict.loadByGrade(grade)
 * @returns {Array<Object>}
 */
function buildQuizFromItems(items, seed, count, distractorPool) {
  return buildCore(items, seed, count, distractorPool);
}

module.exports = {
  buildQuiz: buildQuiz,
  buildQuizFromItems: buildQuizFromItems,
  wordOf: wordOf,
  meaningOf: meaningOf
};
