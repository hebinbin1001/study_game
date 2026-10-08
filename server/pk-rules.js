/**
 * server/pk-rules.js —— 好友 PK（异步战帖）规则（纯函数，可单测）
 *
 * 玩法：A 打完一局生成「战帖」（题目种子 + A 的成绩），分享给 B；
 *       B 用**同一套题**打一遍，两边比正确率、再比用时。
 *
 * 为什么用异步战帖而不是实时对战（2026-10-08 拍板）：
 *   · 云托管上做长连接 + 实时匹配 + 掉线处理的成本与故障率都高；
 *   · 学生玩家同时在线概率低，实时匹配大概率空等。
 *
 * 加星规则：胜 +3、平 +1、负 0；**每人每天最多靠 PK 拿 10 星**（防刷）。
 * 奖励星不直接累加，而是落库后由段位重算（server/rank.js）按表求和 —— 与签到同一套哲学。
 */
'use strict';

var scoreFormula = require('./score-formula');

/** 单场胜负奖励星 */
var PK_REWARD = { win: 3, draw: 1, lose: 0 };
/** 每人每天靠 PK 最多拿到的星 */
var PK_DAILY_CAP = 10;
/** 战帖有效期（天）：过期不可应战 */
var PK_EXPIRE_DAYS = 7;

/**
 * 单份成绩的合法性归一化。
 * @param {Object} p { correct, total, ms }
 * @returns {{correct:number,total:number,ms:number}|null} 非法返回 null
 */
function normalizeScore(p) {
  var d = p || {};
  var correct = parseInt(d.correct, 10);
  var total = parseInt(d.total, 10);
  var ms = parseInt(d.ms, 10);
  if (!isFinite(correct) || !isFinite(total) || !isFinite(ms)) return null;
  if (total < 1 || total > 50) return null;
  if (correct < 0 || correct > total) return null;
  if (ms < 500 || ms > 3600000) return null;
  return { correct: correct, total: total, ms: ms };
}

/**
 * 胜负判定：先比正确率（用交叉相乘避免浮点误差），相同再比用时（少者胜）。
 * @param {{correct:number,total:number,ms:number}} a 发起方
 * @param {{correct:number,total:number,ms:number}} b 应战方
 * @returns {'challenger'|'opponent'|'draw'}
 */
function outcomeOf(a, b) {
  var left = (a.correct * b.total) - (b.correct * a.total);
  if (left > 0) return 'challenger';
  if (left < 0) return 'opponent';
  if (a.ms < b.ms) return 'challenger';
  if (a.ms > b.ms) return 'opponent';
  return 'draw';
}

/**
 * 某个结果对应的基础奖励星（发起方视角）。
 * @param {string} outcome 'challenger'|'opponent'|'draw'
 * @param {boolean} isChallenger 是否站在发起方视角
 * @returns {number}
 */
function rewardOf(outcome, isChallenger) {
  if (outcome === 'draw') return PK_REWARD.draw;
  var win = isChallenger ? 'challenger' : 'opponent';
  return outcome === win ? PK_REWARD.win : PK_REWARD.lose;
}

/**
 * 按「今天已获得的 PK 星」封顶。
 * @param {number} earnedToday 今天已通过 PK 获得的星
 * @param {number} want 本场应得星
 * @returns {number} 实际可发放星（0 ~ want）
 */
function capDaily(earnedToday, want) {
  var earned = Math.max(0, parseInt(earnedToday, 10) || 0);
  var remain = Math.max(0, PK_DAILY_CAP - earned);
  return Math.max(0, Math.min(parseInt(want, 10) || 0, remain));
}

/**
 * 展示用分数：正确数为主，用时越短加分越多（只用于排序展示，不参与胜负判定）。
 * @param {{correct:number,total:number,ms:number}} s
 * @returns {number}
 */
function scoreOf(s) {
  return scoreFormula.displayScore(s && s.correct, s && s.ms);
}

/** 战帖是否过期 */
function isExpired(createdAt, now) {
  var t = new Date(createdAt).getTime();
  if (!isFinite(t)) return false;
  var n = now === undefined || now === null ? Date.now() : new Date(now).getTime();
  return n - t > PK_EXPIRE_DAYS * 24 * 3600 * 1000;
}

module.exports = {
  PK_REWARD: PK_REWARD,
  PK_DAILY_CAP: PK_DAILY_CAP,
  PK_EXPIRE_DAYS: PK_EXPIRE_DAYS,
  normalizeScore: normalizeScore,
  outcomeOf: outcomeOf,
  rewardOf: rewardOf,
  capDaily: capDaily,
  scoreOf: scoreOf,
  isExpired: isExpired
};
