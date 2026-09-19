/**
 * game/quiz.js —— 限时抢答（2026-09-19 一期第 4 件）纯逻辑
 *
 * 玩法：倒计时内「看释义抢词」——
 *   · 一局固定题量（默认 10）**或** 时间耗尽（默认 60 秒）先到者结束；
 *   · 答对 +分并累连击；答错连击归零并**扣时间**（比扣命更贴合「限时」主题，也更好懂）；
 *   · 星级沿用全局口径：答对率 90/70/60 → 3/2/1 星。
 *
 * 为什么单独一个模块：页面只管渲染与计时，判定/出题/计分做成纯函数就能单测
 * （见 tests/unit/quiz.test.js），以后调难度只改这里的常量。
 */

'use strict';

var quizBank = require('./quiz-bank');

/** 一局参数（页面可用关卡参数覆盖） */
var CONFIG = {
  totalQ: 10,          // 题量上限
  seconds: 60,         // 总时长（秒）
  wrongPenalty: 2,     // 答错扣多少秒
  scorePerCorrect: 10, // 答对基础分
  scoreCombo: 5,       // 连击额外分（每题最多加这么多档）
  scoreComboMax: 25    // 连击额外分封顶
};

/**
 * 计分：基础分 + 连击加成（封顶，避免长连击把分数拉爆）。
 * @param {number} combo 本题答对后的连击数（从 1 起）
 */
function scoreOf(combo) {
  var c = Math.max(1, parseInt(combo, 10) || 1);
  var bonus = Math.min(CONFIG.scoreComboMax, (c - 1) * CONFIG.scoreCombo);
  return CONFIG.scorePerCorrect + bonus;
}

/** 连击提示文案（连对 2/3/5 才出，与其它玩法一致） */
function comboTextOf(combo) {
  var c = parseInt(combo, 10) || 0;
  if (c < 2) return '';
  if (c >= 5) return c + ' 连击!🎉';
  if (c >= 3) return c + ' 连击!🔥';
  return c + ' 连击!';
}

/**
 * 星级：按答对率（答对 / 本局题量）折算，复用全局 90/70/60 三档。
 * @param {number} right 答对题数
 * @param {number} total 本局题量
 */
function starsOf(right, total) {
  var t = parseInt(total, 10) || 0;
  if (!t) return 0;
  var rate = (parseInt(right, 10) || 0) / t * 100;
  if (rate >= 90) return 3;
  if (rate >= 70) return 2;
  if (rate >= 60) return 1;
  return 0;
}

/**
 * 结算结果（纯函数，便于页面对齐结算页参数）。
 * @param {Object} st { score, right, answered, totalQ, maxCombo, timeLeft }
 */
function resultOf(st) {
  var s = st || {};
  var total = parseInt(s.totalQ, 10) || CONFIG.totalQ;
  var right = parseInt(s.right, 10) || 0;
  var answered = parseInt(s.answered, 10) || 0;
  return {
    // 答满题量且时间没用完 = 通关；时间耗尽也结算，但按「未答完」处理
    win: answered >= total,
    score: parseInt(s.score, 10) || 0,
    right: right,
    answered: answered,
    totalQ: total,
    maxCombo: parseInt(s.maxCombo, 10) || 0,
    timeLeft: parseInt(s.timeLeft, 10) || 0,
    // 星级按总题量算（没答完的题算错），避免「只答 2 题全对拿 3 星」
    stars: starsOf(right, total),
    rate: Math.round(right / total * 100)
  };
}

/**
 * 造一道抢答题。
 *
 * 题干取「释义/提示」；答案取完整词。**题干与答案相同（例如 c1 的 q=云 a=云）的条目直接判为不可用** ——
 * 那等于把答案写在题干上。页面拿到 null 就跳过这一题。
 *
 * @param {Object} item 词条
 * @param {Array} bank 同段词库（干扰项来源）
 * @returns {Object|null} { item, stem, answer, options:[{text,ok}], type }
 */
function buildRound(item, bank) {
  var r = quizBank.buildOptions(item, bank);
  if (!r) return null;
  return {
    item: item,
    type: item.type || '',
    stem: r.stem,
    answer: r.answer,
    options: r.options
  };
}

module.exports = {
  CONFIG: CONFIG,
  scoreOf: scoreOf,
  comboTextOf: comboTextOf,
  starsOf: starsOf,
  resultOf: resultOf,
  buildRound: buildRound
};
