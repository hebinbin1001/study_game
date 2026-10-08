/**
 * server/exam-gate.js —— 段位晋级考试的「星数封顶」计算（2026-10-08）
 *
 * 规则（用户 2026-10-08 拍板）：
 *   · 想从一个大段升到下一个大段，必须先通过一次**晋级考试**
 *     （用当前学段题库随机 10 题，**全对**才算过）；
 *   · 没通过 → **星星不再往上加**，人卡在当前大段的最高级，直到考过为止；
 *   · 可以立刻重考，不设冷却。
 *
 * 为什么用「封顶」而不是「不给加星」：
 *   星星是服务端按成绩重算的（rank-stars 的 dedupeStars 取每关历史最高星），
 *   谁也没法阻止它涨 —— 强行去改库里的数字，下一次重算就覆盖回来了。
 *   所以这里换一条路：**库里照常涨，对外展示的星数封顶**。
 *   段位、星数、排行榜统一走这个口径，三处就不会打架。
 *
 * 纯函数，有单测：tests/unit/exam-gate.test.js
 */
'use strict';

const ladder = require("./rank-ladder");

/**
 * 由「已通过考试的最高大段 key」算出允许到达的最大级别（1 基 cell）。
 *
 * 语义：通过「青铜」的考试 → 允许进入「白银」，也就是最多到白银 9；
 *       什么都没考过（NULL / 认不出）→ 只能待在第一个大段，最多青铜 9。
 *
 * @param {string} clearedTierKey users.exam_cleared_tier（可能是 null/空/脏值）
 * @returns {number} 允许的最大 cell（1 基）
 */
function maxCellFrom(clearedTierKey) {
  const key = String(clearedTierKey == null ? "" : clearedTierKey).trim();
  const idx = ladder.BIG_RANKS.map(function (r) { return r.key; }).indexOf(key);
  // 认不出（包括从没考过）→ 只能待在第 1 个大段
  if (idx < 0) return ladder.LEVELS_PER_RANK;
  // 通过第 idx 个大段（0 基）→ 允许进入下一个大段，即 (idx + 2) 个大段封顶
  return Math.min((idx + 2) * ladder.LEVELS_PER_RANK, ladder.TOTAL_CELLS);
}

/**
 * 当前该考哪个大段。
 *
 * 规则：**一档一档往上考**，不能跳级 —— 所以「下一个要考的」= 已通过的那一档的**下一个大段**；
 * 从没考过 → 第一个要考的是「青铜」；已经考到最顶 → 返回空串（不用再考）。
 *
 * @param {string} clearedTierKey 已通过考试的最高大段 key
 * @returns {string} 该考的大段 key；已到顶时返回空串
 */
function nextTierToExam(clearedTierKey) {
  const key = String(clearedTierKey == null ? "" : clearedTierKey).trim();
  const idx = ladder.BIG_RANKS.map(function (r) { return r.key; }).indexOf(key);
  // 没考过 → 先考第一个大段；已经考到倒数第二个大段及以上 → 没有下一个了
  const nextIdx = idx < 0 ? 0 : idx + 1;
  if (nextIdx >= ladder.BIG_RANKS.length) return "";
  return ladder.BIG_RANKS[nextIdx].key;
}

/**
 * 对外展示用的星数（封顶后的）。
 *
 * @param {number} stars 真实累计星数（服务端算出来的）
 * @param {string} clearedTierKey 已通过考试的最高大段 key
 * @returns {number} 封顶后的星数
 */
function cappedStars(stars, clearedTierKey) {
  const raw = Math.max(0, parseInt(stars, 10) || 0);
  const maxCell = maxCellFrom(clearedTierKey);
  // 卡在「最大 cell」这一级的**区间内**：区间上界是进入下一级所需星数 - 1
  const cap = maxCell >= ladder.TOTAL_CELLS
    ? Number.MAX_SAFE_INTEGER                       // 已经通关，不封顶
    : ladder.starsForCell(maxCell + 1) - 1;
  return Math.min(raw, cap);
}

/**
 * 当前是否卡在「待考试」状态（星数已经够进下一个大段，但还没考）。
 *
 * 用途：端上据此弹晋级考试的入口；不是卡着状态时不要打扰用户。
 *
 * @param {number} stars 真实累计星数
 * @param {string} clearedTierKey 已通过考试的最高大段 key
 * @returns {boolean}
 */
function needsExam(stars, clearedTierKey) {
  const raw = Math.max(0, parseInt(stars, 10) || 0);
  return raw > cappedStars(raw, clearedTierKey);
}

module.exports = {
  nextTierToExam: nextTierToExam,
  maxCellFrom: maxCellFrom,
  cappedStars: cappedStars,
  needsExam: needsExam
};
