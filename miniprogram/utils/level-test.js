/**
 * utils/level-test.js —— 字词定级测（2026-10-28）
 *
 * 为什么要有：新用户第一次进来必须自己选年级，选错了要么太简单、要么全错，
 * 而「我该选几年级」这个问题只有玩家自己猜。这里用 10 道跨学段的题反推答案，
 * 顺带产出一个可以晒的「约 N 词」——流量阶段这是最自然的分享素材。
 *
 * 设计要点：
 *   · 纯本地、不联网、不落库：10 题全部来自包内词库，测完就写在 storage 里；
 *   · 题面借 utils/quick-quiz.js（「看词选义」），与每日挑战/PK 同一套组题口径，
 *     所以这里出的题和正式玩法长得一样，不会出现「测试题和游戏题不是一回事」；
 *   · 从易到难（kg → g3 → g5 → g7 → g9）：定级测的常规做法，且能减少挫败感；
 *   · 判定用「连续通过」而不是总分：答对 8 题可能是「kg 全对 + 后面全错」，
 *     也可能是「每段各错 1 题」，两种人的实际水平完全不同。
 */

'use strict';

var constants = require('./constants');
var dict = require('./dict');
var quickQuiz = require('./quick-quiz');

/** 抽题学段阶梯（由易到难）。5 段 × 2 题 = 10 题 */
var LADDER = ['kg', 'g3', 'g5', 'g7', 'g9'];
/** 每段题数 */
var PER_GRADE = 2;
/** 总题数 */
var TOTAL = LADDER.length * PER_GRADE;

/** 学段 key → 展示名（认不出退回 key 本身） */
function labelOf(key) {
  for (var i = 0; i < constants.GRADES.length; i++) {
    if (constants.GRADES[i].key === key) return constants.GRADES[i].label;
  }
  return String(key || '');
}

/** 学段 key → 在 GRADES 里的下标（用于「低于推荐年级」的比较），认不出返回 -1 */
function gradeIndex(key) {
  for (var i = 0; i < constants.GRADES.length; i++) {
    if (constants.GRADES[i].key === key) return i;
  }
  return -1;
}

/**
 * 组一套定级测题。
 *
 * @param {number|string} [seed] 随机种子；省略则用当前时间（每次测都换一套题）。
 *   传固定值只为单测可复现，运行时不要传。
 * @returns {Array<Object>} 题目数组，每项在 quick-quiz 的字段上追加
 *   { grade, gradeLabel, lv }；题库缺失时返回的数组会短于 10 题。
 */
function buildTest(seed) {
  var out = [];
  var base = (seed === undefined || seed === null) ? String(Date.now()) : String(seed);
  for (var i = 0; i < LADDER.length; i++) {
    var grade = LADDER[i];
    // 每段用独立子种子：同一次测试内各段不共享随机序列，换学段也换题
    var qs = quickQuiz.buildQuiz(grade, base + ':' + grade, PER_GRADE);
    for (var j = 0; j < qs.length; j++) {
      out.push({
        index: out.length,
        grade: grade,
        gradeLabel: labelOf(grade),
        lv: i + 1,
        word: qs[j].word,
        meaning: qs[j].meaning,
        sub: qs[j].sub,
        options: qs[j].options,
        answerKey: qs[j].answerKey
      });
    }
  }
  return out;
}

/**
 * 评分 + 推荐年级 + 估算词量。
 *
 * @param {Array<{grade:string, ok:boolean}>} answers 按答题顺序的作答记录
 * @returns {{
 *   grade: string,      // 推荐年级 key（会写进全局年级设置）
 *   gradeLabel: string, // 推荐年级名
 *   correct: number,    // 总答对数
 *   total: number,      // 总题数
 *   rate: number,       // 正确率（百分比整数）
 *   words: number,      // 估算词汇量
 *   verdict: string,    // 一句话评语
 *   rows: Array<{key:string,label:string,correct:number,total:number,pct:number}>
 * }}
 */
function scoreOf(answers) {
  var list = answers || [];

  // 一、按学段统计（没作答的段记 0/0，计入 rows 但不参与判定）
  var stat = {};
  for (var i = 0; i < LADDER.length; i++) {
    stat[LADDER[i]] = { correct: 0, total: 0 };
  }
  var correct = 0;
  for (var j = 0; j < list.length; j++) {
    var a = list[j] || {};
    var g = a.grade;
    if (!stat[g]) continue;
    stat[g].total++;
    if (a.ok) { stat[g].correct++; correct++; }
  }
  var total = list.length;
  var rate = total > 0 ? Math.round((correct / total) * 100) : 0;

  // 二、连续通过判定：从最易段往上走，某段「一题没对」就停在那里。
  //     这样「kg 全对但 g3 全错」的人会停在 kg，而不会被总分抬到三年级。
  var reachedIv = 0;
  for (var k = 0; k < LADDER.length; k++) {
    var s = stat[LADDER[k]];
    if (s.total === 0) break;
    if (s.correct >= 1) { reachedIv = k; continue; }
    break;
  }
  var recKey = LADDER[reachedIv];
  // 最高一段也过了 → 再往上推一档（初三全对的人不该还从初三开始）
  if (reachedIv === LADDER.length - 1) {
    var nextIv = gradeIndex(recKey) + 1;
    if (nextIv > 0 && nextIv < constants.GRADES.length) {
      recKey = constants.GRADES[nextIv].key;
    }
  }

  // 三、估算词量：
  //     实测学段按真实正确率折算；没测到的学段，低于推荐年级的算「已掌握」、
  //     高于推荐年级的算「还没到」。这样三年级孩子不会因为只测了 5 个学段
  //     而被算成一个明显偏小的数字（一年级、二年级的词他其实认得）。
  var rateOf = {};
  for (var m = 0; m < LADDER.length; m++) {
    var ss = stat[LADDER[m]];
    if (ss.total > 0) rateOf[LADDER[m]] = ss.correct / ss.total;
  }
  var recIdx = gradeIndex(recKey);
  var words = 0;
  for (var n = 0; n < constants.GRADES.length; n++) {
    var gk = constants.GRADES[n].key;
    var r;
    if (rateOf.hasOwnProperty(gk)) r = rateOf[gk];
    else r = n < recIdx ? 1 : 0;
    var cnt = 0;
    try { cnt = dict.loadByGrade(gk).length; } catch (e) { cnt = 0; }
    words += r * cnt;
  }
  words = Math.round(words);

  // 四、分学段小条（结果页展示「哪一段开始掉下去」）
  var rows = [];
  for (var p = 0; p < LADDER.length; p++) {
    var row = stat[LADDER[p]];
    rows.push({
      key: LADDER[p],
      label: labelOf(LADDER[p]),
      correct: row.correct,
      total: row.total,
      pct: row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0
    });
  }

  return {
    grade: recKey,
    gradeLabel: labelOf(recKey),
    correct: correct,
    total: total,
    rate: rate,
    words: words,
    verdict: verdictOf(rate),
    rows: rows
  };
}

/** 一句话评语：按正确率分档，避免「0 分也夸你」 */
function verdictOf(rate) {
  var r = Math.max(0, Math.min(100, parseInt(rate, 10) || 0));
  if (r >= 90) return '字词功底扎实';
  if (r >= 70) return '基础不错，再往上冲一冲';
  if (r >= 50) return '有几个学段还卡着';
  if (r > 0) return '先把低年级的词打牢';
  return '从最简单的开始，一样能打上去';
}

module.exports = {
  LADDER: LADDER,
  PER_GRADE: PER_GRADE,
  TOTAL: TOTAL,
  labelOf: labelOf,
  buildTest: buildTest,
  scoreOf: scoreOf,
  verdictOf: verdictOf
};
